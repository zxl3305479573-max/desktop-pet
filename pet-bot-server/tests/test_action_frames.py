import io

from PIL import Image

from app.services.action_frames import extract_action_frames


def _wide_square_pose_sheet() -> bytes:
    """A single-row sprite sheet with 4 fully-connected cartoon characters.

    Each character is a single connected blob (circle head overlapping a
    rounded body) so the connected-component extractor finds exactly one
    blob per pose.  Characters are separated by generous white gaps.
    """
    image = Image.new("RGBA", (400, 400), (255, 255, 255, 255))
    px = image.load()
    for cell in range(4):
        x0 = cell * 100
        center_x = x0 + 50
        for y in range(400):
            for x in range(100):
                world_x = x0 + x
                dx = x - 50
                # rounded body
                body_rect = 30 <= dx <= 70 and 108 <= y <= 240
                body_round_top = (dx - 30) ** 2 + (y - 108) ** 2 <= 8 ** 2 and y <= 112
                body_round_bot = (dx - 30) ** 2 + (y - 240) ** 2 <= 8 ** 2 and y >= 236
                body = body_rect or body_round_top or body_round_bot
                # head (circle, overlaps body at y≈108)
                head = (dx) ** 2 + (y - 96) ** 2 <= 16 ** 2
                if head:
                    px[world_x, y] = (80, 210, 90, 255)
                elif body:
                    px[world_x, y] = (240, 80, 80, 255)

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _square_three_view_sheet() -> bytes:
    image = Image.new("RGBA", (300, 300), (255, 255, 255, 255))
    px = image.load()
    colors = [(240, 80, 80, 255), (80, 210, 90, 255), (60, 120, 255, 255)]
    for cell, color in enumerate(colors):
        x0 = cell * 100
        for y in range(80, 230):
            for x in range(38, 62):
                px[x0 + x, y] = color
        for y in range(48, 80):
            for x in range(34, 66):
                if (x - 50) ** 2 + (y - 64) ** 2 <= 16 ** 2:
                    px[x0 + x, y] = color
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _stats(png_bytes: bytes) -> dict[str, int]:
    image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    stats = {"red": 0, "green": 0, "blue": 0, "opaque": 0, "white": 0}
    for r, g, b, a in image.getdata():
        if a == 0:
            continue
        stats["opaque"] += 1
        if r > 180 and g < 140 and b < 140:
            stats["red"] += 1
        if g > 180 and r < 140 and b < 140:
            stats["green"] += 1
        if b > 180 and r < 140 and g < 180:
            stats["blue"] += 1
        if r > 245 and g > 245 and b > 245:
            stats["white"] += 1
    return stats


def test_petting_square_sheet_extracts_full_horizontal_frames():
    frames = extract_action_frames("petting", _wide_square_pose_sheet())

    assert len(frames) == 4
    for frame in frames:
        stats = _stats(frame.png_bytes)
        assert stats["green"] > 20, f"head missing in frame: {stats}"
        assert stats["red"] > 100, f"body missing in frame: {stats}"
        assert stats["opaque"] > 3000, f"too few opaque pixels: {stats}"


def test_dragged_square_sheet_uses_the_same_full_frame_mapping():
    frames = extract_action_frames("dragged", _wide_square_pose_sheet())

    assert len(frames) == 4
    for frame in frames:
        stats = _stats(frame.png_bytes)
        assert stats["green"] > 20, f"head missing in frame: {stats}"
        assert stats["red"] > 100, f"body missing in frame: {stats}"
        assert stats["opaque"] > 3000, f"too few opaque pixels: {stats}"


def test_idle_uses_first_view_from_square_three_view_reference():
    frames = extract_action_frames("idle", _square_three_view_sheet())

    assert len(frames) == 3
    first = _stats(frames[0].png_bytes)
    assert first["red"] > 1000
    assert first["green"] == 0
    assert first["blue"] == 0
