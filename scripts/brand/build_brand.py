"""
Build OmniRadar's transparent logo files from one set of geometry.

    python3 scripts/brand/build_brand.py path/to/Outfit-SemiBold.ttf

Writes public/brand/:
  omniradar-mark.svg / -white.svg   the radar mark (navy ring / white ring)
  omniradar-logo.svg / -white.svg   mark + "OmniRadar" wordmark (Outfit
                                    SemiBold, as vector outlines, so the
                                    files look right without the font)
  omniradar-logo.png / -white.png   transparent PNGs of the lockup (1200px)
  omniradar-mark.png                transparent 512px mark

The mark was redrawn from the original artwork (ring with a gap at the lower
left, a teal inner arc, three teal dots) and matches it at ~95% pixel
overlap. Keep MARK in sync with components/brand/Logo.tsx.

Requires fontTools and Pillow. Get the TTF from Google Fonts (Outfit, 600).
"""

import math
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

NAVY = "#101F38"
TEAL = "#6FD3D5"
WHITE = "#FFFFFF"

# Mark geometry, centered on (0, 0), outer radius ~71.25 (viewBox -72 -72 144 144).
# Angles in degrees, clockwise from 3 o'clock (screen coordinates).
MARK = {
    "ring": {"r": 63.0, "width": 16.5, "start": 146.0, "end": 481.0},  # gap centered at 133.5 deg
    "arc": {"r": 41.0, "width": 14.5, "start": 160.0, "end": 276.0},
    "dots": [(34.6, 16.3), (-15.0, 31.5), (3.5, -5.4)],
    "dot_r": 8.0,
}

WORD = "OmniRadar"
# Lockup proportions from the original: text 0.69x the mark's height, a gap of
# 0.2x the mark's width, vertically centered on the mark.
TEXT_HEIGHT = 144 * 0.69
GAP = 144 * 0.20


def pt(r, deg):
    a = math.radians(deg)
    return r * math.cos(a), r * math.sin(a)


def arc_path(r, start, end):
    x0, y0 = pt(r, start)
    x1, y1 = pt(r, end)
    large = 1 if (end - start) % 360 > 180 else 0
    return f"M{x0:.2f} {y0:.2f}A{r} {r} 0 {large} 1 {x1:.2f} {y1:.2f}"


def mark_svg_elements(ring_color):
    ring, arc = MARK["ring"], MARK["arc"]
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="{MARK["dot_r"]}" fill="{TEAL}"/>' for x, y in MARK["dots"])
    return (
        f'<path d="{arc_path(ring["r"], ring["start"], ring["end"])}" fill="none" stroke="{ring_color}" '
        f'stroke-width="{ring["width"]}" stroke-linecap="round"/>'
        f'<path d="{arc_path(arc["r"], arc["start"], arc["end"])}" fill="none" stroke="{TEAL}" '
        f'stroke-width="{arc["width"]}" stroke-linecap="round"/>{dots}'
    )


def wordmark(font_path):
    """SVG path data for WORD in Outfit, scaled so cap/ascender height == TEXT_HEIGHT."""
    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]

    # Measure the ink bounds of the whole word at font units.
    x = 0
    ymin, ymax = math.inf, -math.inf
    for ch in WORD:
        name = cmap[ord(ch)]
        bp = BoundsPen(glyphs)
        glyphs[name].draw(bp)
        if bp.bounds:
            ymin, ymax = min(ymin, bp.bounds[1]), max(ymax, bp.bounds[3])
        x += hmtx[name][0]
    scale = TEXT_HEIGHT / (ymax - max(ymin, 0))

    pen = SVGPathPen(glyphs)
    x = 0
    for ch in WORD:
        name = cmap[ord(ch)]
        # Flip Y (font units go up), scale, and place the baseline.
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x * scale, ymax * scale)))
        x += hmtx[name][0]
    width = x * scale
    return pen.getCommands(), width, TEXT_HEIGHT


def write_svgs(out, font_path):
    for suffix, ring in (("", NAVY), ("-white", WHITE)):
        (out / f"omniradar-mark{suffix}.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-72 -72 144 144" role="img" aria-label="OmniRadar">'
            f"{mark_svg_elements(ring)}</svg>\n"
        )

    d, text_w, text_h = wordmark(font_path)
    total_w = 144 + GAP + text_w
    text_y = 72 - text_h / 2
    for suffix, color in (("", NAVY), ("-white", WHITE)):
        (out / f"omniradar-logo{suffix}.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w:.1f} 144" role="img" aria-label="OmniRadar">'
            f'<g transform="translate(72 72)">{mark_svg_elements(color)}</g>'
            f'<path transform="translate({144 + GAP:.2f} {text_y:.2f})" d="{d}" fill="{color}"/></svg>\n'
        )
    return total_w


def draw_mark(draw, cx, cy, s, ring_color):
    def stroke_arc(r, w, start, end, color):
        box = [cx + (-r - w / 2) * s, cy + (-r - w / 2) * s, cx + (r + w / 2) * s, cy + (r + w / 2) * s]
        draw.arc(box, start, end, fill=color, width=round(w * s))
        for a in (start, end):
            x, y = pt(r, a)
            draw.ellipse([cx + (x - w / 2) * s, cy + (y - w / 2) * s, cx + (x + w / 2) * s, cy + (y + w / 2) * s], fill=color)

    ring, arc = MARK["ring"], MARK["arc"]
    stroke_arc(ring["r"], ring["width"], ring["start"], ring["end"], ring_color)
    stroke_arc(arc["r"], arc["width"], arc["start"], arc["end"], TEAL)
    r = MARK["dot_r"]
    for x, y in MARK["dots"]:
        draw.ellipse([cx + (x - r) * s, cy + (y - r) * s, cx + (x + r) * s, cy + (y + r) * s], fill=TEAL)


def write_pngs(out, font_path, total_w):
    ss = 4  # supersample, then downscale for smooth edges

    # Mark alone, 512px.
    size = 512
    img = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(img), size * ss / 2, size * ss / 2, size * ss / 144, NAVY)
    img.resize((size, size), Image.LANCZOS).save(out / "omniradar-mark.png")

    # Lockup, 1200px wide.
    width = 1200
    s = width / total_w
    height = round(144 * s)
    for suffix, color in (("", NAVY), ("-white", WHITE)):
        img = Image.new("RGBA", (width * ss, height * ss), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw_mark(draw, 72 * s * ss, 72 * s * ss, s * ss, color)
        font = ImageFont.truetype(str(font_path), size=10)
        # Size the font so the word's ink height matches TEXT_HEIGHT.
        l, t, r, b = font.getbbox(WORD)
        font = ImageFont.truetype(str(font_path), size=round(10 * TEXT_HEIGHT * s * ss / (b - t)))
        l, t, r, b = font.getbbox(WORD)
        x = (144 + GAP) * s * ss - l
        y = (72 - TEXT_HEIGHT / 2) * s * ss - t
        draw.text((x, y), WORD, font=font, fill=color)
        img.resize((width, height), Image.LANCZOS).save(out / f"omniradar-logo{suffix}.png")


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    font_path = Path(sys.argv[1])
    out = Path(__file__).resolve().parents[2] / "public" / "brand"
    out.mkdir(parents=True, exist_ok=True)
    total_w = write_svgs(out, font_path)
    write_pngs(out, font_path, total_w)
    for f in sorted(out.iterdir()):
        print(f"wrote {f.relative_to(out.parents[1])} ({f.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
