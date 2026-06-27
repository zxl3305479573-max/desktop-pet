import json
import io
from PIL import Image
from app.providers.base import SegmentationResult, RiggingResult
from app.services.atlas import build_atlas
import numpy as np


def test_build_atlas_produces_valid_output():
    seg = SegmentationResult(
        mask=np.ones((400, 200)),
        parts={
            "head": (np.ones((60, 60, 4), dtype=np.uint8) * 255).astype(np.uint8),
            "torso": (np.ones((100, 60, 4), dtype=np.uint8) * 200).astype(np.uint8),
        },
        part_count=2, passed=True,
    )
    rig = RiggingResult(skeleton_json="{}", bone_count=8, rig_quality="full")

    png_bytes, atlas_json_str, preview_bytes = build_atlas(seg, rig)

    assert len(png_bytes) > 200, f"atlas.png too small: {len(png_bytes)} bytes"
    img = Image.open(io.BytesIO(png_bytes))
    assert img.format == "PNG"
    assert img.size == (512, 512)

    atlas_data = json.loads(atlas_json_str)
    assert len(atlas_data["regions"]) >= 2

    assert len(preview_bytes) > 200
    preview_img = Image.open(io.BytesIO(preview_bytes))
    assert preview_img.format == "PNG"
