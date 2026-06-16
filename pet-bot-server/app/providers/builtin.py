"""
内置 Provider — 基于 gpt-image-2 API。
本地模型（MediaPipe + rembg）仅用于预处理（姿态识别、抠图），
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
        self._mp_pose = None
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

    def _get_mp_pose(self):
        if self._mp_pose is None:
            import mediapipe as mp
            self._mp_pose = mp.solutions.pose.Pose(
                static_image_mode=True, model_complexity=1, enable_segmentation=False)
        return self._mp_pose

    # ── Stage 1: Pose Estimation (local MediaPipe) ──
    def estimate_pose(self, image_bytes: bytes) -> PoseResult:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = pil_img.size
        np_img = np.array(pil_img)
        pose = self._get_mp_pose()
        results = pose.process(np_img)

        keypoints, confidences = [], []
        if results.pose_landmarks:
            for idx, lm in enumerate(results.pose_landmarks.landmark):
                keypoints.append({
                    "x": lm.x * w, "y": lm.y * h,
                    "visibility": lm.visibility, "name": f"joint_{idx}",
                })
                confidences.append(lm.visibility)

        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
        passed = len(keypoints) >= MIN_KEYPOINTS and avg_conf >= MIN_CONFIDENCE

        if not passed:
            logger.warning(f"Pose gate FAILED: {len(keypoints)} kp, conf {avg_conf:.2f}")

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
