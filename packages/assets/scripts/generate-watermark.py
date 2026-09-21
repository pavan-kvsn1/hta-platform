#!/usr/bin/env python
"""
The watermark behind the certificate, in the brand cyan.

The page prints the company name, the title, the rule and the footer in #0099CC, and
the watermark sits under all of it at 15% opacity. In navy and red it read as a grey
smudge with a warm patch where the letters are; in cyan it reads as the mark, faintly.

Recoloured from packages/assets/logos/hta-logo-with-tag.jpg, which is what the watermark
has always been - the mark with its (R) and "Committed to the Customer since 1989". The
clean logo is the nearly identical square and it is tempting to reach for; it drops both
of those, and at 15% opacity nobody would notice until the certificate was printed.

Same rules as recolour-cyan.py, imported rather than copied so the two cannot drift
apart. Full size first, then down to the size the existing watermark used: recolouring
before the downscale means LANCZOS averages pixels that are already cyan, so the edges
stay smooth.

Unlike logo-base64.ts, this writes a file that nothing regenerates during a build, so
there is no Pillow-missing path to fall back on. Run it by hand when the mark changes:

    python packages/assets/scripts/generate-watermark.py
"""
import base64
import importlib.util
import io
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.stderr.write('Pillow is not installed: python -m pip install Pillow\n')
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'packages' / 'assets' / 'logos' / 'hta-logo-with-tag.jpg'
TARGET = ROOT / 'apps' / 'web-hta' / 'src' / 'components' / 'pdf' / 'watermark-base64.ts'
# What the watermark has always been. react-pdf draws it at 300x300pt regardless; this
# is about how much detail survives, and how many bytes ride along in every bundle.
SIZE = (931, 911)


def colour_rules():
    """The cyan rules from recolour-cyan.py, whose filename is not importable as-is."""
    path = Path(__file__).with_name('recolour-cyan.py')
    spec = importlib.util.spec_from_file_location('recolour_cyan', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if not SOURCE.exists():
        sys.stderr.write(f'no source logo at {SOURCE}\n')
        return 2

    rules = colour_rules()
    image = Image.open(SOURCE).convert('RGB')
    pixels = image.load()
    width, height = image.size
    span = rules.PAPER_AT - rules.SOLID_AT
    painted = 0

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            light = rules.luma(r, g, b)
            if light >= rules.PAPER_AT:
                continue
            weight = 1.0 if light <= rules.SOLID_AT else (rules.PAPER_AT - light) / span
            pixels[x, y] = (
                round(255 + (rules.BRAND[0] - 255) * weight),
                round(255 + (rules.BRAND[1] - 255) * weight),
                round(255 + (rules.BRAND[2] - 255) * weight),
            )
            painted += 1

    print(f'  painted {painted * 100 / (width * height):.1f}% of {width}x{height} cyan')

    image = image.resize(SIZE, Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=95)
    encoded = base64.b64encode(buffer.getvalue()).decode('ascii')

    TARGET.write_text(
        f"export const HTA_WATERMARK_BASE64 = 'data:image/jpeg;base64,{encoded}';",
        encoding='utf-8',
        newline='',
    )
    print(f'  wrote {TARGET.name}: {SIZE[0]}x{SIZE[1]}, {len(encoded)} base64 chars')
    return 0


if __name__ == '__main__':
    sys.exit(main())
