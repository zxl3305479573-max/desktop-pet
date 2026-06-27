import io
import zipfile
import json
from PIL import Image


def validate_pet_bundle(zip_bytes: bytes) -> list[str]:
    errors = []
    required = [
        "skeleton.json",
        "atlas.png",
        "atlas.json",
        "preview_front.png",
        "metadata.json",
        "spritesheet_idle.png",
        "spritesheet_dragged.png",
        "spritesheet_eating.png",
    ]
    optional_pngs = [
        "spritesheet_sleep.png",
        "spritesheet_petting.png",
        "spritesheet_walk.png",
    ]

    def validate_member(zf: zipfile.ZipFile, name: str):
        info = zf.getinfo(name)
        if name.endswith(".png"):
            if info.file_size < 200:
                errors.append(f"Too small: {name} ({info.file_size} bytes)")
            else:
                try:
                    img = Image.open(io.BytesIO(zf.read(name)))
                    img.verify()
                except Exception:
                    errors.append(f"Invalid PNG: {name}")
        if name.endswith(".json"):
            data = json.loads(zf.read(name))
            if not data:
                errors.append(f"Empty JSON: {name}")

    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            namelist = zf.namelist()
            for name in required:
                if name not in namelist:
                    errors.append(f"Missing: {name}")
                    continue
                validate_member(zf, name)

            for name in optional_pngs:
                if name in namelist:
                    validate_member(zf, name)

            if "manifest.json" in namelist:
                validate_member(zf, "manifest.json")
                manifest = json.loads(zf.read("manifest.json"))
                animations = manifest.get("animations", {})
                if not isinstance(animations, dict) or not animations:
                    errors.append("manifest.json: missing animations")
                for animation, config in animations.items():
                    frames = config.get("frames", []) if isinstance(config, dict) else []
                    if not isinstance(frames, list) or not frames:
                        errors.append(f"manifest.json: animation '{animation}' has no frames")
                        continue
                    for frame in frames:
                        src = frame if isinstance(frame, str) else frame.get("src") if isinstance(frame, dict) else None
                        if not src or not isinstance(src, str):
                            errors.append(f"manifest.json: animation '{animation}' has invalid frame src")
                            continue
                        if src not in namelist:
                            errors.append(f"manifest.json: missing frame '{src}'")
                            continue
                        validate_member(zf, src)

            if "atlas.json" in namelist and "atlas.png" in namelist:
                atlas_data = json.loads(zf.read("atlas.json"))
                if len(atlas_data.get("regions", {})) < 2:
                    errors.append("atlas.json: fewer than 2 regions")

            if "skeleton.json" in namelist:
                skel = json.loads(zf.read("skeleton.json"))
                if len(skel.get("bones", [])) < 4:
                    errors.append(f"skeleton.json: only {len(skel.get('bones', []))} bones (need >=4)")
                anims = skel.get("animations", {})
                for a in ["idle"]:
                    if a not in anims:
                        errors.append(f"skeleton.json: missing animation '{a}'")
    except zipfile.BadZipFile:
        errors.append("Not a valid zip file")

    return errors
