"""One-off tool: split the Stroud painting into three standalone figures.

Crops each of the three women out of site/img/regency-trio.jpg, feathers the
crop edges softly into transparency, and writes optimized WebPs to
site/img/figures/.  Run: python -m builder.make_figures
"""
from pathlib import Path

from PIL import Image

# name: (left, top, right, bottom) as fractions of the source image
FIGURES = {
    "gold":  (0.00, 0.09, 0.315, 1.00),  # left: gold overdress, feathered bonnet
    "plaid": (0.30, 0.05, 0.67, 0.915),  # center: green plaid gown, yellow gloves
    "rose":  (0.67, 0.06, 1.00, 0.96),   # right: pink spencer, white bonnet
}
MAX_H = 720
FEATHER = 0.22  # soft edge width as a fraction of the smaller dimension
BUDGET = 400_000


def soft_rect_mask(w: int, h: int, feather: float = FEATHER) -> Image.Image:
    """Rectangular alpha mask that fades to transparent at every edge."""
    mask = Image.new("L", (w, h), 0)
    px = mask.load()
    m = feather * min(w, h)
    for y in range(h):
        dy = min(y, h - 1 - y) / m
        for x in range(w):
            d = min(min(x, w - 1 - x) / m, dy)
            px[x, y] = max(0, min(255, int(d * 255)))
    return mask


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    src = Image.open(root / "site" / "img" / "regency-trio.jpg").convert("RGB")
    out_dir = root / "site" / "img" / "figures"
    out_dir.mkdir(parents=True, exist_ok=True)
    W, H = src.size
    total = 0
    for name, (l, t, r, b) in FIGURES.items():
        crop = src.crop((int(l * W), int(t * H), int(r * W), int(b * H)))
        if crop.height > MAX_H:
            crop = crop.resize(
                (int(crop.width * MAX_H / crop.height), MAX_H), Image.LANCZOS)
        rgba = crop.convert("RGBA")
        rgba.putalpha(soft_rect_mask(*crop.size))
        out = out_dir / f"{name}.webp"
        rgba.save(out, "WEBP", quality=80)
        total += out.stat().st_size
        print(f"{out.name}: {out.stat().st_size:,} bytes")
    print(f"total {total:,} bytes")
    assert total < BUDGET, f"figures exceed {BUDGET:,}-byte budget"


if __name__ == "__main__":
    main()
