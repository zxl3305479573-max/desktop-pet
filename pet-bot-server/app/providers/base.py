from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


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
    def estimate_pose(self, image_bytes: bytes) -> PoseResult: ...

    @abstractmethod
    def remove_background(self, image_bytes: bytes) -> bytes: ...

    @abstractmethod
    def segment_parts(self, image_bytes: bytes, pose: PoseResult) -> SegmentationResult: ...

    @abstractmethod
    def rig_skeleton(self, pose: PoseResult, segmentation: SegmentationResult) -> RiggingResult: ...

    @abstractmethod
    def build_atlas(self, segmentation: SegmentationResult, rigging: RiggingResult) -> AtlasResult: ...
