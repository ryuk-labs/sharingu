#!/usr/bin/env python3
"""tools/make-card-fonts.py — the MCP App card's own small faces (sprint 12, 12.6).

The card (src/previewcard.js, ui://sharingu/card) is ONE self-contained document: the host's sandbox gives it no network,
so it cannot fetch /fonts/*. It carries the three brand faces INLINE, as woff2 data: URIs (its CSP allows `font-src data:`
and nothing broader). To keep the template small, each face is cut to what the card draws:

  manrope.woff2         Manrope, the weight axis kept 400..800 (the card's 400/500/600/700/800), printable ASCII and the
                        typographic marks the card's lines carry (… · × – — ‘ ’ “ ” • → −), kerning and tabular figures
  jetbrains-mono.woff2  JetBrains Mono, the weight axis 400..600, printable ASCII and · … → –
  fredoka.woff2         Fredoka at 600 only, the letters of the wordmark "sharingu" alone

A character outside a subset falls back to the next face of the stack (the system's), glyph by glyph.

  python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli
  /tmp/ft/bin/python tools/make-card-fonts.py        # writes engine/assets/fonts/card/*.woff2 from engine/assets/fonts/*.woff2
  node tools/make-fonts.mjs                          # then bundles them into src/fontdata.js (CARD_FONT_B64)

The source faces are SIL Open Font License 1.1 (engine/assets/fonts/*-license.txt; no Reserved Font Name), which allows
a subset; the licences cover the cut files too.
"""
import io
import os
import sys

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools import subset
except ImportError:
    sys.exit("make-card-fonts: needs fonttools and brotli (pip install fonttools brotli), see the header")

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ENGINE, "assets", "fonts")
OUT = os.path.join(SRC, "card")
MARKS = [0x00A0, 0x00B7, 0x00D7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2192, 0x2212]
ASCII = list(range(0x20, 0x7F))
FACES = [
    # (file, the weight axis kept, the code points, the layout features)
    ("manrope.woff2", (400, 800), ASCII + MARKS, ["kern", "tnum"]),
    ("jetbrains-mono.woff2", (400, 600), ASCII + [0x00B7, 0x2026, 0x2192, 0x2013], []),
    ("fredoka.woff2", 600, sorted({ord(c) for c in "sharingu"}), []),
]


def cut(name, wght, codes, features):
    font = TTFont(os.path.join(SRC, name), recalcTimestamp=False)
    font = instancer.instantiateVariableFont(font, {"wght": wght})
    tmp = io.BytesIO()
    font.save(tmp)                 # a saved and reread font: the subsetter reads every table whole (a lazy one fails)
    tmp.seek(0)
    font = TTFont(tmp, recalcTimestamp=False)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = features
    opts.hinting = False
    opts.name_IDs = ["*"]          # the names (and the licence's copyright line) stay
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=codes)
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return buf.getvalue()


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name, wght, codes, features in FACES:
        data = cut(name, wght, codes, features)
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        total += len(data)
        print(f"  {name}: {len(data)} bytes")
    print(f"wrote assets/fonts/card/: {total} bytes of woff2 ({(total * 4 + 2) // 3} as base64)")


if __name__ == "__main__":
    main()
