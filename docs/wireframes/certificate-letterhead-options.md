# Certificate letterhead — options B and C

**Status**: option B is implemented in `CalibrationCertificatePDF.tsx` — the left anchor,
the word-spaced name, the accreditation line, the right-aligned contact block, the rule,
and the Oswald title. The company name is Impact 20 pt as specified below.

Impact is licensed with Windows and is on no CDN, and the certificate renders both on the
server and in the browser, so it is embedded as a data URL from
`packages/assets/fonts/impact.ttf` rather than fetched like Roboto and Oswald. Its ascent
is read from the font by `packages/assets/scripts/generate-impact-font.mjs`: react-pdf
places text by the top of the em box, and Impact's 1.0088 against Oswald's 1.193 is worth
three and a half points on the baseline.

Option C is still only designed.

Two replacements for the letterhead in `apps/web-hta/src/components/pdf/CalibrationCertificatePDF.tsx`
(Section A, plus the Section B title). Both were proofed by drawing them onto a real
certificate and measuring the result; every number below came off a rendered page, not
off a stylesheet.

Proofs live beside the source certificate in `reference_docs/`:

| file | what it is |
|---|---|
| `Sample Cert 002.pdf` | the certificate the app produced, 11 Sep 09:25 |
| `Cert - header NOW (current).pdf` | the same certificate, current letterhead, for comparison |
| `Cert - header B (left anchor).pdf` | option B |
| `Cert - header C (ruled cap).pdf` | option C |

The proofs were made by replacing the top 111 pt of each page — the body, tables and
watermark are the app's own output, untouched.

---

## Page geometry both options must respect

Taken from the certificate as it stands. Nothing here should move: the header redesign
must not shift where the body starts.

| | value |
|---|---|
| Sheet | A4, 595 × 842 pt |
| Margins | 40 pt left and right, so 515 pt of content |
| Header band | 0 → 84.7 pt |
| Rule under the letterhead | y = 84.7 |
| First table edge | y = 115.0 (y = 133.6 on a page that opens with a heading) |
| Title band | between the rule and the first table edge |

## Colours

| token | value | used for |
|---|---|---|
| brand | `#0099CC` | the rule, the accreditation line, the title |
| ink | `#101820` | the company name |
| slate | `#64748B` | contact detail |
| hairline | `#CBD5E1` | the rules either side of C's address |
| faint | `#94A3B8` | the page folio |

## Faces

| face | where from | used for |
|---|---|---|
| **Impact** | Windows system font, `C:\Windows\Fonts\impact.ttf` | the company name, both options |
| **Oswald SemiBold** | Google Fonts variable `Oswald[wght].ttf`, instantiated at `wght 600` | the title, both options |
| Roboto 400 / 500 | already registered by the component | everything else in the header |

Oswald's static files are no longer published under `ofl/oswald/static/`; take the
variable font and instantiate it with `fontTools.varLib.instancer`. Rename the instance
(`name` IDs 1, 2, 4, 6) or the PDF reports every weight as `Oswald-Regular`.

---

## Option B — left anchor

The name reads first off the logo; all contact detail sits in one right-aligned block.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌────┐  HTA INSTRUMENTATION (P) LTD.     # 73, Ramachandra Agrahara, │
│ │LOGO│  ISO CERTIFIED · NABL ACCREDITED       Near T.R. Mills,       │
│ └────┘  LABORATORY                    Chamarajpet, Bangalore 560 018 │
│                                    Tel +91 80 2674 9750 · 2675 9253  │
│                                                      · 2674 0681     │
│                                              Mob +91 73537 53764     │
│                                  www.htaipl.com · calibration@…      │
│ ──────────────────────────────────────────────────────────────────── │  1 pt brand
│                    Data Sheet Calibration              Page 1 of 3   │
└──────────────────────────────────────────────────────────────────────┘
```

| element | spec |
|---|---|
| Logo | 52 × 52 pt at x 40, y 22 → 74 |
| Company name | Impact 20 pt, ink, x = 104, baseline 50.7, word spacing +0.10 em |
| Accreditation | Roboto Medium 7.5 pt, brand, x = 104, baseline 63.7, tracking 0.8 |
| Contact block | Roboto 7.5 pt, slate, right-aligned to x 555, five lines, baselines 27 + 11.8 n |
| Rule | 1 pt brand, full content width, y 84.7 |

Contact lines, in order:

```
# 73, Ramachandra Agrahara, Near T.R. Mills,
Chamarajpet, Bangalore 560 018
Tel +91 80 2674 9750  ·  2675 9253  ·  2674 0681
Mob +91 73537 53764
www.htaipl.com  ·  calibration@htaipl.com
```

**The three blocks share one vertical centre at 48.0.** Left to themselves the logo
centred at 41, the name and accreditation at 38 and the contact block at 48 — three
heights in a row that reads as one line.

---

## Option C — ruled cap

Centred and formal; the address sits between hairlines.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌────┐        HTA INSTRUMENTATION (P) LTD.                           │
│ │LOGO│   ISO CERTIFIED COMPANY · NABL ACCREDITED CALIBRATION LAB     │
│ └────┘                                                               │
│ ───────  # 73, Ramachandra Agrahara, Chamarajpet, Bangalore  ─────── │  0.5 pt hair
│      Tel +91 80 2674 9750 · 2675 9253 · 2674 0681   Mob …  www…      │
│ ──────────────────────────────────────────────────────────────────── │  1 pt brand
│                    Data Sheet Calibration              Page 1 of 3   │
└──────────────────────────────────────────────────────────────────────┘
```

| element | spec |
|---|---|
| Logo | 46 × 46 pt at x 40, y 13 → 59 |
| Company name | Impact 19 pt, ink, centred on the page, baseline 34, word spacing +0.10 em |
| Accreditation | Roboto Medium 7 pt, brand, centred, baseline 45, tracking 1.4, uppercase |
| Address | Roboto 7.5 pt, slate, centred, baseline 61 |
| Address hairlines | 0.5 pt hairline at y 58.5, from the margin to 9 pt clear of the text, both sides |
| Contact line | Roboto 7.5 pt, slate, centred, baseline 75 |
| Rule | 1 pt brand, full content width, y 84.7 |

Address and contact text:

```
# 73, Ramachandra Agrahara, Chamarajpet, Bangalore 560 018
Tel +91 80 2674 9750  ·  2675 9253  ·  2674 0681      Mob +91 73537 53764      www.htaipl.com
```

---

## The title and folio — the same in both

| element | spec |
|---|---|
| Title | Oswald SemiBold **9.33 pt**, brand, sentence case, centred on the page |
| | tracking 0.8, word spacing +0.10 em, glyphs widened ×1.15 |
| Folio | Roboto 8 pt, faint, right-aligned to x 555, **below** the rule on the title's line |

**Why 9.33 pt.** Oswald's ascender is 1.193 of the em against Roboto Bold's 0.928, so
12 pt of Oswald prints as tall as 14 pt of Roboto. 9.33 pt is the size whose ink height
(13.83 pt) reads as a 12 pt title.

**Vertical centring.** Both the title and the folio are centred in the band between the
rule and the first table edge. The band's midpoint is not the baseline, because a line's
ink is not centred in its em box. Measured off rendered pages:

```
baseline = (CONTENT + RULE) / 2 + k × size

  k = 0.452   Oswald, lowercase with ascenders
  k = 0.400   Impact, all caps
  Roboto Bold: baseline = (CONTENT + RULE + 0.685 × size) / 2
```

Both land within 0.01 pt of centre on every page.

---

## Findings worth keeping

**The current letterhead is 16 pt off-centre.** It centres its block between the logo
(60 pt) and the phone column (95 pt). Unequal flanks put the block at x 281.5 against a
page centre of 297.5 — so the title and every table below it sit 16 pt to its right.
Both options centre on the page instead; in B that is moot, since it is left-anchored.

**The title sits high in its band today.** 2.8 pt above, 11.1 pt below. It is pinned to
a fixed baseline with no relation to the band it sits in.

**Impact has one weight, and cannot be lightened.** Filling the glyph and stroking it in
white — PDF render mode 2 — thins every stem, but it removes the same amount from every
edge, which a thick stem shrugs off and a dot, a crossbar or the counter of an `a` does
not. Measured at 12 pt: 0.07 of the size closes the counter of `a` and detaches the dot
of `i`; 0.04 is the most that leaves every letter sound. This is why the title is Oswald
and not a faked-light Impact.

**Word spacing, not tracking.** The printed letterhead's name is Impact at its own
letter spacing with the word spaces opened by about a tenth of an em — measured letter
gap 0.063 of the cap height against Impact's own 0.061. It is not tracked out and not
stretched.

---

## Still open

- Which option, if either.
- Whether the current letterhead's 16 pt centring error should be fixed on its own,
  independently of this.
- Both options mix two faces — Impact for the name, Oswald for the title. If one family
  throughout is wanted, Oswald Bold for the name is the obvious move.
