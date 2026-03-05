# Horse outline tracer

Generates a 1000-point particle map from a horse outline image for the test page.

## Setup

```bash
pip install -r requirements-trace.txt
```

## Usage

1. Save your horse image (e.g. `public/horse_reference.png`), or pass its path.
2. Run:

```bash
python scripts/trace_horse.py public/horse_reference.png --out public/horse_outline.js
```

Or from the project root with any image:

```bash
python scripts/trace_horse.py path/to/horse.png -o public/horse_outline.js
```

3. Open `public/test-wok-svg.html` (via a local server). The page loads `horse_outline.js` if present and uses it for the Horse animation; otherwise it uses the built-in rearing-horse outline resampled to 1000 points.

## Options

- `--points N`  Number of outline points (default 1000).
- `--out FILE`  Output path (default `public/horse_outline.js`).
