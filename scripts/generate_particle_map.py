"""
Convert a line-art horse image into a JSON coordinate map for particle spawning.

Logic (per requirements):
- Load image in grayscale with OpenCV.
- Threshold to isolate black line pixels (invert if needed so lines are the active pixels).
- Extract all (x, y) coordinates of line pixels.
- Randomly sample exactly 1000 points (or fewer if not enough pixels, with a warning).
- Invert the Y axis (height - y) so +Y is up (game-engine style).
- Write `particle_map.json` as:
  [
    {"x": 145, "y": 302},
    {"x": 210, "y": 18}
  ]
"""

import argparse
import json
import os
import sys
from typing import List, Tuple

import cv2  # type: ignore
import numpy as np  # type: ignore


def extract_line_pixels(gray: np.ndarray) -> Tuple[np.ndarray, np.ndarray, int, int]:
  """Return (xs, ys, width, height) for all line pixels."""
  h, w = gray.shape[:2]

  # First try a simple binary inversion threshold: dark lines -> 255, background -> 0
  _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

  ys, xs = np.where(thresh > 0)

  # If we got nothing (unusual), fall back to non-inverted threshold
  if xs.size == 0:
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    ys, xs = np.where(thresh == 0)

  return xs, ys, w, h


def sample_points(xs: np.ndarray, ys: np.ndarray, w: int, h: int, count: int) -> List[dict]:
  """Sample up to `count` points, invert Y axis, and return [{"x": int, "y": int}, ...]."""
  n = xs.size
  if n == 0:
    print("No line pixels found in image after thresholding.", file=sys.stderr)
    return []

  if n < count:
    print(
      f"Warning: only {n} line pixels found; requested {count}. "
      f"Using all available pixels.",
      file=sys.stderr,
    )
    indices = np.arange(n)
  else:
    rng = np.random.default_rng()
    indices = rng.choice(n, size=count, replace=False)

  xs_s = xs[indices]
  ys_s = ys[indices]

  # Invert Y axis so +Y goes up (origin at bottom-left)
  ys_inv = h - ys_s

  points = [{"x": int(x), "y": int(y)} for x, y in zip(xs_s, ys_inv)]
  return points


def main() -> None:
  parser = argparse.ArgumentParser(
    description="Convert a line-art horse image into particle_map.json (1000 sampled points)."
  )
  parser.add_argument(
    "image",
    help="Path to the horse line-art image (e.g. PNG).",
  )
  parser.add_argument(
    "--count",
    "-n",
    type=int,
    default=1000,
    help="Number of points to sample (default: 1000).",
  )
  parser.add_argument(
    "--out",
    "-o",
    default="particle_map.json",
    help="Output JSON file (default: particle_map.json).",
  )
  args = parser.parse_args()

  if not os.path.isfile(args.image):
    print(f"Image not found: {args.image}", file=sys.stderr)
    sys.exit(1)

  gray = cv2.imread(args.image, cv2.IMREAD_GRAYSCALE)
  if gray is None:
    print(f"Failed to load image as grayscale: {args.image}", file=sys.stderr)
    sys.exit(1)

  xs, ys, w, h = extract_line_pixels(gray)
  points = sample_points(xs, ys, w, h, args.count)

  if not points:
    print("No points to write; aborting.", file=sys.stderr)
    sys.exit(1)

  with open(args.out, "w", encoding="utf-8") as f:
    json.dump(points, f, separators=(",", ":"))

  print(f"Wrote {len(points)} points to {args.out}")


if __name__ == "__main__":
  main()

