"""Built-in provider based on an OpenAI-compatible image API."""
import base64
import io
import json
import logging
import re
import urllib.request

import numpy as np
from openai import OpenAI
from PIL import Image

from app.config import settings
from app.providers.base import AIProvider

logger = logging.getLogger(__name__)


def normalize_openai_base_url(base_url: str) -> str:
    base = (base_url or "https://api.openai.com/v1").strip().rstrip("/")
    if not base.endswith("/v1"):
        base = f"{base}/v1"
    return base


def extract_image_bytes(response) -> bytes:
    """Extract image bytes from common OpenAI-compatible image responses."""
    image = _find_image_value(response)
    if image is None:
        logger.warning("AI image response contained no image data: %s", _summarize_response(response))
        if response == "":
            raise ValueError(
                "API 返回空内容。请确认 BUILTIN_API_BASE 使用 OpenAI 兼容的 /v1 地址，"
                "并确认当前 API Key 拥有可用的图片生成模型通道。"
            )
        raise ValueError(
            f"No image data found in API response. Response type: {type(response)}, "
            f"preview: {_summarize_response(response)}"
        )
    return _image_value_to_bytes(image)


def _find_image_value(value):
    if value is None:
        return None
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        embedded = _extract_embedded_image_string(stripped)
        if embedded is not None:
            return embedded
        if _looks_like_image_string(stripped):
            return stripped
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                return _find_image_value(json.loads(stripped))
            except json.JSONDecodeError:
                return None
        return None
    if isinstance(value, dict):
        for key in ("b64_json", "image"):
            direct = value.get(key)
            if direct:
                return direct
        found = _find_image_value(value.get("url"))
        if found is not None:
            return found
        image_url = value.get("image_url")
        if isinstance(image_url, dict):
            found = _find_image_value(image_url.get("url"))
            if found is not None:
                return found
        for key in ("data", "content", "choices", "message", "output"):
            found = _find_image_value(value.get(key))
            if found is not None:
                return found
        return None
    if isinstance(value, (list, tuple)):
        for item in value:
            found = _find_image_value(item)
            if found is not None:
                return found
        return None
    if hasattr(value, "model_dump"):
        try:
            found = _find_image_value(value.model_dump())
            if found is not None:
                return found
        except Exception:
            pass
    for attr in ("b64_json", "image", "url", "data", "content", "choices", "message", "output"):
        if hasattr(value, attr):
            found = _find_image_value(getattr(value, attr))
            if found is not None:
                return found
    return None


def _extract_embedded_image_string(value: str) -> str | None:
    data_url = re.search(r"data:image/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+", value)
    if data_url:
        return data_url.group(0)

    url = re.search(r"https?://\S+", value)
    if url:
        return url.group(0).rstrip(").,]\"'")

    json_match = re.search(r"(\{.*\}|\[.*\])", value, flags=re.DOTALL)
    if json_match:
        try:
            found = _find_image_value(json.loads(json_match.group(1)))
            if found is not None:
                return found
        except json.JSONDecodeError:
            pass

    return None


def _looks_like_image_string(value: str) -> bool:
    if value.startswith("data:image"):
        return True
    if value.startswith("http://") or value.startswith("https://"):
        return True
    if len(value) > 100 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", value):
        return True
    return False


def _summarize_response(response) -> str:
    text = repr(response)
    text = re.sub(
        r"data:image/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+",
        "data:image/...;base64,[omitted]",
        text,
    )
    if len(text) > 500:
        text = text[:500] + "...[truncated]"
    return text


def _image_value_to_bytes(value) -> bytes:
    if isinstance(value, bytes):
        return value
    if not isinstance(value, str):
        raise ValueError(f"Unsupported image value type: {type(value)}")
    value = value.strip()
    if value.startswith("data:image"):
        _, b64_data = value.split(",", 1)
        return base64.b64decode(b64_data)
    if value.startswith("http://") or value.startswith("https://"):
        with urllib.request.urlopen(value, timeout=60) as res:
            return res.read()
    return base64.b64decode(value)


def _to_actionable_generation_error(error: Exception, model: str) -> ValueError:
    text = str(error)
    if "model_not_found" in text or "No available channel" in text:
        return ValueError(
            f"当前 API Key 没有可用的图片生成模型通道：{model}。"
            "请在服务商后台开通图片模型，或把 BUILTIN_MODEL 改成该 Key 可用的图片生成模型。"
        )
    return ValueError(f"AI 图片接口调用失败：{text}")


class BuiltinProvider(AIProvider):
    name = "builtin"

    def __init__(self, api_key: str = ""):
        from app.config import runtime_config

        # Runtime config takes precedence, then explicit arg, then .env default
        rt_api_key = runtime_config.api_key
        rt_base_url = runtime_config.api_base_url
        rt_model = runtime_config.model

        self._api_key = api_key or rt_api_key or settings.builtin_provider_key
        resolved_base = rt_base_url or settings.builtin_api_base
        self._model = rt_model or settings.builtin_model
        self._base_url = normalize_openai_base_url(resolved_base)
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

    def generate_image(
        self,
        prompt: str,
        photo_bytes: bytes | None = None,
        context_images: list[bytes] | None = None,
    ) -> bytes:
        """Generate one image, optionally using reference images."""
        if photo_bytes or context_images:
            image_inputs = []
            for index, raw in enumerate([photo_bytes, *(context_images or [])]):
                if not raw:
                    continue
                image = io.BytesIO(raw)
                image.name = f"reference-{index}.png"
                image_inputs.append(image)

            try:
                response = self.client.images.edit(
                    model=self.model,
                    image=image_inputs,
                    prompt=prompt,
                    size="1024x1024",
                    response_format="b64_json",
                )
            except Exception as error:
                raise _to_actionable_generation_error(error, self.model) from error
            return extract_image_bytes(response)

        try:
            response = self.client.images.generate(
                model=self.model,
                prompt=prompt,
                size="1024x1024",
                response_format="b64_json",
            )
        except Exception as error:
            raise _to_actionable_generation_error(error, self.model) from error
        return extract_image_bytes(response)

    def generate_reference_sheet(self, photo_bytes: bytes) -> bytes:
        """Generate the reviewed three-view reference sheet."""
        prompt = (
            "Create a complete cartoon three-view character design sheet based only on the uploaded subject. "
            "Show the same character from front view, side view, and back view, full body, aligned on one "
            "clean spritesheet. Cartoon/anime chibi styling is allowed, but preserve the original hairstyle, "
            "clothing, colors, silhouette, and recognizable identity from the uploaded image. Do not add animal "
            "ears, tails, paws, whiskers, fur, horns, wings, robot parts, armor, mechanical body parts, or pet "
            "features unless they already exist in the uploaded subject. Do not change the species or turn the "
            "subject into a cat, dog, robot, or mascot. Clean vector lineart, vibrant colors, game asset style, "
            "isolated on a solid pure white background, no text labels, no scene, no shadows, no cropped body."
        )
        return self._generate_with_body_check(prompt, photo_bytes)

    def generate_action_sheets(
        self,
        photo_bytes: bytes,
        reference_sheet_bytes: bytes,
    ) -> dict[str, bytes]:
        """Generate reviewed desktop-pet action sheets after the reference sheet is approved.

        Uses the reference sheet as the PRIMARY image (character model) and the
        original photo as context so that every action sheet inherits the exact
        proportions, style, and details established by the three-view reference.
        """
        # --- shared morphological lock (prepended to every action prompt) ---
        _morph_lock = (
            "CHARACTER IDENTITY LOCK — The character MUST be IDENTICAL to the three-view reference "
            "sheet in every respect: same head-to-body ratio, same limb thickness and length, same "
            "facial features (eye shape, nose, mouth, eyebrow placement), same hairstyle and hair "
            "color, same clothing design and colors, same silhouette, same art style and rendering "
            "(line weight, shading, color saturation). The reference sheet is the sole source of "
            "truth for the character's appearance. Do NOT reinterpret, stylize differently, simplify, "
            "or alter any visual trait. The character on the reference sheet IS the character to draw "
            "— copy it exactly and only pose it differently for each action. Do not add animal ears, "
            "tails, paws, whiskers, fur, horns, wings, robot parts, armor, or mechanical body parts "
            "unless they already exist on the reference sheet. "
        )

        prompts = {
            "dragged": (
                _morph_lock +
                "A held pose collection of 4 different draggable desktop-pet poses for the reference "
                "sheet character. Not an animation sequence. Each frame is a single stable pose that "
                "can be held while the mouse is dragging the pet: lifted in the air, dangling, mildly "
                "panicked, flailing arms and legs. "
                "CRITICAL LAYOUT: Place the 4 poses in one horizontal row. Each pose must occupy its "
                "own clearly separated column. Leave a wide empty vertical gap (at least 10%% of the "
                "image width) between adjacent poses so they are visually isolated with no overlap "
                "whatsoever. Every pose must be the same consistent full-body scale with feet aligned "
                "on a shared horizontal baseline. Generous pure white padding around every individual "
                "pose. Do not let limbs, hair, clothing, or props extend into the gap between poses. "
                "Do not crop heads, hands, legs, feet, hair, or props. Do not include stray body "
                "parts from any other pose inside a pose area. "
                "Sprite sheet, character asset, isolated on a solid pure white background."
            ),
            "eating": (
                _morph_lock +
                "An eating animation sequence sprite sheet for the reference sheet character. A single "
                "smooth 4-frame sequence showing the character happily eating: frame 1 — holding a small "
                "glowing digital fish with sparkling eyes of anticipation; frame 2 — lifting the fish to "
                "its mouth with a delighted expression; frame 3 — biting and chewing with pure joy, tiny "
                "sparkles around; frame 4 — swallowing contentedly with a satisfied happy smile and "
                "patting its belly. "
                "CRITICAL LAYOUT: Place the 4 frames in one horizontal row, left-to-right animation "
                "order. Each frame must occupy its own clearly separated column. Leave a wide empty "
                "vertical gap (at least 10%% of the image width) between adjacent frames so they are "
                "visually isolated with no overlap whatsoever. Every frame must be the same consistent "
                "full-body scale with feet aligned on a shared horizontal baseline. Generous pure white "
                "padding around every individual frame. Do not let limbs, hair, clothing, or props "
                "extend into the gap between frames. Do not crop heads, hands, legs, feet, hair, or "
                "props, and do not include stray body parts from another frame inside a frame. Chibi "
                "character design, game asset, isolated on a solid pure white background."
            ),
            "sleep": (
                _morph_lock +
                "A held pose collection of 4 different sleeping desktop-pet poses for the reference "
                "sheet character. Not an animation sequence. Each frame is one stable resting pose that "
                "can be held while the pet is idle: lying on its side sleeping soundly with eyes closed "
                "and a slight drool; curled up in a cozy ball with gentle rhythmic breathing; peacefully "
                "resting with a tiny floating 'Zzz' bubble; tucked under a soft small blanket with its "
                "face visible and tiny breathing bubbles. "
                "CRITICAL LAYOUT: Place the 4 poses in one horizontal row. Each pose must occupy its "
                "own clearly separated column. Leave a wide empty vertical gap (at least 10%% of the "
                "image width) between adjacent poses so they are visually isolated with no overlap "
                "whatsoever. Every pose must be the same consistent full-body scale with feet aligned "
                "on a shared horizontal baseline. Generous pure white padding around every individual "
                "pose. Do not let limbs, hair, clothing, or props extend into the gap between poses. "
                "Do not crop heads, hands, legs, feet, hair, or props, and do not include stray body "
                "parts from another pose inside a pose area. Chibi character design, game asset, "
                "isolated on a solid pure white background."
            ),
            "petting": (
                _morph_lock +
                "A held pose collection of 4 different petting desktop-pet poses for the reference "
                "sheet character. Not an animation sequence. Each frame is one stable petting reaction "
                "that can be shown once after a click: gentle head pat, happy reaction with softened "
                "eyes, relaxed satisfied smile, slightly surprised but pleased expression. "
                "CRITICAL LAYOUT: Place the 4 poses in one horizontal row. Each pose must occupy its "
                "own clearly separated column. Leave a wide empty vertical gap (at least 10%% of the "
                "image width) between adjacent poses so they are visually isolated with no overlap "
                "whatsoever. Every pose must be the same consistent full-body scale with feet aligned "
                "on a shared horizontal baseline. Generous pure white padding around every individual "
                "pose. Do not let limbs, hair, clothing, or props extend into the gap between poses. "
                "Do not crop heads, hands, legs, feet, hair, or props. Do not include stray body "
                "parts from any other pose inside a pose area. Chibi character design, game asset, "
                "isolated on a solid pure white background."
            ),
        }
        return {
            name: self._generate_with_body_check(
                prompt,
                reference_sheet_bytes,               # primary image = the approved character model
                context_images=[photo_bytes],         # original photo as identity context only
            )
            for name, prompt in prompts.items()
        }

    def _generate_with_body_check(
        self,
        prompt: str,
        photo_bytes: bytes,
        context_images: list[bytes] | None = None,
        max_retries: int = 2,
    ) -> bytes:
        """Retry if the generated image appears to be head-only."""
        result = b""
        for attempt in range(max_retries + 1):
            try:
                result = self.generate_image(prompt, photo_bytes, context_images)
            except Exception:
                if attempt < max_retries:
                    logger.warning("Generation failed on attempt %s, retrying", attempt + 1)
                    continue
                raise

            if self._has_full_body(result):
                return result

            logger.warning(
                "Body check failed on attempt %s/%s, regenerating with full-body emphasis",
                attempt + 1,
                max_retries + 1,
            )
            prompt = (
                "CRITICAL: The character MUST be drawn as a COMPLETE FULL BODY figure. "
                "Include head, torso, arms, and legs all the way down to the feet. "
                "Do NOT crop or show only the head/face. "
            ) + prompt

        return result

    def _has_full_body(self, image_bytes: bytes) -> bool:
        """Heuristic guard against head-only generations."""
        try:
            img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
            arr = np.array(img)
            is_character = ~(
                ((arr[:, :, 0] > 240) & (arr[:, :, 1] > 240) & (arr[:, :, 2] > 240)) |
                (arr[:, :, 3] < 30)
            )

            rows_with_content = np.any(is_character, axis=1)
            if not rows_with_content.any():
                return False

            y_indices = np.where(rows_with_content)[0]
            content_height = y_indices[-1] - y_indices[0]
            total_height = arr.shape[0]
            if total_height == 0:
                return False

            height_ratio = content_height / total_height
            content_center_y = (y_indices[0] + y_indices[-1]) / 2
            center_ratio = content_center_y / total_height
            has_body = height_ratio > 0.35 and center_ratio > 0.40
            logger.debug(
                "Body check: height_ratio=%.2f, center_ratio=%.2f, passed=%s",
                height_ratio,
                center_ratio,
                has_body,
            )
            return has_body
        except Exception as error:
            logger.warning("Body check failed with error: %s", error)
            return True


def _png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _split_action_sprite_board(image_bytes: bytes) -> dict[str, bytes]:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    width, height = image.size
    mid_x = width // 2
    mid_y = height // 2
    crops = {
        "idle": (0, 0, mid_x, mid_y),
        "sleep": (mid_x, 0, width, mid_y),
        "dragged": (0, mid_y, mid_x, height),
        "eating": (mid_x, mid_y, width, height),
    }
    return {name: _png_bytes(image.crop(box)) for name, box in crops.items()}
