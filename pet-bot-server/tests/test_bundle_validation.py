import io
import zipfile
import json
from PIL import Image
from app.validators.pet_bundle import validate_pet_bundle


def _make_valid_bundle() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skeleton.json", json.dumps({
            "bones": [{"name": "root"}, {"name": "a"}, {"name": "b"}, {"name": "c"}],
            "animations": {"idle": {}, "walk": {}, "poke": {}}
        }))
        zf.writestr("atlas.json", json.dumps({
            "image": "atlas.png", "size": {"w": 512, "h": 512},
            "regions": {"head": {"x": 0, "y": 0, "w": 64, "h": 64},
                        "torso": {"x": 64, "y": 0, "w": 64, "h": 100}}
        }))
        img = Image.new("RGBA", (512, 512), (255, 0, 0, 255))
        png_buf = io.BytesIO()
        img.save(png_buf, format="PNG")
        zf.writestr("atlas.png", png_buf.getvalue())
        zf.writestr("preview_front.png", png_buf.getvalue())
        zf.writestr("metadata.json", json.dumps({"name": "Test"}))
    return buf.getvalue()


def test_valid_bundle_passes():
    errors = validate_pet_bundle(_make_valid_bundle())
    assert errors == [], f"Expected no errors, got: {errors}"


def test_missing_atlas_png():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skeleton.json", "{}")
        zf.writestr("atlas.json", "{}")
        zf.writestr("preview_front.png", b"x" * 300)
        zf.writestr("metadata.json", "{}")
    errors = validate_pet_bundle(buf.getvalue())
    assert any("Missing" in e and "atlas.png" in e for e in errors)


def test_empty_skeleton():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skeleton.json", "{}")
        img = Image.new("RGBA", (512, 512))
        png_buf = io.BytesIO()
        img.save(png_buf, format="PNG")
        zf.writestr("atlas.png", png_buf.getvalue())
        zf.writestr("atlas.json", json.dumps({"regions": {"a": {}, "b": {}}}))
        zf.writestr("preview_front.png", png_buf.getvalue())
        zf.writestr("metadata.json", "{}")
    errors = validate_pet_bundle(buf.getvalue())
    assert any("bones" in e for e in errors)
