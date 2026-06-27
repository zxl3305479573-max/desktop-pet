from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


# --- Legacy local-processing result types ---------------------------------
# Retained as pure data containers for the legacy services still imported by
# the test suite (atlas.py, rigging.py, pipeline.py). The active provider
# contract below uses the spritesheet methods, not these. Remove once the
# reviewed-sprite pipeline migration retires the legacy services.
# See: docs/superpowers/plans/2026-06-23-reviewed-sprite-generation.md
@dataclass
class PoseResult:
    keypoints: list[dict]
    image_width: int
    image_height: int
    confidence: float = 0.0
    passed: bool = False

    @property
    def keypoint_count(self) -> int:
        return len(self.keypoints)


@dataclass
class SegmentationResult:
    mask: Any
    parts: dict[str, Any]
    part_count: int = 0
    passed: bool = False


@dataclass
class RiggingResult:
    skeleton_json: str
    bone_count: int = 0
    rig_quality: str = "minimal"


@dataclass
class AtlasResult:
    atlas_png: bytes
    atlas_json: str
    preview_front: bytes
    region_count: int = 0
    passed: bool = False


class AIProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def generate_reference_sheet(self, photo_bytes: bytes) -> bytes: ...

    @abstractmethod
    def generate_action_sheets(
        self,
        photo_bytes: bytes,
        reference_sheet_bytes: bytes,
    ) -> dict[str, bytes]: ...
