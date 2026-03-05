"""
Trace a horse outline image to a particle map of N points (default 1000).
Outputs a JavaScript file of normalized coordinates (0-1, center 0.5,0.5) for use in test-wok-svg.html.

Usage:
  pip install numpy opencv-python
  python scripts/trace_horse.py path/to/horse.png --out public/horse_outline.js

Then open test-wok-svg.html; the page will use horse_outline.js if present.
"""

import sys
import os
import json
import argparse

def main():
    parser = argparse.ArgumentParser(description="Trace horse image to N-point outline")
    parser.add_argument("image", nargs="?", default=None, help="Path to horse outline image")
    parser.add_argument("--points", "-n", type=int, default=1000, help="Number of outline points")
    parser.add_argument("--out", "-o", default=None, help="Output .js file (e.g. public/horse_outline.js)")
    args = parser.parse_args()

    try:
        import numpy as np
        import cv2
    except ImportError:
        print("Required: pip install numpy opencv-python", file=sys.stderr)
        sys.exit(1)

    path = args.image
    if not path:
        for candidate in ["public/horse_reference.png", "public/horse_reference.jpg", "horse_reference.png"]:
            if os.path.isfile(candidate):
                path = candidate
                break
    if not path or not os.path.isfile(path):
        print("Usage: python scripts/trace_horse.py <path_to_horse_image.png> [--out public/horse_outline.js]", file=sys.stderr)
        print("Or place image at public/horse_reference.png", file=sys.stderr)
        sys.exit(1)

    img = cv2.imread(path)
    if img is None:
        print("Failed to load image:", path, file=sys.stderr)
        sys.exit(1)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)

    if not contours:
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        print("No contours found.", file=sys.stderr)
        sys.exit(1)

    contour = max(contours, key=cv2.contourArea)
    pts = contour.reshape(-1, 2).astype(np.float64)
    if np.linalg.norm(pts[0] - pts[-1]) > 1:
        pts = np.vstack([pts, pts[0:1]])

    d = np.sqrt(np.sum(np.diff(pts, axis=0) ** 2, axis=1))
    cum = np.concatenate([[0], np.cumsum(d)])
    total = cum[-1]
    if total < 1e-6:
        total = 1e-6

    n = args.points
    target = np.linspace(0, total - 1e-6, n, endpoint=True)
    out_pts = []
    j = 0
    for i in range(n):
        while j + 1 < len(cum) and cum[j + 1] < target[i]:
            j += 1
        if j + 1 >= len(cum):
            t = 1.0
            j = max(0, len(cum) - 2)
        else:
            t = (target[i] - cum[j]) / (cum[j + 1] - cum[j] + 1e-9)
        t = np.clip(t, 0, 1)
        px = pts[j, 0] * (1 - t) + pts[j + 1, 0] * t
        py = pts[j, 1] * (1 - t) + pts[j + 1, 1] * t
        out_pts.append((float(px), float(py)))

    arr = np.array(out_pts)
    xmin, ymin = arr.min(axis=0)
    xmax, ymax = arr.max(axis=0)
    cx = (xmin + xmax) / 2
    cy = (ymin + ymax) / 2
    s = max(xmax - xmin, ymax - ymin, 1e-6)
    nx = (arr[:, 0] - cx) / s * 0.5 + 0.5
    ny = (arr[:, 1] - cy) / s * 0.5 + 0.5
    flat = []
    for a, b in zip(nx.tolist(), ny.tolist()):
        flat.append(round(a, 6))
        flat.append(round(b, 6))

    js = "window.HORSE_OUTLINE_1000 = " + json.dumps(flat) + ";"
    out_path = args.out or "public/horse_outline.js"
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w") as f:
        f.write(js)
    print("Wrote", out_path, "(" + str(len(flat) // 2) + " points)")

if __name__ == "__main__":
    main()
