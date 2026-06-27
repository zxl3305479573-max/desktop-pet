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
            "animations": {"idle": {}, "poke": {}, "sleep": {}, "petting": {}}
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
        zf.writestr("spritesheet_idle.png", png_buf.getvalue())
        zf.writestr("spritesheet_dragged.png", png_buf.getvalue())
        zf.writestr("spritesheet_eating.png", png_buf.getvalue())
        zf.writestr("spritesheet_sleep.png", png_buf.getvalue())
        zf.writestr("spritesheet_petting.png", png_buf.getvalue())
        zf.writestr("metadata.json", json.dumps({"name": "Test", "animations": ["idle", "dragged", "eating", "sleep", "petting"]}))
    return buf.getvalue()


def test_valid_bundle_passes():
    errors = validate_pet_bundle(_make_valid_bundle())
    assert errors == [], f"Expected no errors, got: {errors}"


def test_manifest_frame_paths_are_validated():
    bundle = io.BytesIO()
    with zipfile.ZipFile(bundle, "w") as zf:
        zf.writestr("skeleton.json", json.dumps({
            "bones": [{"name": "root"}, {"name": "a"}, {"name": "b"}, {"name": "c"}],
            "animations": {"idle": {}}
        }))
        zf.writestr("atlas.json", json.dumps({
            "image": "atlas.png",
            "regions": {"head": {}, "torso": {}},
        }))
        img = Image.new("RGBA", (512, 512), (255, 0, 0, 255))
        png_buf = io.BytesIO()
        img.save(png_buf, format="PNG")
        png_bytes = png_buf.getvalue()
        for name in [
            "atlas.png",
            "preview_front.png",
            "spritesheet_idle.png",
            "spritesheet_dragged.png",
            "spritesheet_eating.png",
        ]:
            zf.writestr(name, png_bytes)
        zf.writestr("metadata.json", json.dumps({"name": "Manifest Missing Frame"}))
        zf.writestr("manifest.json", json.dumps({
            "asset_type": "frame_manifest",
            "animations": {
                "idle": {"frames": [{"src": "frames/idle/missing.png"}]}
            },
        }))

    errors = validate_pet_bundle(bundle.getvalue())

    assert any("manifest.json" in error and "frames/idle/missing.png" in error for error in errors)


def test_legacy_bundle_without_sleep_or_petting_passes():
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
        zf.writestr("spritesheet_idle.png", png_buf.getvalue())
        zf.writestr("spritesheet_walk.png", png_buf.getvalue())
        zf.writestr("spritesheet_dragged.png", png_buf.getvalue())
        zf.writestr("spritesheet_eating.png", png_buf.getvalue())
        zf.writestr("metadata.json", json.dumps({"name": "Legacy", "animations": ["idle", "walk", "dragged", "eating"]}))

    errors = validate_pet_bundle(buf.getvalue())
    assert errors == [], f"Expected no legacy compatibility errors, got: {errors}"


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
        zf.writestr("spritesheet_idle.png", png_buf.getvalue())
        zf.writestr("spritesheet_dragged.png", png_buf.getvalue())
        zf.writestr("spritesheet_eating.png", png_buf.getvalue())
        zf.writestr("spritesheet_sleep.png", png_buf.getvalue())
        zf.writestr("spritesheet_petting.png", png_buf.getvalue())
        zf.writestr("metadata.json", "{}")
    errors = validate_pet_bundle(buf.getvalue())
    assert any("bones" in e for e in errors)


def test_missing_idle_spritesheet():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skeleton.json", json.dumps({
            "bones": [{"name": "root"}, {"name": "a"}, {"name": "b"}, {"name": "c"}],
            "animations": {"idle": {}, "poke": {}, "sleep": {}, "petting": {}}
        }))
        zf.writestr("atlas.json", json.dumps({
            "image": "atlas.png", "regions": {"a": {}, "b": {}}
        }))
        img = Image.new("RGBA", (512, 512), (255, 0, 0, 255))
        png_buf = io.BytesIO()
        img.save(png_buf, format="PNG")
        zf.writestr("atlas.png", png_buf.getvalue())
        zf.writestr("preview_front.png", png_buf.getvalue())
        zf.writestr("metadata.json", json.dumps({"name": "Test"}))

    errors = validate_pet_bundle(buf.getvalue())
    assert any("Missing" in e and "spritesheet_idle.png" in e for e in errors)
