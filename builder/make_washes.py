"""One-off tool: extract feathered watercolor washes from the Stroud painting.

Crops soft passages of site/img/regency-trio.jpg, gives each an irregular
organic alpha edge, and writes optimized WebPs to site/img/washes/.
Run: python -m builder.make_washes
"""
import math
from pathlib import Path

from PIL import Image

# name: (left, top, right, bottom) as fractions of the source image
REGIONS = {
    "mist":   (0.28, 0.02, 0.44, 0.14),  # pale blue-gray background wash
    "paper":  (0.55, 0.00, 0.98, 0.06),  # warm paper-white wash
    "butter": (0.03, 0.55, 0.22, 0.82),  # yellow dress
    "sage":   (0.40, 0.42, 0.56, 0.62),  # green plaid
    "rose":   (0.74, 0.50, 0.93, 0.78),  # pink gown
}
MAX_W = 640
BUDGET = 300_000


def organic_mask(w: int, h: int, wobbles: int = 7, feather: float = 0.35) -> Image.Image:
    """Elliptical alpha mask whose edge radius wobbles, for a hand-washed look."""
    mask = Image.new("L", (w, h), 0)
    px = mask.load()
    cx, cy = w / 2, h / 2
    for y in range(h):
        for x in range(w):
            dx, dy = (x - cx) / cx, (y - cy) / cy
            r = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            edge = (1.0 + 0.12 * math.sin(wobbles * ang)
                    + 0.07 * math.sin((wobbles + 3) * ang + 1.7))
            t = (edge - r) / feather
            px[x, y] = max(0, min(255, int(t * 255)))
    return mask


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    src = Image.open(root / "site" / "img" / "regency-trio.jpg").convert("RGB")
    out_dir = root / "site" / "img" / "washes"
    out_dir.mkdir(parents=True, exist_ok=True)
    W, H = src.size
    total = 0
    for name, (l, t, r, b) in REGIONS.items():
        crop = src.crop((int(l * W), int(t * H), int(r * W), int(b * H)))
        if crop.width > MAX_W:
            crop = crop.resize(
                (MAX_W, int(crop.height * MAX_W / crop.width)), Image.LANCZOS)
        rgba = crop.convert("RGBA")
        rgba.putalpha(organic_mask(*crop.size))
        out = out_dir / f"{name}.webp"
        rgba.save(out, "WEBP", quality=80)
        total += out.stat().st_size
        print(f"{out.name}: {out.stat().st_size:,} bytes")
    print(f"total {total:,} bytes")
    assert total < BUDGET, f"washes exceed {BUDGET:,}-byte budget"


if __name__ == "__main__":
    main()
