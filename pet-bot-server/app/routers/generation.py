import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.auth import get_current_user
from app.storage.local import storage
from app.schemas.generation import UploadResponse

router = APIRouter(prefix="/api/v1", tags=["generation"])


@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_photo(
    name: str = Form(default="My Pet"),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Unsupported file type. Use JPEG, PNG, or WebP.")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10 MB)")

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
        provider="builtin",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    return UploadResponse(pet_id=pet_id, job_id=job.id, status="queued")
