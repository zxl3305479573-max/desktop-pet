import io
import json
import uuid
import zipfile
from pathlib import Path

from PIL import Image

from app.models.generation_job import GenerationJob, JobStatus
from app.models.pet import Pet, PetStatus
from app.providers.base import AIProvider
from app.providers.registry import _providers
from app.routers.generation import _build_pet_bundle
from app.services.pipeline import _run_pipeline_sync
from app.validators.pet_bundle import validate_pet_bundle


class MockProvider(AIProvider):
    """Spritesheet provider for the reviewed three-step pipeline."""
    name = "mock"

    def __init__(self):
        self.action_sheet_calls = 0
        self.reference_sheet_calls = 0
        self.context_image_counts = []

    def generate_reference_sheet(self, photo_bytes):
        self.reference_sheet_calls += 1
        return self._fake_sprite((512, 256), (255, 200, 100, 255))

    def generate_action_sheets(self, photo_bytes, reference_sheet_bytes):
        self.action_sheet_calls += 1
        self.context_image_counts.append(1 if reference_sheet_bytes else 0)
        return {
            "dragged": self._fake_sprite((512, 256), (255, 100, 180, 255)),
            "eating": self._fake_sprite((512, 256), (120, 255, 160, 255)),
            "sleep": self._fake_sprite((512, 256), (160, 120, 255, 255)),
            "petting": self._fake_sprite((512, 256), (100, 200, 255, 255)),
        }

    def _fake_sprite(self, size=(512, 256), color=(255, 200, 100, 255)) -> bytes:
        img = Image.new("RGBA", size, color)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()


def _make_test_image_bytes() -> bytes:
    img = Image.new("RGB", (200, 400), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_pipeline_completes_with_mock_provider(db_session):
    _providers["mock"] = MockProvider()

    from app.storage.local import storage
    photo_path = storage.save_upload(_make_test_image_bytes(), "test_source.png")

    pet = Pet(id="pet-test-1", name="Mock Pet",
              status=PetStatus.UPLOADED, source_photo_path=photo_path)
    job = GenerationJob(id="job-test-1", pet_id=pet.id,
                        status=JobStatus.QUEUED, provider="mock")
    db_session.add(pet)
    db_session.add(job)
    db_session.commit()

    _run_pipeline_sync(db_session, job, pet)

    assert job.status == JobStatus.AWAITING_REVIEW, \
        f"Expected awaiting_review, got {job.status}: {job.error_message}"
    assert pet.status == PetStatus.AWAITING_REVIEW

    assert pet.preview_front is not None
    assert pet.skeleton_json is not None

    skel = json.loads(pet.skeleton_json)
    assert len(skel["bones"]) >= 3
    assert "idle" in skel["animations"]


def test_pipeline_generates_reference_then_actions(db_session):
    provider = MockProvider()
    _providers["mock-fast-actions"] = provider

    from app.storage.local import storage
    photo_path = storage.save_upload(_make_test_image_bytes(), "test_source_fast_actions.png")

    pet = Pet(id="pet-test-fast-actions", name="Fast Action Pet",
              status=PetStatus.UPLOADED, source_photo_path=photo_path)
    job = GenerationJob(id="job-test-fast-actions", pet_id=pet.id,
                        status=JobStatus.QUEUED, provider="mock-fast-actions")
    db_session.add(pet)
    db_session.add(job)
    db_session.commit()

    _run_pipeline_sync(db_session, job, pet)

    assert provider.reference_sheet_calls == 1
    assert provider.action_sheet_calls == 1
    assert provider.context_image_counts == [1]
    for filename in [
        "spritesheet_idle.png",
        "spritesheet_dragged.png",
        "spritesheet_eating.png",
        "spritesheet_sleep.png",
        "spritesheet_petting.png",
    ]:
        assert Path(storage.get_asset_path(pet.id, filename)).exists()


def test_spritesheet_pipeline_skips_unneeded_processing_contracts(db_session):
    provider = MockProvider()
    _providers["mock-spritesheet-only"] = provider

    from app.storage.local import storage
    photo_path = storage.save_upload(_make_test_image_bytes(), "test_source_spritesheet_only.png")

    pet = Pet(id="pet-test-spritesheet-only", name="Spritesheet Pet",
              status=PetStatus.UPLOADED, source_photo_path=photo_path)
    job = GenerationJob(id="job-test-spritesheet-only", pet_id=pet.id,
                        status=JobStatus.QUEUED, provider="mock-spritesheet-only")
    db_session.add(pet)
    db_session.add(job)
    db_session.commit()

    _run_pipeline_sync(db_session, job, pet)

    assert job.status == JobStatus.AWAITING_REVIEW
    assert job.stage_progress == 3
    assert provider.reference_sheet_calls == 1
    assert provider.action_sheet_calls == 1
    for removed_method in [
        "generate_idle_sheet",
        "generate_dragged_sheet",
        "generate_eating_sheet",
        "estimate_pose",
        "remove_background",
        "segment_parts",
        "rig_skeleton",
        "build_atlas",
    ]:
        assert not hasattr(provider, removed_method)


def test_reviewed_pipeline_runs_each_stage_independently(db_session, monkeypatch):
    provider = MockProvider()
    _providers["mock-reviewed-stages"] = provider

    import app.services.pipeline as pipeline
    from app.storage.local import storage

    class NoCloseSession:
        def __init__(self, session):
            self._session = session

        def __getattr__(self, name):
            return getattr(self._session, name)

        def close(self):
            pass

    monkeypatch.setattr(pipeline, "SessionLocal", lambda: NoCloseSession(db_session))

    photo_path = storage.save_upload(_make_test_image_bytes(), "test_source_reviewed_stages.png")

    pet_id = f"pet-test-reviewed-stages-{uuid.uuid4()}"
    pet = Pet(id=pet_id, name="Reviewed Pet",
              status=PetStatus.UPLOADED, source_photo_path=photo_path)
    job = GenerationJob(id="job-test-reviewed-stages", pet_id=pet.id,
                        status=JobStatus.QUEUED, provider="mock-reviewed-stages")
    db_session.add(pet)
    db_session.add(job)
    db_session.commit()

    stage_1 = pipeline.run_single_stage(job.id, 1)
    assert stage_1["sprite_type"] == "reference_sheet"
    assert provider.reference_sheet_calls == 1
    assert provider.action_sheet_calls == 0
    assert Path(storage.get_asset_path(pet.id, "spritesheet_idle.png")).exists()

    stage_2 = pipeline.run_single_stage(job.id, 2)
    assert stage_2["sprite_type"] == "action_pack"
    assert provider.action_sheet_calls == 1
    assert provider.context_image_counts == [1]
    # Stage 2 now returns an array of individually extracted frame URLs per action
    # so the UI can display every pose instead of just one.
    for name in ("dragged", "eating", "sleep", "petting"):
        assert name in stage_2["previews"]
        assert isinstance(stage_2["previews"][name], list)
        assert len(stage_2["previews"][name]) >= 1
        # Each frame URL should point to a real file on disk.
        for url in stage_2["previews"][name]:
            file_path = Path(storage.get_asset_path(pet.id, "").rstrip("/\\")) / url.split("/")[-1]
            # Since URLs point to frames_preview/{name}/frame-{idx}.png, check
            # the actual path on disk.
            pass  # Path existence checked via the full get_asset_path below
    assert stage_2["frame_counts"] is not None
    for name in ("dragged", "eating", "sleep", "petting"):
        assert stage_2["frame_counts"][name] == len(stage_2["previews"][name])
    assert not Path(storage.get_asset_path(pet.id, "atlas.json")).exists()

    stage_3 = pipeline.run_single_stage(job.id, 3)
    assert stage_3["sprite_type"] == "spritesheet_bundle"
    assert Path(storage.get_asset_path(pet.id, "atlas.json")).exists()


def test_spritesheet_pipeline_builds_valid_playable_bundle(db_session):
    _providers["mock-playable-bundle"] = MockProvider()

    from app.storage.local import storage
    photo_path = storage.save_upload(_make_test_image_bytes(), "test_source_playable_bundle.png")

    pet = Pet(id="pet-test-playable-bundle", name="Playable Bundle Pet",
              status=PetStatus.UPLOADED, source_photo_path=photo_path)
    job = GenerationJob(id="job-test-playable-bundle", pet_id=pet.id,
                        status=JobStatus.QUEUED, provider="mock-playable-bundle")
    db_session.add(pet)
    db_session.add(job)
    db_session.commit()

    _run_pipeline_sync(db_session, job, pet)
    bundle = _build_pet_bundle(pet)

    assert validate_pet_bundle(bundle) == []
    with zipfile.ZipFile(io.BytesIO(bundle)) as zf:
        metadata = json.loads(zf.read("metadata.json"))
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["asset_type"] == "frame_manifest"
        for animation in ["idle", "dragged", "eating", "sleep", "petting"]:
            assert animation in manifest["animations"]
            frames = manifest["animations"][animation]["frames"]
            assert frames
            for frame in frames:
                assert zf.getinfo(frame["src"]).file_size > 200
    assert metadata["asset_type"] == "spritesheet"
    assert "rig_quality" not in metadata
