from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image


@dataclass(frozen=True)
class ActionFrame:
    index: int
    png_bytes: bytes
    source_box: tuple[int, int, int, int]


def extract_action_frames(
    animation: str, image_bytes: bytes, expected_count: int = 0
) -> list[ActionFrame]:
    """Extract individual pose frames from a sprite sheet using connected-component analysis.

    Instead of assuming poses are aligned to a fixed grid (which fails when AI generation
    does not place characters at exact grid positions), this finds foreground blobs via
    flood-fill edge-background detection, then labels connected components to locate each
    isolated pose regardless of its position in the sheet.

    When ``expected_count`` is given and XY-cut produces fewer boxes (poses are too close
    together for the gap-based algorithm to separate), falls back to an equal-width column
    split — safe for the 1xN horizontal-row layouts used by all action sheets.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    fg_mask = _foreground_mask(image)
    fg_pixels = list(fg_mask.get_flattened_data())
    boxes = _find_pose_boxes(fg_pixels, image.width, image.height)

    if expected_count > 0 and len(boxes) < expected_count:
        grid_boxes = _grid_fallback_boxes(image.width, image.height, expected_count)
        if len(grid_boxes) == expected_count:
            boxes = grid_boxes

    cropped: list[tuple[int, Image.Image, tuple[int, int, int, int]]] = []
    for index, box in enumerate(boxes):
        cell = (box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"])
        frame = _extract_cell_frame(image, cell)
        if frame is not None:
            cropped.append((index, frame[0], frame[1]))

    normalized = _normalize_frames(cropped)
    return [
        ActionFrame(index=index, png_bytes=_png_bytes(frame), source_box=source_box)
        for index, frame, source_box in normalized
    ]


def build_action_frame_assets(
    reference_sheet: bytes,
    action_sheets: dict[str, bytes],
) -> tuple[dict[str, bytes], dict]:
    frame_files: dict[str, bytes] = {}
    animations: dict[str, dict] = {}

    idle_frames = extract_action_frames("idle", reference_sheet)[:1]
    if idle_frames:
        path = "frames/idle/frame-0.png"
        frame_files[path] = idle_frames[0].png_bytes
        animations["idle"] = {
            "mode": "static",
            "frame_duration_ms": 1000,
            "frames": [{"src": path, "anchor": {"x": 0.5, "y": 1.0}}],
        }

    for animation, sheet_bytes in action_sheets.items():
        frames = extract_action_frames(animation, sheet_bytes, expected_count=4)
        if not frames:
            continue

        entries = []
        for index, frame in enumerate(frames):
            path = f"frames/{animation}/frame-{index}.png"
            frame_files[path] = frame.png_bytes
            entries.append({"src": path, "anchor": {"x": 0.5, "y": 1.0}})

        if animation == "eating":
            rows = [
                {"frames": entries[start:start + 4]}
                for start in range(0, len(entries), 4)
                if len(entries[start:start + 4]) == 4
            ]
            animations[animation] = {
                "mode": "sequence",
                "frame_duration_ms": 320,
                "frames": entries,
                "rows": rows or [{"frames": entries}],
            }
        else:
            animations[animation] = {
                "mode": "static",
                "frame_duration_ms": 1000,
                "frames": entries,
            }

    manifest = {
        "version": 1,
        "asset_type": "frame_manifest",
        "animations": animations,
    }
    return frame_files, manifest


def _find_pose_boxes(
    mask: list[int], width: int, height: int
) -> list[dict[str, int]]:
    """Locate each pose by recursively splitting on the gaps between them.

    AI sheets place every pose in its own grid cell with a margin of background
    around it. We separate poses with a recursive XY-cut: at each region, look
    for empty corridors in the column projection and the row projection; split
    on whichever axis has a gap and recurse into the parts. Cutting one axis at
    a time handles staggered grids (e.g. a 2x2 where the poses interlock so no
    single full-height column is empty — cutting into rows first then columns
    still separates them). It is robust to a pose being drawn as several
    disconnected blobs (limbs), and works for any grid shape (1xN, Nx1, NxM)
    without assuming a fixed frame count — which is where the previous
    connected-component clustering collapsed every pose into one box.
    """
    min_w = width * 0.04
    min_h = height * 0.04
    pose_boxes: list[dict[str, int]] = []

    for x0, y0, x1, y1 in _xy_cut(mask, width, 0, 0, width - 1, height - 1, 0):
        box = _tight_box(mask, width, height, x0, y0, x1, y1)
        if box is None:
            continue
        # Drop stray specks; a real pose fills a meaningful area.
        if box["w"] < min_w and box["h"] < min_h:
            continue
        pose_boxes.append(box)

    return _sort_boxes_reading_order(pose_boxes)


def _xy_cut(
    mask: list[int],
    width: int,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    depth: int,
) -> list[tuple[int, int, int, int]]:
    """Recursive XY-cut. Returns inclusive leaf regions, each holding one pose."""
    region_w = x1 - x0 + 1
    region_h = y1 - y0 + 1
    if depth > 8 or region_w <= 1 or region_h <= 1:
        return [(x0, y0, x1, y1)]

    columns = [0] * region_w
    rows = [0] * region_h
    for y in range(y0, y1 + 1):
        base = y * width
        row_index = y - y0
        for x in range(x0, x1 + 1):
            if mask[base + x]:
                columns[x - x0] += 1
                rows[row_index] += 1

    x_segs = _projection_segments(columns, region_w)
    y_segs = _projection_segments(rows, region_h)

    # Split on whichever axis subdivides this region; recurse into the parts.
    # Try columns first, then rows — order is irrelevant for clean grids and
    # recursion reaches the other axis on the next level for staggered ones.
    if len(x_segs) > 1:
        result: list[tuple[int, int, int, int]] = []
        for sx0, sx1 in x_segs:
            result += _xy_cut(mask, width, x0 + sx0, y0, x0 + sx1, y1, depth + 1)
        return result
    if len(y_segs) > 1:
        result = []
        for sy0, sy1 in y_segs:
            result += _xy_cut(mask, width, x0, y0 + sy0, x1, y0 + sy1, depth + 1)
        return result

    # No corridor on either axis: a single content block. Trim to it.
    if x_segs and y_segs:
        return [(x0 + x_segs[0][0], y0 + y_segs[0][0], x0 + x_segs[0][1], y0 + y_segs[0][1])]
    return []


def _projection_segments(occupancy: list[int], dim: int) -> list[tuple[int, int]]:
    """Split a 1-D occupancy profile into content runs separated by gaps.

    A position counts as content when its occupancy exceeds a small noise floor
    (stray anti-aliased pixels survive otherwise). A run ends only after a gap of
    at least ``min_gap`` empty positions, so a thin internal column inside a pose
    does not split it. Returns inclusive ``(start, end)`` ranges.
    """
    noise = max(1, dim // 400)
    min_gap = max(8, dim // 150)
    min_len = max(4, dim // 40)

    segments: list[tuple[int, int]] = []
    start: int | None = None
    last = 0
    gap = 0

    for i, value in enumerate(occupancy):
        if value > noise:
            if start is None:
                start = i
            last = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if last - start + 1 >= min_len:
                    segments.append((start, last))
                start = None
                gap = 0

    if start is not None and last - start + 1 >= min_len:
        segments.append((start, last))

    return segments


def _tight_box(
    mask: list[int], width: int, height: int, x0: int, y0: int, x1: int, y1: int
) -> dict[str, int] | None:
    """Tight foreground bounding box inside a cell, with a small padding."""
    min_x, min_y = x1, y1
    max_x, max_y = x0, y0
    found = False
    for y in range(y0, y1 + 1):
        base = y * width
        for x in range(x0, x1 + 1):
            if mask[base + x]:
                found = True
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y
    if not found:
        return None

    padding = 8
    px = max(0, min_x - padding)
    py = max(0, min_y - padding)
    pr = min(width - 1, max_x + padding)
    pb = min(height - 1, max_y + padding)
    return {"x": px, "y": py, "w": pr - px + 1, "h": pb - py + 1}


def _sort_boxes_reading_order(boxes: list[dict[str, int]]) -> list[dict[str, int]]:
    """Sort bounding boxes top-to-bottom then left-to-right (reading order)."""
    if len(boxes) <= 1:
        return boxes
    avg_height = sum(b["h"] for b in boxes) / len(boxes)
    row_threshold = max(1, avg_height * 0.7)

    def _row_key(b: dict[str, int]) -> tuple[int, int]:
        row = round((b["y"] + b["h"] / 2) / row_threshold)
        return (row, b["x"])

    return sorted(boxes, key=_row_key)


def _grid_fallback_boxes(
    width: int, height: int, count: int
) -> list[dict[str, int]]:
    """Equal-width column split for 1xN horizontal-row sprite sheets.

    Used when XY-cut cannot separate poses because the AI left
    insufficient gaps between them. Only applies to single-row
    layouts (width >= height * 0.8) where the count makes sense.
    """
    if count < 2 or count > 8:
        return []
    # Only activate for horizontal-strip layouts; multi-row grids
    # are too unpredictable for a blind column split.
    if height > width * 0.65:
        return []
    boxes: list[dict[str, int]] = []
    col_w = width // count
    for i in range(count):
        x = i * col_w
        # last column gets any remainder pixels
        w = (width - x) if i == count - 1 else col_w
        boxes.append({"x": x, "y": 0, "w": w, "h": height})
    return boxes


def _extract_cell_frame(
    image: Image.Image,
    cell: tuple[int, int, int, int],
) -> tuple[Image.Image, tuple[int, int, int, int]] | None:
    crop = image.crop(cell)
    foreground = _foreground_mask(crop)
    bbox = foreground.getbbox()
    if not bbox:
        return None

    padding = 6
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(crop.width, bbox[2] + padding)
    bottom = min(crop.height, bbox[3] + padding)
    cropped = crop.crop((left, top, right, bottom))
    alpha = foreground.crop((left, top, right, bottom))
    cropped.putalpha(alpha)
    source_box = (cell[0] + left, cell[1] + top, cell[0] + right, cell[1] + bottom)
    return cropped, source_box


def _foreground_mask(image: Image.Image) -> Image.Image:
    pixels = image.load()
    width, height = image.size
    background = bytearray(width * height)
    stack: list[tuple[int, int]] = []

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if background[index]:
            return
        if not _is_edge_background(pixels[x, y]):
            return
        background[index] = 1
        stack.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while stack:
        x, y = stack.pop()
        if x > 0:
            enqueue(x - 1, y)
        if x < width - 1:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y < height - 1:
            enqueue(x, y + 1)

    mask = Image.new("L", (width, height), 0)
    output = mask.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a >= 16 and not background[y * width + x]:
                output[x, y] = a
    return mask


def _is_edge_background(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    if a < 16:
        return True
    max_channel = max(r, g, b)
    min_channel = min(r, g, b)
    return r > 238 and g > 238 and b > 238 and max_channel - min_channel < 30


def _normalize_frames(
    frames: list[tuple[int, Image.Image, tuple[int, int, int, int]]],
) -> list[tuple[int, Image.Image, tuple[int, int, int, int]]]:
    if not frames:
        return []

    max_width = max(frame.width for _, frame, _ in frames)
    max_height = max(frame.height for _, frame, _ in frames)
    normalized = []
    for index, frame, source_box in frames:
        canvas = Image.new("RGBA", (max_width, max_height), (255, 255, 255, 0))
        x = (max_width - frame.width) // 2
        y = max_height - frame.height
        canvas.alpha_composite(frame, (x, y))
        normalized.append((index, canvas, source_box))
    return normalized


def _png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()
