import io

from PIL import Image

from app.services.action_frames import extract_action_frames


def _wide_square_pose_sheet() -> bytes:
    image = Image.new("RGBA", (400, 400), (255, 255, 255, 255))
    px = image.load()
    for cell in range(4):
        x0 = cell * 100
        for y in range(400):
            for x in range(100):
                world_x = x0 + x
                head = (x - 50) ** 2 + (y - 92) ** 2 <= 14 ** 2
                body = 38 <= x <= 62 and 112 <= y <= 260
                body_fill = 40 <= x <= 60 and 114 <= y <= 258
                body_outline = body and not body_fill
                hand = 24 <= x <= 76 and 58 <= y <= 70
                connector = 120 <= y <= 126
                foot = (34 <= x <= 47 and 286 <= y <= 330) or (53 <= x <= 66 and 286 <= y <= 330)
                if head:
                    px[world_x, y] = (80, 210, 90, 255)
                elif body_outline or connector:
                    px[world_x, y] = (240, 80, 80, 255)
                elif body_fill:
                    px[world_x, y] = (250, 250, 250, 255)
                elif hand or foot:
                    px[world_x, y] = (60, 120, 255, 255)

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
        assert stats["green"] > 20
        assert stats["red"] > 100
        assert stats["blue"] > 20
        assert stats["white"] > 1000
        assert stats["opaque"] > 5200


def test_dragged_square_sheet_uses_the_same_full_frame_mapping():
    frames = extract_action_frames("dragged", _wide_square_pose_sheet())

    assert len(frames) == 4
    for frame in frames:
        stats = _stats(frame.png_bytes)
        assert stats["green"] > 20
        assert stats["red"] > 100
        assert stats["blue"] > 20
        assert stats["white"] > 1000
        assert stats["opaque"] > 5200


def test_idle_uses_first_view_from_square_three_view_reference():
    frames = extract_action_frames("idle", _square_three_view_sheet())

    assert len(frames) == 3
    first = _stats(frames[0].png_bytes)
    assert first["red"] > 1000
    assert first["green"] == 0
    assert first["blue"] == 0
