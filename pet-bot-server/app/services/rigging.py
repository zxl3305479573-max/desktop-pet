"""Stage 4: Keypoints -> template skeleton -> Spine JSON."""
import json
from app.providers.base import PoseResult, SegmentationResult

BONE_TEMPLATE = [
    ("root", "", 0, 0, 0),
    ("spine", "root", 0, 0, 1),
    ("chest", "spine", 0, -40, 1),
    ("neck", "chest", 0, -30, 0.5),
    ("head", "neck", 0, -30, 0.3),
    ("left_upper_arm", "chest", -30, 0, 1),
    ("left_lower_arm", "left_upper_arm", 0, 50, 0.8),
    ("right_upper_arm", "chest", 30, 0, 1),
    ("right_lower_arm", "right_upper_arm", 0, 50, 0.8),
    ("left_upper_leg", "root", -15, 50, 1.2),
    ("left_lower_leg", "left_upper_leg", 0, 60, 0.8),
    ("right_upper_leg", "root", 15, 50, 1.2),
    ("right_lower_leg", "right_upper_leg", 0, 60, 0.8),
]


def build_skeleton(pose: PoseResult, segmentation: SegmentationResult) -> str:
    kp_map = {k["name"]: k for k in pose.keypoints}
    chest_x, chest_y = _avg_kps(kp_map, ["joint_11", "joint_12"],
                                default=(pose.image_width / 2, pose.image_height * 0.4))

    bones = []
    for name, parent, dx, dy, length_scale in BONE_TEMPLATE:
        x, y = chest_x + dx, chest_y + dy
        bones.append({
            "name": name,
            "parent": parent,
            "x": x,
            "y": y,
            "length": 30 * length_scale,
            "rotation": 0,
        })

    skeleton = {
        "skeleton": {"spine": "4.1.0", "width": pose.image_width, "height": pose.image_height},
        "bones": bones,
        "slots": _build_slots(segmentation.parts.keys()),
        "skins": [{"name": "default", "attachments": _build_attachments(segmentation.parts.keys())}],
        "animations": {
            "idle": _anim_track(bones),
            "walk": _anim_track(bones),
            "poke": _anim_track(bones),
        },
    }
    return json.dumps(skeleton, indent=2)


def _avg_kps(kp_map, names, default):
    pts = [(kp_map[n]["x"], kp_map[n]["y"]) for n in names if n in kp_map]
    if not pts:
        return default
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def _build_slots(part_names) -> list:
    return [{"name": f"{p}_slot", "bone": "root", "attachment": f"{p}_attach"} for p in part_names]


def _build_attachments(part_names) -> dict:
    return {
        f"{p}_slot": {f"{p}_attach": {"type": "region", "x": 0, "y": 0, "width": 32, "height": 32}}
        for p in part_names
    }


def _anim_track(bones) -> dict:
    return {"bones": {b["name"]: {"rotate": [{"time": 0, "angle": 0}]}
                      for b in bones if b["name"] != "root"}}
