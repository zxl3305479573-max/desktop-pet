import uuid
import io
import json as json_mod
import zipfile
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.auth import get_current_user
from app.storage.local import storage
from app.schemas.generation import UploadResponse, JobStatusResponse, ConfirmRequest

router = APIRouter(prefix="/api/v1", tags=["generation"])


@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_photo(
    name: str = Form(default="My Companion"),
    file: UploadFile = File(...),
    prompt: str = Form(default=""),
    provider: str = Form(default="builtin"),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Unsupported file type. Use JPEG, PNG, or WebP.")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10 MB)")

    # Credit check for builtin provider
    from app.services.pipeline import check_and_deduct_credits
    if provider == "builtin":
        cost = settings.credit_cost_per_generation
        ok = check_and_deduct_credits(
            user.id, provider, db,
            description=f"Generate: {name} ({cost} credits)",
        )
        if not ok:
            raise HTTPException(402, f"积分不足！需要 {cost} 积分，当前余额: {user.credits}")

    pet_id = str(uuid.uuid4())
    ext = allowed[file.content_type]
    photo_path = storage.save_upload(contents, f"{pet_id}_source.{ext}")

    pet = Pet(id=pet_id, user_id=user.id, name=name, status=PetStatus.UPLOADED, source_photo_path=photo_path)
    db.add(pet)

    job = GenerationJob(
        id=str(uuid.uuid4()),
        user_id=user.id,
        pet_id=pet_id,
        status=JobStatus.QUEUED,
        provider=provider,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    from app.services.pipeline import run_pipeline_background
    background_tasks.add_task(run_pipeline_background, job.id)

    return UploadResponse(pet_id=pet_id, job_id=job.id, status="queued")


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(GenerationJob).filter(
        GenerationJob.id == job_id, GenerationJob.user_id == user.id
    ).first()
    if not job:
        raise HTTPException(404, "Job not found")

    pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
    preview = pet.preview_front if pet else None

    return JobStatusResponse(
        job_id=job.id,
        pet_id=job.pet_id,
        status=job.status.value,
        stage_progress=job.stage_progress,
        error_message=job.error_message,
        failed_stage=job.failed_stage,
        preview_front=preview,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.post("/jobs/{job_id}/next")
def run_next_stage(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(GenerationJob).filter(
        GenerationJob.id == job_id, GenerationJob.user_id == user.id
    ).first()
    if not job:
        raise HTTPException(404, "Job not found")

    next_stage = job.stage_progress + 1
    if next_stage > 5:
        raise HTTPException(400, "All stages completed")

    from app.services.pipeline import run_single_stage
    result = run_single_stage(job_id, next_stage)

    if result.get("status") == "error":
        raise HTTPException(500, result.get("message", "Stage failed"))

    return result


@router.post("/jobs/{job_id}/confirm")
def confirm_job(
    job_id: str,
    body: ConfirmRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(GenerationJob).filter(
        GenerationJob.id == job_id, GenerationJob.user_id == user.id
    ).first()
    if not job:
        raise HTTPException(404, "Job not found")

    if body.action == "confirm":
        if job.status != JobStatus.AWAITING_REVIEW:
            raise HTTPException(400, f"Cannot confirm job in status: {job.status.value}")

        pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
        if not pet:
            raise HTTPException(404, "Pet not found")

        bundle_bytes = _build_pet_bundle(pet)
        bundle_path = storage.save_asset(bundle_bytes, pet.id, "bundle.pet")
        pet.asset_bundle_path = bundle_path
        pet.status = PetStatus.READY
        job.status = JobStatus.COMPLETED
        db.commit()

        return {"status": "completed", "pet_id": pet.id}

    elif body.action == "regenerate":
        if job.status not in (JobStatus.AWAITING_REVIEW, JobStatus.FAILED, JobStatus.NEEDS_BETTER_PHOTO):
            raise HTTPException(400, f"Cannot regenerate job in status: {job.status.value}")

        pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
        new_job = GenerationJob(
            id=str(uuid.uuid4()),
            user_id=user.id,
            pet_id=job.pet_id,
            status=JobStatus.QUEUED,
            provider=job.provider,
        )
        db.add(new_job)
        if pet:
            pet.status = PetStatus.UPLOADED
        db.commit()

        return {"status": "queued", "job_id": new_job.id}

    else:
        raise HTTPException(400, f"Unknown action: {body.action}")


@router.get("/download/{pet_id}")
def download_pet(
    pet_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet or not pet.asset_bundle_path:
        raise HTTPException(404, "Pet bundle not found")
    if pet.status != PetStatus.READY:
        raise HTTPException(400, f"Pet not ready (status: {pet.status.value})")

    bundle_path = Path(pet.asset_bundle_path)
    if not bundle_path.exists():
        raise HTTPException(404, "Bundle file missing")

    from app.validators.pet_bundle import validate_pet_bundle
    errors = validate_pet_bundle(bundle_path.read_bytes())
    if errors:
        raise HTTPException(500, f"Bundle validation failed: {'; '.join(errors)}")

    return FileResponse(bundle_path, filename=f"{pet.name}.pet", media_type="application/zip")


def _build_pet_bundle(pet: Pet) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        asset_dir = Path(settings.asset_dir) / pet.id
        for fname in ["skeleton.json", "atlas.png", "atlas.json", "preview_front.png"]:
            fpath = asset_dir / fname
            if fpath.exists():
                zf.write(fpath, fname)
        zf.writestr("metadata.json", json_mod.dumps({
            "name": pet.name,
            "pet_id": pet.id,
            "rig_quality": pet.rig_quality,
            "created_at": pet.created_at.isoformat() if pet.created_at else "",
        }))
    return buf.getvalue()
