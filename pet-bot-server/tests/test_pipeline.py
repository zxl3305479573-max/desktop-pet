import io
import json
from PIL import Image
import numpy as np
from app.services.pipeline import _run_pipeline_sync, check_and_increment_quota
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.providers.registry import _providers
from app.providers.base import AIProvider, PoseResult, SegmentationResult, RiggingResult, AtlasResult


class MockProvider(AIProvider):
    """Fully working mock that passes all quality gates."""
    name = "mock"

    def estimate_pose(self, image_bytes):
        kps = [{"x": 100 + i * 10, "y": 50 + i * 30, "visibility": 0.9, "name": f"joint_{i}"}
               for i in range(12)]
        return PoseResult(keypoints=kps, image_width=200, image_height=400, confidence=0.9, passed=True)

    def remove_background(self, image_bytes):
        return image_bytes

    def segment_parts(self, image_bytes, pose):
        parts = {
            "head": (np.ones((60, 60, 4), dtype=np.uint8) * 255),
            "torso": (np.ones((100, 60, 4), dtype=np.uint8) * 200),
            "left_arm": (np.ones((80, 40, 4), dtype=np.uint8) * 150),
            "right_arm": (np.ones((80, 40, 4), dtype=np.uint8) * 150),
        }
        return SegmentationResult(mask=np.ones((400, 200)), parts=parts, part_count=4, passed=True)

    def rig_skeleton(self, pose, segmentation):
        skel = json.dumps({
            "bones": [{"name": "root"}, {"name": "spine", "parent": "root"},
                      {"name": "head", "parent": "spine"}, {"name": "left_arm", "parent": "spine"},
                      {"name": "right_arm", "parent": "spine"}],
            "animations": {"idle": {}, "walk": {}, "poke": {}}
        })
        return RiggingResult(skeleton_json=skel, bone_count=5, rig_quality="full")

    def build_atlas(self, segmentation, rigging):
        atlas_img = Image.new("RGBA", (512, 512), (255, 0, 0, 255))
        buf = io.BytesIO()
        atlas_img.save(buf, format="PNG")
        atlas_png = buf.getvalue()
        atlas_json = json.dumps({
            "image": "atlas.png", "size": {"w": 512, "h": 512},
            "regions": {"head": {"x": 0, "y": 0, "w": 60, "h": 60},
                        "torso": {"x": 64, "y": 0, "w": 60, "h": 100}}
        })
        preview_img = Image.new("RGBA", (60, 200), (100, 100, 100, 255))
        buf2 = io.BytesIO()
        preview_img.save(buf2, format="PNG")
        return AtlasResult(atlas_png=atlas_png, atlas_json=atlas_json, preview_front=buf2.getvalue(),
                           region_count=2, passed=True)


def _make_test_image_bytes() -> bytes:
    img = Image.new("RGB", (200, 400), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_pipeline_completes_with_mock_provider(db_session, test_user):
    _providers["mock"] = MockProvider()

    from app.storage.local import storage
    photo_path = storage.save_upload(_make_test_image_bytes(), "test_source.png")

    pet = Pet(id="pet-test-1", user_id=test_user.id, name="Mock Pet",
              status=PetStatus.UPLOADED, source_photo_path=photo_path)
    job = GenerationJob(id="job-test-1", user_id=test_user.id, pet_id=pet.id,
                        status=JobStatus.QUEUED, provider="mock")
    db_session.add(pet)
    db_session.add(job)
    db_session.commit()

    _run_pipeline_sync(db_session, job, pet)

    assert job.status == JobStatus.AWAITING_REVIEW, \
        f"Expected awaiting_review, got {job.status}: {job.error_message}"
    assert pet.status == PetStatus.AWAITING_REVIEW
    assert pet.rig_quality in ("full", "partial")
    assert pet.preview_front is not None
    assert pet.skeleton_json is not None

    skel = json.loads(pet.skeleton_json)
    assert len(skel["bones"]) >= 3
    assert "idle" in skel["animations"]


def test_quota_enforcement(db_session, test_user):
    for i in range(5):
        ok = check_and_increment_quota(test_user.id, "builtin", db_session)
        assert ok, f"Quota check {i} should pass"
    ok = check_and_increment_quota(test_user.id, "builtin", db_session)
    assert not ok, "6th generation should be blocked by quota"
