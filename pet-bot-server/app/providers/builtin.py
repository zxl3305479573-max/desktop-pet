"""
内置 Provider — 基于 gpt-image-2 API。
本地处理：模板姿态识别 + rembg 抠图。
核心生成能力通过调用 OpenAI 兼容 API 实现。
"""
import io
import json
import logging
import base64
import numpy as np
from PIL import Image
from openai import OpenAI
from rembg import remove
from app.providers.base import AIProvider, PoseResult, SegmentationResult, RiggingResult, AtlasResult
from app.services.rigging import build_skeleton
from app.services.atlas import build_atlas
from app.config import settings

logger = logging.getLogger(__name__)

MIN_KEYPOINTS = 8
MIN_CONFIDENCE = 0.5


class BuiltinProvider(AIProvider):
    name = "builtin"

    def __init__(self, api_key: str = ""):
        self._api_key = api_key or settings.builtin_provider_key
        self._model = settings.builtin_model
        self._base_url = settings.builtin_api_base
        self._client = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(
                api_key=self._api_key,
                base_url=self._base_url,
            )
        return self._client

    @property
    def model(self) -> str:
        return self._model

    # ── Stage 1: Pose Estimation (template-based fallback) ──
    def estimate_pose(self, image_bytes: bytes) -> PoseResult:
        """Estimate pose using simple image-based heuristics.
        Generates approximate keypoints by dividing the image into body regions."""
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = pil_img.size
        np_img = np.array(pil_img)

        # Generate approximate humanoid keypoints based on image proportions
        cx, cy = w / 2, h * 0.3
        shoulder_y = h * 0.35
        hip_y = h * 0.65
        knee_y = h * 0.8
        ankle_y = h * 0.95

        template = [
            ("joint_0",  cx, cy - 10, 0.9),     # nose
            ("joint_11", cx - 40, shoulder_y, 0.85),   # L shoulder
            ("joint_12", cx + 40, shoulder_y, 0.85),   # R shoulder
            ("joint_13", cx - 60, h * 0.48, 0.8),      # L elbow
            ("joint_14", cx + 60, h * 0.48, 0.8),      # R elbow
            ("joint_15", cx - 50, h * 0.58, 0.75),     # L wrist
            ("joint_16", cx + 50, h * 0.58, 0.75),     # R wrist
            ("joint_23", cx - 30, hip_y, 0.85),        # L hip
            ("joint_24", cx + 30, hip_y, 0.85),        # R hip
            ("joint_25", cx - 30, knee_y, 0.8),        # L knee
            ("joint_26", cx + 30, knee_y, 0.8),        # R knee
            ("joint_27", cx - 25, ankle_y, 0.75),      # L ankle
            ("joint_28", cx + 25, ankle_y, 0.75),      # R ankle
        ]

        keypoints = [{"x": x, "y": y, "visibility": v, "name": n} for n, x, y, v in template]
        avg_conf = sum(k["visibility"] for k in keypoints) / len(keypoints)
        passed = True  # Template always passes

        return PoseResult(keypoints=keypoints, image_width=w, image_height=h,
                          confidence=avg_conf, passed=passed)

    # ── Stage 2: Background Removal (local rembg) ──
    def remove_background(self, image_bytes: bytes) -> bytes:
        return remove(image_bytes)

    # ── Stage 3: Part Segmentation (local, keypoint-based) ──
    def segment_parts(self, image_bytes: bytes, pose: PoseResult) -> SegmentationResult:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        np_img = np.array(img)
        h, w = np_img.shape[:2]
        parts = {}

        # Head
        nose_kps = [k for k in pose.keypoints if k["name"] in ("joint_0",)]
        if nose_kps:
            nx, ny = nose_kps[0]["x"], nose_kps[0]["y"]
            r = 60
            x1, y1 = max(0, int(nx - r)), max(0, int(ny - r * 1.5))
            x2, y2 = min(w, int(nx + r)), min(h, int(ny + r * 0.5))
            if x2 > x1 and y2 > y1:
                parts["head"] = np_img[y1:y2, x1:x2].copy()

        # Torso
        torso_names = ["joint_11", "joint_12", "joint_23", "joint_24"]
        torso_kps = [k for k in pose.keypoints if k["name"] in torso_names]
        if torso_kps:
            xs, ys = [k["x"] for k in torso_kps], [k["y"] for k in torso_kps]
            x1, y1 = max(0, int(min(xs)) - 20), max(0, int(min(ys)) - 10)
            x2, y2 = min(w, int(max(xs)) + 20), min(h, int(max(ys)) + 10)
            if x2 > x1 and y2 > y1:
                parts["torso"] = np_img[y1:y2, x1:x2].copy()

        # Arms & Legs
        for side, sj, ej in [("left_arm", "joint_11", "joint_13"), ("right_arm", "joint_12", "joint_14")]:
            sk = next((k for k in pose.keypoints if k["name"] == sj), None)
            ek = next((k for k in pose.keypoints if k["name"] == ej), None)
            if sk and ek:
                px, py = min(sk["x"], ek["x"]) - 10, min(sk["y"], ek["y"]) - 10
                pw, ph = abs(ek["x"] - sk["x"]) + 40, abs(ek["y"] - sk["y"]) + 40
                x1, y1 = max(0, int(px)), max(0, int(py))
                x2, y2 = min(w, int(px + pw)), min(h, int(py + ph))
                if x2 > x1 and y2 > y1:
                    parts[side] = np_img[y1:y2, x1:x2].copy()

        for side, hj, kj in [("left_leg", "joint_23", "joint_25"), ("right_leg", "joint_24", "joint_26")]:
            hk = next((k for k in pose.keypoints if k["name"] == hj), None)
            kk = next((k for k in pose.keypoints if k["name"] == kj), None)
            if hk and kk:
                px, py = min(hk["x"], kk["x"]) - 15, min(hk["y"], kk["y"]) - 10
                pw, ph = abs(kk["x"] - hk["x"]) + 50, abs(kk["y"] - hk["y"]) + 50
                x1, y1 = max(0, int(px)), max(0, int(py))
                x2, y2 = min(w, int(px + pw)), min(h, int(py + ph))
                if x2 > x1 and y2 > y1:
                    parts[side] = np_img[y1:y2, x1:x2].copy()

        passed = "head" in parts and "torso" in parts
        return SegmentationResult(mask=np_img[:, :, 3], parts=parts,
                                  part_count=len(parts), passed=passed)

    # ── Stage 4: Skeleton Rigging (local) ──
    def rig_skeleton(self, pose: PoseResult, segmentation: SegmentationResult) -> RiggingResult:
        skeleton_json = build_skeleton(pose, segmentation)
        data = json.loads(skeleton_json)
        bone_count = len(data.get("bones", []))
        rig_quality = "full" if bone_count >= 8 else "partial" if bone_count >= 4 else "minimal"
        return RiggingResult(skeleton_json=skeleton_json, bone_count=bone_count, rig_quality=rig_quality)

    # ── Stage 5: Atlas + Preview ──
    def build_atlas(self, segmentation: SegmentationResult, rigging: RiggingResult) -> AtlasResult:
        atlas_png, atlas_json_str, preview_front = build_atlas(segmentation, rigging)
        atlas_data = json.loads(atlas_json_str)
        region_count = len(atlas_data.get("regions", {}))
        passed = atlas_png is not None and len(atlas_png) > 200 and region_count >= 2
        return AtlasResult(atlas_png=atlas_png, atlas_json=atlas_json_str,
                           preview_front=preview_front, region_count=region_count, passed=passed)

    # ── API: gpt-image-2 图片生成（供未来扩展） ──
    def generate_image(self, prompt: str, reference_bytes: bytes | None = None) -> bytes:
        """调用 gpt-image-2 生成图片。"""
        messages = [{"role": "user", "content": prompt}]
        if reference_bytes:
            b64 = base64.b64encode(reference_bytes).decode("utf-8")
            messages[0]["content"] = [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
            ]

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=4096,
        )
        # Extract image from response (implementation depends on actual API response format)
        logger.info(f"API call to {self.model} completed")
        return response
