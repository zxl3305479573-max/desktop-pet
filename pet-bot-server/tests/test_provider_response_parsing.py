import base64
import json
from types import SimpleNamespace

from app.providers.builtin import BuiltinProvider, extract_image_bytes, normalize_openai_base_url


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)
PNG_B64 = base64.b64encode(PNG_BYTES).decode("ascii")


def test_extracts_image_from_json_string_response():
    response = json.dumps({"data": [{"b64_json": PNG_B64}]})

    assert extract_image_bytes(response) == PNG_BYTES


def test_extracts_image_from_data_url_string_response():
    response = f"data:image/png;base64,{PNG_B64}"

    assert extract_image_bytes(response) == PNG_BYTES


def test_extracts_embedded_data_url_from_text_response():
    response = f"Here is the generated sprite sheet: data:image/png;base64,{PNG_B64}"

    assert extract_image_bytes(response) == PNG_BYTES


def test_extracts_image_from_chat_completion_like_response():
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=[
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{PNG_B64}"},
                        }
                    ]
                )
            )
        ]
    )

    assert extract_image_bytes(response) == PNG_BYTES


def test_generate_image_uses_images_edit_when_photo_is_provided():
    class FakeImages:
        def __init__(self):
            self.edit_called = False

        def edit(self, **kwargs):
            self.edit_called = True
            assert kwargs["model"] == "gpt-image-2"
            assert kwargs["prompt"] == "make a sprite"
            assert kwargs["response_format"] == "b64_json"
            assert kwargs["image"]
            return {"data": [{"b64_json": PNG_B64}]}

    fake_images = FakeImages()
    provider = BuiltinProvider(api_key="test-key")
    provider._client = SimpleNamespace(images=fake_images)

    assert provider.generate_image("make a sprite", photo_bytes=PNG_BYTES) == PNG_BYTES
    assert fake_images.edit_called


def test_reference_sheet_prompt_cartoonizes_without_adding_animal_or_robot_parts():
    class FakeImages:
        def __init__(self):
            self.prompt = ""

        def edit(self, **kwargs):
            self.prompt = kwargs["prompt"]
            return {"data": [{"b64_json": PNG_B64}]}

    fake_images = FakeImages()
    provider = BuiltinProvider(api_key="test-key")
    provider._client = SimpleNamespace(images=fake_images)

    assert provider.generate_reference_sheet(PNG_BYTES) == PNG_BYTES
    prompt = fake_images.prompt.lower()
    assert "cartoon" in prompt
    assert "front view" in prompt
    assert "side view" in prompt
    assert "back view" in prompt
    assert "cat ears" not in prompt
    assert "robot body" not in prompt
    assert "do not add animal ears" in prompt


def test_action_sheet_prompts_request_interaction_and_sleep_poses():
    class FakeImages:
        def __init__(self):
            self.prompts = []

        def edit(self, **kwargs):
            self.prompts.append(kwargs["prompt"])
            return {"data": [{"b64_json": PNG_B64}]}

    fake_images = FakeImages()
    provider = BuiltinProvider(api_key="test-key")
    provider._client = SimpleNamespace(images=fake_images)
    provider._has_full_body = lambda _image_bytes: True

    assert provider.generate_action_sheets(PNG_BYTES, [PNG_BYTES]).keys() == {
        "dragged",
        "eating",
        "sleep",
        "petting",
    }

    dragged_prompt = fake_images.prompts[0].lower()
    eating_prompt = fake_images.prompts[1].lower()
    sleep_prompt = fake_images.prompts[2].lower()
    petting_prompt = fake_images.prompts[3].lower()

    assert "held pose collection" in dragged_prompt
    assert "not an animation sequence" in dragged_prompt
    assert "single stable pose" in dragged_prompt

    assert "feeding animation sequence" in eating_prompt
    assert "row of exactly 4 frames" in eating_prompt
    assert "left-to-right" in eating_prompt
    assert "one complete feeding action" in eating_prompt

    assert "held pose collection" in sleep_prompt
    assert "sleeping desktop-pet poses" in sleep_prompt
    assert "single stable sleeping pose" in sleep_prompt

    assert "held pose collection" in petting_prompt
    assert "petting desktop-pet poses" in petting_prompt
    assert "not an animation sequence" in petting_prompt
    assert "gentle head pat" in petting_prompt
    assert "happy reaction" in petting_prompt


def test_normalizes_openai_compatible_base_url_to_v1():
    assert normalize_openai_base_url("https://api.example.com") == "https://api.example.com/v1"
    assert normalize_openai_base_url("https://api.example.com/v1") == "https://api.example.com/v1"
    assert normalize_openai_base_url("https://api.example.com/v1/") == "https://api.example.com/v1"


def test_empty_api_response_has_actionable_error_message():
    try:
      extract_image_bytes("")
    except ValueError as exc:
      message = str(exc)
    else:
      raise AssertionError("expected ValueError")

    assert "API 返回空内容" in message
    assert "/v1" in message


def test_generate_image_reports_unavailable_image_model_channel():
    class FakeImages:
        def edit(self, **_kwargs):
            raise RuntimeError("model_not_found: No available channel for model gpt-image-2")

    provider = BuiltinProvider(api_key="test-key")
    provider._client = SimpleNamespace(images=FakeImages())

    try:
        provider.generate_image("make a sprite", photo_bytes=PNG_BYTES)
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("expected ValueError")

    assert "没有可用的图片生成模型通道" in message
    assert "gpt-image-2" in message
