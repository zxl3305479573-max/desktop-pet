import json
import logging
from io import BytesIO

from PIL import Image

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.providers.registry import get_provider
from app.services.action_frames import build_action_frame_assets, extract_action_frames
from app.storage.local import storage

logger = logging.getLogger(__name__)

# The reviewed three-step spritesheet flow:
#   1. reference  — generate the three-view character sheet (doubles as the idle sheet)
#   2. actions    — generate the action spritesheets, conditioned on the reference
#   3. package    — slice frames, build the manifest, write the bundle assets
ACTION_NAMES = ["dragged", "eating", "sleep", "petting"]
ALL_ANIMATIONS = ["idle", *ACTION_NAMES]


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/")


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


# --- Stage implementations -------------------------------------------------
# Each helper mutates the passed-in `pet` (and does file I/O via `storage`);
# the caller owns the db session and commits.

def _run_reference_stage(pet: Pet, provider, photo_bytes: bytes) -> dict:
    """Stage 1 — three-view reference sheet, saved as the idle spritesheet."""
    reference_sheet = provider.generate_reference_sheet(photo_bytes)
    path = storage.save_asset(reference_sheet, pet.id, "spritesheet_idle.png")
    return {
        "stage": 1,
        "status": "ok",
        "sprite_type": "reference_sheet",
        "preview": _normalize_path(path),
    }


def _run_actions_stage(pet: Pet, provider, photo_bytes: bytes) -> dict:
    """Stage 2 — action spritesheets, conditioned on the approved reference."""
    reference_sheet = storage.read(storage.get_asset_path(pet.id, "spritesheet_idle.png"))
    sheets = provider.generate_action_sheets(photo_bytes, reference_sheet_bytes=reference_sheet)

    previews: dict[str, list[str]] = {}
    frame_counts: dict[str, int] = {}
    for name in ACTION_NAMES:
        storage.save_asset(sheets[name], pet.id, f"spritesheet_{name}.png")

        # Extract every individual character pose from the sprite sheet and
        # save each one as a standalone frame so the frontend can show all
        # poses, not just the first frame.
        frames = extract_action_frames(name, sheets[name], expected_count=4)
        if frames:
            frame_urls: list[str] = []
            for idx, frame in enumerate(frames):
                frame_rel = f"frames_preview/{name}/frame-{idx}.png"
                storage.save_asset(frame.png_bytes, pet.id, frame_rel)
                frame_urls.append(
                    storage.get_asset_path(pet.id, frame_rel).replace("\\", "/")
                )
            previews[name] = frame_urls
            frame_counts[name] = len(frames)
        else:
            # Fallback: show the full spritesheet if no frames were extracted.
            fallback_rel = f"spritesheet_{name}.png"
            previews[name] = [
                storage.get_asset_path(pet.id, fallback_rel).replace("\\", "/")
            ]
            frame_counts[name] = 0

    return {
        "stage": 2,
        "status": "ok",
        "sprite_type": "action_pack",
        "previews": previews,
        "frame_counts": frame_counts,
        "animations": list(previews.keys()),
    }


def _run_package_stage(pet: Pet) -> dict:
    """Stage 3 — slice frames, build the manifest, write bundle assets."""
    reference_sheet = storage.read(storage.get_asset_path(pet.id, "spritesheet_idle.png"))
    action_sheets = {
        name: storage.read(storage.get_asset_path(pet.id, f"spritesheet_{name}.png"))
        for name in ACTION_NAMES
    }

    frame_files, manifest = build_action_frame_assets(reference_sheet, action_sheets)
    for rel_path, data in frame_files.items():
        storage.save_asset(data, pet.id, rel_path)
    storage.save_asset(json.dumps(manifest).encode("utf-8"), pet.id, "manifest.json")

    idle_frame = frame_files.get("frames/idle/frame-0.png") or next(iter(frame_files.values()))
    preview_path = storage.save_asset(idle_frame, pet.id, "preview_front.png")

    # Compatibility artifacts: the desktop-pet renderer is frame/manifest-based
    # and ignores these, but the bundle validator (and the legacy bone fallback)
    # still expect a skeleton + atlas. Kept minimal until the validator is
    # retired. See docs/superpowers/plans/2026-06-23-reviewed-sprite-generation.md
    skeleton_json = _compat_skeleton()
    storage.save_asset(skeleton_json.encode("utf-8"), pet.id, "skeleton.json")
    atlas_png, atlas_json = _compat_atlas(idle_frame)
    storage.save_asset(atlas_png, pet.id, "atlas.png")
    storage.save_asset(atlas_json.encode("utf-8"), pet.id, "atlas.json")

    pet.skeleton_json = skeleton_json
    pet.preview_front = preview_path
    pet.status = PetStatus.AWAITING_REVIEW

    return {
        "stage": 3,
        "status": "ok",
        "sprite_type": "spritesheet_bundle",
        "preview": _normalize_path(preview_path),
        "animations": list(manifest.get("animations", {}).keys()),
    }


def _compat_skeleton() -> str:
    """Minimal skeleton JSON for bundle-validator compatibility (>=4 bones, idle)."""
    skeleton = {
        "skeleton": {"spine": "4.1.0", "width": 256, "height": 256},
        "bones": [
            {"name": "root"},
            {"name": "body", "parent": "root"},
            {"name": "head", "parent": "body"},
            {"name": "left_arm", "parent": "body"},
            {"name": "right_arm", "parent": "body"},
        ],
        "slots": [],
        "skins": {"default": {}},
        "animations": {name: {} for name in ALL_ANIMATIONS},
    }
    return json.dumps(skeleton)


def _compat_atlas(frame_png: bytes) -> tuple[bytes, str]:
    """Minimal atlas PNG + JSON (>=2 regions) for bundle-validator compatibility."""
    frame = Image.open(BytesIO(frame_png)).convert("RGBA")
    width, height = frame.size
    atlas = Image.new("RGBA", (width * 2, height), (0, 0, 0, 0))
    atlas.alpha_composite(frame, (0, 0))
    atlas.alpha_composite(frame, (width, 0))
    buf = BytesIO()
    atlas.save(buf, format="PNG")
    atlas_json = json.dumps({
        "image": "atlas.png",
        "size": {"w": width * 2, "h": height},
        "regions": {
            "idle_0": {"x": 0, "y": 0, "w": width, "h": height},
            "idle_1": {"x": width, "y": 0, "w": width, "h": height},
        },
    })
    return buf.getvalue(), atlas_json


# --- Orchestration ---------------------------------------------------------

def _run_pipeline_sync(db: Session, job: GenerationJob, pet: Pet):
    """Run all three stages end-to-end (non-reviewed path / tests)."""
    provider = get_provider(job.provider)
    photo_bytes = storage.read(pet.source_photo_path)

    job.status = JobStatus.RUNNING
    pet.status = PetStatus.GENERATING
    db.commit()

    try:
        job.stage_progress = 1
        db.commit()
        _run_reference_stage(pet, provider, photo_bytes)

        job.stage_progress = 2
        db.commit()
        _run_actions_stage(pet, provider, photo_bytes)

        job.stage_progress = 3
        db.commit()
        _run_package_stage(pet)
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

        if stage_num == 1:
            result = _run_reference_stage(pet, provider, photo_bytes)
        elif stage_num == 2:
            result = _run_actions_stage(pet, provider, photo_bytes)
        elif stage_num == 3:
            result = _run_package_stage(pet)
            job.status = JobStatus.AWAITING_REVIEW
        else:
            return {"stage": stage_num, "status": "error", "message": f"Unknown stage {stage_num}"}

        job.stage_progress = stage_num
        db.commit()
        return result
    except Exception as e:
        logger.exception(f"Stage {stage_num} failed for job {job_id}")
        return {"stage": stage_num, "status": "error", "message": str(e)}
    finally:
        db.close()
