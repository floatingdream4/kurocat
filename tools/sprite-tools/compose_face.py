#!/usr/bin/env python3
"""Build an expression frame that shares the idle frame's body, jawline and apron.

The original blink / shy / happy frames were drawn with a slightly different jaw and body
pixels, so switching to them made the chin jump. This takes everything from the idle frame
and blends in only the facial region of an (already aligned, 224x278) expression frame.

    python3 tools/sprite-tools/compose_face.py MODE src/assets/dafeiyu/notail_idle.png EXPR.png OUT.png

MODE:
    eyes  - only the two eyes (blink-like frames; mouth and jaw stay idle)
    face  - eyes, mouth and cheeks, keeping the idle jawline (closed-mouth expressions)
    full  - the whole face including the jaw (open-mouth expressions that need a lower chin)

Requires Pillow and numpy.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

EYES = [("r", (61, 116, 104, 152)), ("r", (112, 116, 157, 152))]
MODES = {
    "eyes": (EYES, 1.3),
    "face": (EYES + [("e", (90, 143, 128, 157)), ("e", (60, 138, 96, 154)), ("e", (120, 138, 158, 154))], 1.3),
    "full": ([("e", (54, 108, 164, 172))], 1.6),
}


def main() -> None:
    if len(sys.argv) != 5 or sys.argv[1] not in MODES:
        sys.exit(__doc__)
    shapes, blur = MODES[sys.argv[1]]
    idle = Image.open(sys.argv[2]).convert("RGBA")
    expr = Image.open(sys.argv[3]).convert("RGBA")
    if idle.size != (224, 278) or expr.size != idle.size:
        sys.exit("both frames must be 224x278 (run align_frame.py first)")
    mask = Image.new("L", idle.size, 0)
    draw = ImageDraw.Draw(mask)
    for kind, box in shapes:
        if kind == "r":
            draw.rounded_rectangle(box, radius=9, fill=255)
        else:
            draw.ellipse(box, fill=255)
    w = np.asarray(mask.filter(ImageFilter.GaussianBlur(blur))).astype(float)[..., None] / 255
    a, b = np.asarray(idle).astype(float), np.asarray(expr).astype(float)
    out = a.copy()
    out[..., :3] = a[..., :3] * (1 - w) + b[..., :3] * w
    Image.fromarray((out + 0.5).astype(np.uint8), "RGBA").save(sys.argv[4])
    print(f"wrote {sys.argv[4]}")


if __name__ == "__main__":
    main()
