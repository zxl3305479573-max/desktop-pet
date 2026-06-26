from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image


@dataclass(frozen=True)
class ActionFrame:
    index: int
    png_bytes: bytes
    source_box: tuple[int, int, int, int]


def extract_action_frames(animation: str, image_bytes: bytes) -> list[ActionFrame]:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    cells = _frame_cells(animation, image.width, image.height)
    cropped = []
    for index, cell in enumerate(cells):
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
        frames = extract_action_frames(animation, sheet_bytes)
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


def _frame_cells(animation: str, width: int, height: int) -> list[tuple[int, int, int, int]]:
    columns, rows = _layout_for_animation(animation, width, height)
    cells = []
    for row in range(rows):
        for column in range(columns):
            left = (column * width) // columns
            top = (row * height) // rows
            right = ((column + 1) * width) // columns
            bottom = ((row + 1) * height) // rows
            cells.append((left, top, max(left + 1, right), max(top + 1, bottom)))
    return cells


def _layout_for_animation(animation: str, width: int, height: int) -> tuple[int, int]:
    ratio = width / max(1, height)
    if animation == "idle":
        return 3, 1
    if animation in {"dragged", "petting"}:
        return 4, 1
    if animation == "sleep":
        return (2, 2) if ratio < 1.45 else (4, 1)
    if animation == "eating":
        return (4, 2) if ratio < 2.5 else (4, 1)
    return 1, 1


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
