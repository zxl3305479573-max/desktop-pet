import logging
from datetime import date
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.models.quota import QuotaUsage
from app.config import settings
from app.providers.registry import get_provider
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


def check_and_increment_quota(user_id: str, provider: str, db: Session) -> bool:
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
