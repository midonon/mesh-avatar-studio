# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10.4", "numpy", "opencv-python-headless"]
# ///
"""Draw local spiral/X eye variants from the existing rig and clean face layer."""
import argparse
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from agent_common import ROOT, inside_repo, project_image, read_rig
from importlib.util import module_from_spec, spec_from_file_location


def create(project):
    project = inside_repo(project)
    if not project.is_relative_to(ROOT / "projects"):
        raise ValueError("cartoon assets must stay inside projects/")
    source = project_image(project)
    rig = read_rig(project)
    base = np.array(Image.open(project / "built/base.png").convert("RGBA"))
    spec = spec_from_file_location("build_sprites", ROOT / "tools/build-sprites.py")
    builder = module_from_spec(spec)
    spec.loader.exec_module(builder)
    existing_mask = project / "variant-requests/eyes_closed/mask.png"
    if existing_mask.exists():
        for style in ["spiral", "cross"]:
            folder = project / f"variant-requests/eyes_{style}"
            folder.mkdir(parents=True, exist_ok=True)
            mask_path = folder / "mask.png"
            if not mask_path.exists():
                mask_path.write_bytes(existing_mask.read_bytes())
    masks = builder.regions(project, rig, source.size, "eyes_spiral")
    # Remove the remaining original lid crease from the already cleaned face.
    clean_mask = np.zeros(base.shape[:2], np.uint8)
    import json
    layers = json.loads((project / "built/layers.json").read_text(encoding="utf-8"))["layers"]
    for i in range(2):
        for part in ["ball", "lash", "low", "crease"]:
            name = f"eye{i}_{part}"
            x, y, w, h = layers[name]
            alpha = np.array(Image.open(project / f"built/{name}.png").convert("RGBA"))[..., 3]
            clean_mask[y:y+h, x:x+w] |= (alpha > 8).astype(np.uint8)
    clean_mask = cv2.dilate(clean_mask, np.ones((5, 5), np.uint8))
    clean = cv2.inpaint(base[..., :3], clean_mask, 8, cv2.INPAINT_TELEA)
    region = np.maximum.reduce(masks) > 0
    result = np.array(source)
    result[region, :3] = clean[region]
    result[region, 3] = 255
    destination = project / "variants"
    destination.mkdir(exist_ok=True)
    scale = 4
    for style in ["spiral", "cross"]:
        overlay = Image.new("RGBA", (source.width * scale, source.height * scale))
        draw = ImageDraw.Draw(overlay)
        spiral_art = np.array(overlay) if style == "spiral" else None
        for eye in rig["eyes"]:
            points = np.asarray(eye["opening"])
            x0, y0 = points.min(axis=0)
            x1, y1 = points.max(axis=0)
            cx, cy = (x0+x1)/2, (y0+y1)/2
            rx, ry = (x1-x0)*0.40, (y1-y0)*0.44
            if style == "spiral":
                line = []
                for k in range(501):
                    fraction = k/500
                    angle = fraction*math.pi*6 - math.pi/2
                    line.append(((cx + rx*fraction*math.cos(angle))*scale, (cy + ry*fraction*math.sin(angle))*scale))
                thickness = round(min(rx, ry)*0.16*scale)
                path = np.rint(line).astype(np.int32)
                cv2.polylines(spiral_art, [path], False, (110, 78, 125, 255), thickness, cv2.LINE_AA)
                for point in [path[0], path[-1]]:
                    cv2.circle(spiral_art, tuple(point), thickness//2, (110, 78, 125, 255), -1, cv2.LINE_AA)
            else:
                rx *= 0.74
                ry *= 0.74
                thickness = round(min(rx, ry)*0.40*scale)
                for sign in [-1, 1]:
                    draw.line([((cx-rx)*scale, (cy-sign*ry)*scale), ((cx+rx)*scale, (cy+sign*ry)*scale)], fill=(34, 20, 24, 255), width=thickness)
        if style == "spiral":
            overlay = Image.fromarray(spiral_art)
        art = np.array(overlay.resize(source.size, Image.Resampling.LANCZOS))
        art[~region, 3] = 0
        variant = Image.alpha_composite(Image.fromarray(result), Image.fromarray(art))
        variant.save(destination / f"eyes_{style}.png")
        print(f"Created local eyes_{style}.png")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    create(parser.parse_args().project)
