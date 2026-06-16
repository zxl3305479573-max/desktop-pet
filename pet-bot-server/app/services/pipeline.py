import io
import json as _json
import logging
from io import BytesIO
from pathlib import Path
from datetime import date
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.models.quota import QuotaUsage
from app.models.user import User
from app.models.credit_transaction import CreditTransaction, TransactionType
from app.config import settings
from app.providers.registry import get_provider
from app.providers.base import PoseResult, SegmentationResult, RiggingResult
from app.storage.local import storage

logger = logging.getLogger(__name__)


def run_pipeline_background(job_id: str):
    """Entry point for BackgroundTasks. Sync wrapper."""
    db = SessionLocal()
    try:
        job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return
        pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
        if not pet:
            logger.error(f"Pet {job.pet_id} not found")
            return
        _run_pipeline_sync(db, job, pet)
    finally:
        db.close()


def _run_pipeline_sync(db: Session, job: GenerationJob, pet: Pet):
    provider = get_provider(job.provider)
    photo_bytes = storage.read(pet.source_photo_path)

    job.status = JobStatus.RUNNING
    pet.status = PetStatus.GENERATING
    db.commit()

    try:
        # Stage 1: Pose
        job.stage_progress = 1
        db.commit()
        pose = provider.estimate_pose(photo_bytes)
        if not pose.passed:
            job.status = JobStatus.NEEDS_BETTER_PHOTO
            job.error_message = (
                f"Pose detection failed: {pose.keypoint_count} keypoints, "
                f"confidence {pose.confidence:.2f}. Please upload a clear front-facing photo."
            )
            job.failed_stage = "pose_estimation"
            pet.status = PetStatus.FAILED
            pet.error_message = job.error_message
            db.commit()
            return

        # Stage 2: Background Removal
        job.stage_progress = 2
        db.commit()
        bg_removed = provider.remove_background(photo_bytes)

        # Stage 3: Part Segmentation
        job.stage_progress = 3
        db.commit()
        segmentation = provider.segment_parts(bg_removed, pose)

        # Stage 4: Skeleton Rigging
        job.stage_progress = 4
        db.commit()
        rigging = provider.rig_skeleton(pose, segmentation)
        pet.rig_quality = rigging.rig_quality

        # Stage 5: Atlas + Preview
        job.stage_progress = 5
        db.commit()
        atlas = provider.build_atlas(segmentation, rigging)
        if not atlas.passed:
            job.status = JobStatus.FAILED
            job.error_message = f"Atlas generation failed: {atlas.region_count} regions"
            job.failed_stage = "atlas"
            pet.status = PetStatus.FAILED
            pet.error_message = job.error_message
            db.commit()
            return

        # Save all assets
        storage.save_asset(atlas.atlas_png, pet.id, "atlas.png")
        storage.save_asset(atlas.atlas_json.encode("utf-8"), pet.id, "atlas.json")
        preview_path = storage.save_asset(atlas.preview_front, pet.id, "preview_front.png")
        storage.save_asset(rigging.skeleton_json.encode("utf-8"), pet.id, "skeleton.json")

        pet.skeleton_json = rigging.skeleton_json
        pet.preview_front = preview_path
        pet.status = PetStatus.AWAITING_REVIEW
        job.status = JobStatus.AWAITING_REVIEW
        db.commit()

    except Exception as e:
        logger.exception(f"Pipeline failed for job {job.id}")
        job.status = JobStatus.FAILED
        job.error_message = str(e)
        job.failed_stage = f"stage_{job.stage_progress}"
        pet.status = PetStatus.FAILED
        pet.error_message = str(e)
        db.commit()


def run_single_stage(job_id: str, stage_num: int) -> dict:
    """Run a single pipeline stage. Called by the step-by-step API.
    Returns a dict with stage result info for the frontend."""
    db = SessionLocal()
    try:
        job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
        if not job:
            return {"error": "Job not found"}
        pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
        if not pet:
            return {"error": "Pet not found"}

        provider = get_provider(job.provider)
        photo_bytes = storage.read(pet.source_photo_path)
        job.status = JobStatus.RUNNING
        pet.status = PetStatus.GENERATING
        db.commit()

        result = {"stage": stage_num, "status": "ok"}

        if stage_num == 1:
            pose = provider.estimate_pose(photo_bytes)
            if not pose.passed:
                job.status = JobStatus.NEEDS_BETTER_PHOTO
                job.error_message = f"识别到 {pose.keypoint_count} 个关键点，置信度 {pose.confidence:.2f}。请上传清晰的正面照片。"
                job.failed_stage = "pose_estimation"
                db.commit()
                return {"stage": 1, "status": "failed", "message": job.error_message,
                        "keypoints": pose.keypoint_count, "confidence": round(pose.confidence, 2)}
            # Save pose visualization
            pose_img = _draw_pose_overlay(photo_bytes, pose)
            path = storage.save_asset(pose_img, pet.id, "stage1_pose.png")
            result["preview"] = path
            result["keypoints"] = pose.keypoint_count
            result["confidence"] = round(pose.confidence, 2)
            # Save bg_removed for next stage
            bg_removed = provider.remove_background(photo_bytes)
            storage.save_asset(bg_removed, pet.id, "stage_bg_removed.png")

        elif stage_num == 2:
            bg_path = storage.get_asset_path(pet.id, "stage_bg_removed.png")
            bg_removed = storage.read(bg_path) if Path(bg_path).exists() else photo_bytes
            # Just show the bg-removed result
            result["preview"] = bg_path
            result["message"] = "背景已移除"

        elif stage_num == 3:
            bg_path = storage.get_asset_path(pet.id, "stage_bg_removed.png")
            bg_removed = storage.read(bg_path) if Path(bg_path).exists() else photo_bytes
            # Re-run pose for keypoints
            pose = provider.estimate_pose(photo_bytes)
            segmentation = provider.segment_parts(bg_removed, pose)
            # Draw segmentation visualization
            seg_img = _draw_segmentation(bg_removed, segmentation)
            path = storage.save_asset(seg_img, pet.id, "stage3_segmentation.png")
            result["preview"] = path
            result["parts"] = segmentation.part_count
            # Save segmentation data as pickled numpy (or save part images individually)
            for name, arr in segmentation.parts.items():
                from PIL import Image
                img = Image.fromarray(arr)
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                storage.save_asset(buf.getvalue(), pet.id, f"part_{name}.png")

        elif stage_num == 4:
            bg_path = storage.get_asset_path(pet.id, "stage_bg_removed.png")
            bg_removed = storage.read(bg_path) if Path(bg_path).exists() else photo_bytes
            pose = provider.estimate_pose(photo_bytes)
            segmentation = provider.segment_parts(bg_removed, pose)
            rigging = provider.rig_skeleton(pose, segmentation)
            pet.rig_quality = rigging.rig_quality
            # Save skeleton
            storage.save_asset(rigging.skeleton_json.encode("utf-8"), pet.id, "skeleton.json")
            pet.skeleton_json = rigging.skeleton_json
            # Draw skeleton preview
            skel_img = _draw_skeleton_overlay(photo_bytes, rigging.skeleton_json)
            path = storage.save_asset(skel_img, pet.id, "stage4_skeleton.png")
            result["preview"] = path
            result["bones"] = rigging.bone_count
            result["rig_quality"] = rigging.rig_quality

        elif stage_num == 5:
            bg_path = storage.get_asset_path(pet.id, "stage_bg_removed.png")
            bg_removed = storage.read(bg_path) if Path(bg_path).exists() else photo_bytes
            pose = provider.estimate_pose(photo_bytes)
            segmentation = provider.segment_parts(bg_removed, pose)
            rigging_json = pet.skeleton_json or "{}"
            import json as _json
            rigging_data = _json.loads(rigging_json)
            from app.providers.base import RiggingResult
            rigging = RiggingResult(
                skeleton_json=rigging_json,
                bone_count=len(rigging_data.get("bones", [])),
                rig_quality=pet.rig_quality or "partial",
            )
            atlas = provider.build_atlas(segmentation, rigging)
            if not atlas.passed:
                job.status = JobStatus.FAILED
                job.error_message = "Atlas 生成失败"
                db.commit()
                return {"stage": 5, "status": "failed", "message": job.error_message}

            storage.save_asset(atlas.atlas_png, pet.id, "atlas.png")
            storage.save_asset(atlas.atlas_json.encode("utf-8"), pet.id, "atlas.json")
            preview_path = storage.save_asset(atlas.preview_front, pet.id, "preview_front.png")
            pet.preview_front = preview_path
            result["preview"] = preview_path

            pet.status = PetStatus.AWAITING_REVIEW
            job.status = JobStatus.AWAITING_REVIEW

        job.stage_progress = stage_num
        db.commit()
        return result
    except Exception as e:
        logger.exception(f"Stage {stage_num} failed for job {job_id}")
        return {"stage": stage_num, "status": "error", "message": str(e)}
    finally:
        db.close()


def _draw_pose_overlay(image_bytes: bytes, pose) -> bytes:
    from PIL import Image, ImageDraw
    img = Image.open(BytesIO(image_bytes)).convert("RGBA")
    draw = ImageDraw.Draw(img)
    for kp in pose.keypoints:
        if kp.get("visibility", 0) > 0.5:
            x, y = kp["x"], kp["y"]
            draw.ellipse([x-4, y-4, x+4, y+4], fill=(0, 255, 0, 200), outline=(0, 200, 0, 255))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _draw_segmentation(image_bytes: bytes, segmentation) -> bytes:
    from PIL import Image, ImageDraw
    img = Image.open(BytesIO(image_bytes)).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    colors = {"head": (255, 0, 0, 80), "torso": (0, 255, 0, 80),
              "left_arm": (0, 0, 255, 80), "right_arm": (0, 0, 255, 80),
              "left_leg": (255, 255, 0, 80), "right_leg": (255, 255, 0, 80)}
    # Draw colored bounding boxes based on part positions in atlas
    y_off = 20
    for name, color in colors.items():
        if name in segmentation.parts:
            draw.rectangle([10, y_off, 110, y_off + 60], fill=color, outline=(255, 255, 255, 200))
            # Label
            y_off += 70
    img = Image.alpha_composite(img, overlay)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _draw_skeleton_overlay(image_bytes: bytes, skeleton_json: str) -> bytes:
    from PIL import Image, ImageDraw
    import json
    img = Image.open(BytesIO(image_bytes)).convert("RGBA")
    draw = ImageDraw.Draw(img)
    data = json.loads(skeleton_json)
    bones = {b["name"]: b for b in data.get("bones", [])}
    for b in data.get("bones", []):
        if b["parent"] and b["parent"] in bones:
            p = bones[b["parent"]]
            draw.line([(p["x"], p["y"]), (b["x"], b["y"])], fill=(255, 100, 100, 200), width=2)
        draw.ellipse([b["x"]-3, b["y"]-3, b["x"]+3, b["y"]+3], fill=(255, 50, 50, 200))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def check_and_deduct_credits(user_id: str, provider: str, db: Session, description: str = "") -> bool:
    """For builtin provider: check if user has enough credits, deduct if yes.
    Returns True if deduction succeeded, False if insufficient credits."""
    if provider != "builtin":
        return True  # Custom API key — user pays their own provider

    cost = settings.credit_cost_per_generation
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    if user.credits < cost:
        return False

    user.credits -= cost
    txn = CreditTransaction(
        user_id=user_id,
        type=TransactionType.CONSUME,
        amount=-cost,
        balance_after=user.credits,
        description=description or f"Generation cost: {cost} credits",
    )
    db.add(txn)
    db.commit()
    return True


def add_credits(user_id: str, amount: int, db: Session, description: str = "Recharge") -> int:
    """Add credits to user account. Returns new balance."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")
    user.credits += amount
    txn = CreditTransaction(
        user_id=user_id,
        type=TransactionType.RECHARGE,
        amount=amount,
        balance_after=user.credits,
        description=description,
    )
    db.add(txn)
    db.commit()
    return user.credits


def check_and_increment_quota(user_id: str, provider: str, db: Session) -> bool:
    """Deprecated — use check_and_deduct_credits instead."""
    """Return True if user is within quota. Increments count on success."""
    today = date.today()
    quota = db.query(QuotaUsage).filter(
        QuotaUsage.user_id == user_id,
        QuotaUsage.provider == provider,
        QuotaUsage.usage_date == today,
    ).first()

    if quota:
        if quota.job_count >= settings.max_free_generations:
            return False
        quota.job_count += 1
    else:
        quota = QuotaUsage(user_id=user_id, provider=provider, job_count=1, usage_date=today)
        db.add(quota)
    db.commit()
    return True
