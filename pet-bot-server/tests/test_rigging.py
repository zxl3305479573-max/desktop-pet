import json
from app.providers.base import PoseResult, SegmentationResult
from app.services.rigging import build_skeleton
import numpy as np


def test_build_skeleton_produces_valid_json():
    pose = PoseResult(
        keypoints=[
            {"x": 100, "y": 50, "visibility": 0.9, "name": "joint_0"},
            {"x": 90, "y": 120, "visibility": 0.9, "name": "joint_11"},
            {"x": 110, "y": 120, "visibility": 0.9, "name": "joint_12"},
            {"x": 95, "y": 200, "visibility": 0.9, "name": "joint_23"},
            {"x": 105, "y": 200, "visibility": 0.9, "name": "joint_24"},
        ],
        image_width=200, image_height=400, confidence=0.85, passed=True,
    )
    seg = SegmentationResult(
        mask=np.ones((400, 200)),
        parts={"head": np.zeros((80, 60, 4), dtype=np.uint8), "torso": np.zeros((100, 60, 4), dtype=np.uint8)},
        part_count=2, passed=True,
    )

    result = build_skeleton(pose, seg)
    data = json.loads(result)

    assert "bones" in data
    assert len(data["bones"]) >= 4, f"Expected >=4 bones, got {len(data['bones'])}"
    assert "animations" in data
    for anim in ["idle", "walk", "poke"]:
        assert anim in data["animations"], f"Missing animation: {anim}"
    assert "slots" in data
    assert len(data["slots"]) >= 2
