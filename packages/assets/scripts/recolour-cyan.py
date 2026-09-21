#!/usr/bin/env python
"""
The tagged logo, redrawn in the brand cyan.

For the certificate letterhead only. Everything else - the sidebar, the desktop
icon, the emails - keeps the mark as it is; this exists because the certificate
sets the company name, the title, the rule and the footer in #0099CC, and a
navy-and-red mark beside all of that is two more colours than the page wants.

The whole mark goes cyan, not just the navy: the square, the "HTA", the (R) and
the tagline. The white circle stays white, because it is a hole in the mark
rather than a part of it.

How, and why not simply by luminance: the navy prints darker than the red, so
blending each pixel toward cyan in proportion to its own darkness would set the
square in a deep cyan and the letters in a pale one, and pale letters inside a
white circle barely read. Instead anything at or below the red's own luminance
counts as solid ink and gets the full colour; only lighter pixels - which are
the antialiased edges and nothing else - blend, so the curves stay smooth.

Writes the recoloured JPEG as base64 on stdout; generate.mjs writes the file.
"""
import base64
import io
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.stderr.write('Pillow is not installed\n')
    sys.exit(2)


def _brand_cyan() -> tuple:
    """The cyan from brand.json, so the ink matches the type it sits beside.

    Read rather than repeated: the certificate sets its own HTA_BLUE and a second copy
    of a hex here is a copy that eventually says something else. brand-colour.test.ts
    fails if any of them drift.
    """
    path = Path(__file__).resolve().parents[1] / 'brand.json'
    value = json.loads(path.read_text(encoding='utf-8'))['cyan'].lstrip('#')
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


BRAND = _brand_cyan()

# Rec. 601 luma, which is what "how dark does this look" means here.
def luma(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


# The red "HTA" is the lightest thing in the mark that is still solid ink.
# Everything at least this dark is painted at full strength.
SOLID_AT = luma(0xE0, 0x20, 0x20)
# Above this a pixel is the paper, or the circle, and is left alone.
PAPER_AT = 250.0


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write('usage: recolour-cyan.py <source.jpg>\n')
        return 2

    image = Image.open(Path(sys.argv[1])).convert('RGB')
    pixels = image.load()
    width, height = image.size
    span = PAPER_AT - SOLID_AT
    painted = 0

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            light = luma(r, g, b)
            if light >= PAPER_AT:
                continue
            # 1 for solid ink, tapering to 0 as a pixel approaches the paper.
            weight = 1.0 if light <= SOLID_AT else (PAPER_AT - light) / span
            pixels[x, y] = (
                round(255 + (BRAND[0] - 255) * weight),
                round(255 + (BRAND[1] - 255) * weight),
                round(255 + (BRAND[2] - 255) * weight),
            )
            painted += 1

    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=95)
    sys.stdout.write(base64.b64encode(buffer.getvalue()).decode('ascii'))
    sys.stderr.write(f'    painted {painted * 100 / (width * height):.1f}% of the pixels cyan\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
