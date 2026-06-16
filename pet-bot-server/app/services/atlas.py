"""Stage 5: Pack part images into atlas.png + atlas.json + preview.png."""
import io
import json
from PIL import Image
from app.providers.base import SegmentationResult, RiggingResult

ATLAS_SIZE = 512


def build_atlas(segmentation: SegmentationResult, rigging: RiggingResult) -> tuple[bytes, str, bytes]:
    parts = segmentation.parts
    if not parts:
        raise ValueError("No parts to pack into atlas")

    atlas_img = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    regions = {}
    x, y = 0, 0
    row_height = 0

    part_order = ["head", "torso", "left_arm", "right_arm", "left_leg", "right_leg"]
    for name in part_order:
        if name not in parts:
            continue
        part_arr = parts[name]
        part_img = Image.fromarray(part_arr).convert("RGBA")
        pw, ph = part_img.size

        if pw > ATLAS_SIZE:
            pw = ATLAS_SIZE
            part_img = part_img.resize((pw, ph))
        if x + pw > ATLAS_SIZE:
            x = 0
            y += row_height + 4
            row_height = 0

        atlas_img.paste(part_img, (x, y), part_img)
        regions[name] = {"x": x, "y": y, "w": pw, "h": ph}
        x += pw + 4
        row_height = max(row_height, ph)

    atlas_buf = io.BytesIO()
    atlas_img.save(atlas_buf, format="PNG")
    atlas_png = atlas_buf.getvalue()

    atlas_json = json.dumps({
        "image": "atlas.png",
        "size": {"w": ATLAS_SIZE, "h": ATLAS_SIZE},
        "regions": regions,
    }, indent=2)

    preview = _composite_preview(parts)
    preview_buf = io.BytesIO()
    preview.save(preview_buf, format="PNG")
    preview_png = preview_buf.getvalue()

    return atlas_png, atlas_json, preview_png


def _composite_preview(parts: dict) -> Image.Image:
    order = {"head": 0, "torso": 1, "left_arm": 2, "right_arm": 2, "left_leg": 3, "right_leg": 3}
    images = [(n, Image.fromarray(arr).convert("RGBA")) for n, arr in parts.items()]
    images.sort(key=lambda x: order.get(x[0], 99))

    if not images:
        return Image.new("RGBA", (128, 256), (0, 0, 0, 0))

    total_h = sum(img.height for _, img in images)
    max_w = max(img.width for _, img in images)
    canvas = Image.new("RGBA", (max_w, max(total_h, 1)), (0, 0, 0, 0))
    y_off = 0
    for _, img in images:
        x_off = (max_w - img.width) // 2
        canvas.paste(img, (x_off, y_off), img)
        y_off += img.height
    return canvas
