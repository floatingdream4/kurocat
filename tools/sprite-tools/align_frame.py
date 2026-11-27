#!/usr/bin/env python3
"""Register a newly drawn BigFish frame onto the idle frame.

Image generators usually redraw the whole character slightly smaller or shifted, even when
asked to edit in place. This searches for the scale and offset that best overlap the new
frame's silhouette with the idle frame's (head and torso only) and writes a 224x278 PNG
that lines up with the other frames.

    python3 tools/sprite-tools/align_frame.py NEW.png src/assets/dafeiyu/notail_idle.png OUT.png

Requires Pillow and numpy. A final overlap (IoU) of about 0.95 or more is a good fit; a much
lower value means the character was redrawn too differently and should be regenerated.
"""
import sys

import numpy as np
from PIL import Image

W, H = 224, 278


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    src = Image.open(sys.argv[1]).convert("RGBA")
    idle = np.asarray(Image.open(sys.argv[2]).convert("RGBA"))[..., 3] > 40
    if np.asarray(src)[..., 3].min() > 200:
        sys.exit("the new frame has no transparency; remove its background first")

    def place(scale: float, dx: int, dy: int) -> Image.Image:
        resized = src.resize((round(W * scale), round(H * scale)), Image.LANCZOS)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(resized, (dx, dy))
        return canvas

    best = (0.0, 1.0, 0, 0)
    for scale in np.arange(0.90, 1.16, 0.01):
        for dx in range(-22, 12):
            for dy in range(-14, 14):
                mask = np.asarray(place(scale, dx, dy))[..., 3] > 40
                a, b = mask[:235], idle[:235]  # ignore the feet / keyboard-covered rows
                iou = (a & b).sum() / max(1, (a | b).sum())
                if iou > best[0]:
                    best = (iou, float(scale), dx, dy)
    iou, scale, dx, dy = best
    place(scale, dx, dy).save(sys.argv[3])
    print(f"scale {scale:.2f}, offset ({dx}, {dy}), overlap IoU {iou:.3f} -> {sys.argv[3]}")


if __name__ == "__main__":
    main()
