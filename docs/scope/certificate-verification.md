# Certificate Verification — Read From the Actual PDFs

**Created**: 2026-09-02
**Source**: `reference_docs/master_list/MASTER LIST AS PER ASSENT NUMBER 02032026/*.pdf`
**Method**: pages read visually (the PDFs are scanned images with no text layer)

Verifies the 6 conflicts and the 10 empty-bucket assets identified in
`parameter-inventory-findings.md` against the actual calibration certificates.

---

## Headline: `capability_appendix` contains fabricated data

Two of the six "conflicts" turned out to be the registry's `capability_appendix`
inventing capabilities that appear **nowhere** in the certificate. This is worse than a
naming mismatch — it means the appendix cannot be trusted as a data source without
certificate verification.

| Asset | `capability_appendix` claims | Certificate actually says |
|---|---|---|
| 909 | Frequency, 10 Hz – 6 MHz, 2 channels | **RPM only.** No frequency anywhere. |
| 738 | Time interval, 0–24 h | **Pressure + Vacuum in bar.** No time measurement anywhere. |

Both certificates are unambiguously for the right asset (ID numbers match on the
certificate face), so this is not a mis-filed certificate — it is bad extraction.

---

## Verified results

### 909 HTAIPL/L — Tachometer Calibrator ✅ master list correct

TransCal TSC/25-26/4881-1 · calibrated 09 Jun 2025 · due 08 Jun 2026

- Nomenclature: **"Tachometer Calibrator (Speed Source)"** — Sansel RPMC1700-2A
- **RPM · Range 0–100000 rpm · LC 0.1 rpm · Accuracy ±5 rpm**
- 11 points, 6 rpm → 99000 rpm, all Pass

**Corrections to the registry:**
- `role` should be **source**, not `measuring` (nomenclature says "Speed Source")
- The Contact / Non-Contact split is **not in the certificate** — it calibrates one RPM
  capability. The split comes from the spreadsheet's
  `"Speed (Contact & Non Contact)"`, which describes what the source can drive, not two
  separate capabilities.
- Accuracy is marked **"(Claimed by Customer)"** — not lab-verified. See caveat below.

### 738 HTAIPL/L — Digital Pressure Gauge ✅ range split resolved

TransCal TSC/25-26/16176-3 · calibrated 02 Dec 2025 · due 01 Dec 2026 · Adarsh EN-501

The certificate splits the two parameters across separate pages, exactly as the
backfill's `needs-range-split` guard predicted:

| Parameter | Range | LC | Accuracy |
|---|---|---|---|
| Pressure (p2) | **0 to 6 bar** | 0.0001 bar | ±0.05 % FS |
| Vacuum (p3) | **−1 to 0 bar** | 0.0001 bar | ±0.05 % FS |

Applying the spreadsheet's combined `-1 to 6 bar` to both would have overstated each.
Accuracy again marked "(Claimed by customer)".

### 853 HTAIPL/L — Digital Manometer ⚠️ appendix correct, master list wrong

PI Calibration Laboratory PICAL/1025/P/246 · calibrated 03.11.2025 · due 03.11.2026 · Testo 512

- Results table is headed **GAUGE PRESSURE**; "Parameter of Measurement: Pressure"
- **Range 0 to 2.000 mbar · Resolution/LC 0.001 mbar · Accuracy ±0.5 % of Full Scale**
- Summary reports observed error **0.23 % FS**; expanded uncertainty ±0.002 mbar (k=2)
- 11 points, 3 up/down cycles

**Discrepancies with the master list:**
- Parameter: certificate **Gauge Pressure** vs master list **Differential Pressure**.
  A Testo 512 *is* a differential manometer, and gauge pressure is differential against
  atmosphere, so both are defensible — but they must not be two different standards.
- Unit: certificate **mbar** vs spreadsheet **hPa**. Numerically identical (1 mbar = 1 hPa)
  but the labels differ, and unit-matching in pre-filtering is string-based today.

### 600 HTAIPL/L — Vibration Meter ⚠️ appendix correct, spreadsheet wrong

TransCal TSC/24-25/22042-3 · 4 pages · three measurement modes

| Mode | Range | LC | Accuracy |
|---|---|---|---|
| Acceleration (peak) | 0.1 – 400 m/s² | 0.1 m/s² | not stated |
| **Velocity (peak)** | **0.01 – 400.0 mm/s** | **0.01 mm/s** | not stated |
| Displacement (peak-to-peak) | (page 4) | | |

- The spreadsheet's `5.5 mm/s to 135 mm/s` appears **nowhere** in the certificate.
- Calibrated at four excitation frequencies (10, 50, 100, 300 Hz); velocity points span
  1.17 – 48.97 mm/s, far short of the 400 mm/s declared range.
- **No accuracy is stated at all** — only measurement uncertainty (±2.89 %). For this
  asset the uncertainty is the only usable filter input.
- Needs **three** capability profiles, not one. The registry has zero.

### 35 HTAIPL/L — Granite Surface Plate ⚠️ appendix correct, master list wrong

TransCal TSC/24-25/22042-4 · Jafuji 400×400 mm · standard used: Wyler Electronic Level

- Parameter is **Flatness**, not Level. "Level" is how the plate is used; flatness is
  what was measured.
- **Measured flatness 3.75 µm** (point heights −2.81 µm to +0.94 µm over a 4×4 grid)
- Permitted tolerance per **IS 7327-2003** for 400×400: Grade 0 = 4 µm, Grade 1 = 8,
  Grade 2 = 16, Grade 3 = 32. At 3.75 µm the plate is **within Grade 0**.
- Measurement uncertainty ±1.3·√((L+W)/100) µm
- Certificate explicitly provides **no conformity statement**
- `400*400 mm` sits in the certificate's **Model/Range** field, confirming it is the
  artifact's size, not a measurement span.

### 227 HTAIPL/L — Digital Lux Meter ⚠️ both sources wrong

WIKA C-250811-37-1 · Delta OHM HD 2302.0 · calibrated 13/08/2025 · due 13/08/2026

- **Declared range 0 to 199990 Lux** — matches neither the spreadsheet (100–10000)
  nor the appendix (0–19999)
- **Resolution 0.01 / 0.1 / 1 / 10 / 100 Lux** (five steps)
- **Accuracy ±4 % rdg**; expanded uncertainty ±4.9 % rdg (k=2)
- **Operating Range: 60 to 5000 Lux** — a separate field on the certificate

Result buckets, with least count varying per bucket exactly as `BucketData` models:

| Bucket | Least count | Accuracy at points |
|---|---|---|
| 0 – 199.99 Lux | 0.01 Lux | ±2.4 Lux @ 60 |
| 200 – 1999.9 Lux | 0.1 Lux | ±8 @ 200, ±20 @ 500, ±40 @ 1002 |
| 2000 – 19999 Lux | 1 Lux | ±120 @ 3003, ±200 @ 4990 |

Note the certificate carries **three different spans**: declared (0–199990), bucketed
(0–19999) and actually calibrated (60.02–4990). Also: "The Lux Meter is not Verified for
Spectral responsivity."

---

## Two modelling gaps this exposes

**1. Reference artifacts don't fit `CapabilityProfile`.** A granite surface plate, slip
gauge set or weight box has no min/max measuring range — its capability is a *nominal
value with a deviation* (plate: 3.75 µm flatness; slip gauge: nominal size ± grade
tolerance). Forcing them into `{parameter, min, max, buckets[]}` misrepresents them, and
several of the 16 zero-profile assets are exactly this kind. Worth a distinct
`artifact` capability shape.

**2. "Operating range" is a master attribute too.** Scope §3.2 models operating range as
a UUC-only concept with a "Not Applicable" checkbox. Asset 227's certificate states an
**Operating Range (60–5000 Lux)** distinct from the declared range (0–199990) and from
the calibrated span (60–4990). If masters carry an operating range, pre-filtering in
§1.3 should arguably use it rather than the declared range.

### Range semantics — a correction

An earlier draft of this document treated the gap between the declared range and the
span of calibration points as a traceability problem (227: declared 0–199990 but
calibrated 60–4990; 755: declared 100,000 ppm but span gases to 25,000; 600: declared
400 mm/s but points to 49). **That was wrong.**

Per the lab, the **declared range is the capability**. Calibration points are samples
within it, not a bound on it: the accuracy and least count established at the lowest
calibrated point extend down to the declared minimum, and those at the highest point
extend up to the declared maximum.

So for a hypothetical instrument declared −100 to 100 with points from −20 to 60, the
capability is the full −100 to 100, with the −20 bucket's figures extending to −100 and
the 60 bucket's extending to 100.

This is how `scripts/apply_certificate_findings.py` builds buckets: outermost buckets
span to the declared limits. Asset 227 is the visible case — its top calibrated bucket
(2000–19999 Lux, LC 1 Lux) is written as 2000–**199990** Lux.

One caveat worth carrying: 227's resolution list is 0.01/0.1/1/10/100 Lux, so finer
bucket boundaries probably exist above 19999 Lux that this calibration did not exercise.
The extended top bucket keeps LC 1 Lux, which is conservative.

---

## Cross-cutting caveat: "Claimed by Customer" accuracy

Both TransCal certificates (909, 738) mark the accuracy figure **"(Claimed by Customer)"** —
the lab measured deviation and uncertainty, but the *accuracy limit* used for the
pass/fail decision was supplied by HTA, not independently established.

This matters for §1.3 pre-filtering: an accuracy that is customer-claimed is a weaker
basis for "this master is good enough for that UUC" than a lab-determined one. The
measurement uncertainty column *is* lab-determined and is arguably the better filter
input. Worth deciding deliberately rather than treating all accuracy values alike.

---

## The empty-bucket assets: most are NOT bucket-less

Read from certificates, 7 of the 10 have real least-count and/or accuracy data.

| Asset | Instrument | Parameter | Range | Least count | Accuracy |
|---|---|---|---|---|---|
| 1003 | Micrometer | Length | 0–25 mm | **0.001 mm** | **±2 µm** |
| 45 | Dial Gauge | Length | 0–10 mm | **0.01 mm** | **±0.02 mm** |
| 44 | Lever Dial Gauge | Displacement | 0–0.14 mm | **0.001 mm** | not stated |
| 227 | Digital Lux Meter | Illuminance | 0–199990 Lux | **0.01/0.1/1/10/100** | **±4 % rdg** |
| 853 | Digital Manometer | Gauge Pressure | 0–2 mbar | **0.001 mbar** | **±0.5 % FS** |
| 742 | Pirani Gauge | Vacuum | 10⁻³–10³ mbar | not stated | **±10 %** (acceptance criterion) |
| 755 | CO2 Transmitter | CO2 | 0–100000 ppm | not stated | **±1 %** |
| 600 | Vibration Meter | Velocity | 0.01–400 mm/s | **0.01 mm/s** | not stated (unc. ±2.89 %) |
| 783 | Slip Gauge set | Length | 10 discrete blocks | n/a — artifact | per-block deviation |
| 782 | Caliper Checker | Length | 2 capabilities | n/a — artifact | per-block error |

Only 44 and 600 are genuinely accuracy-less (both give measurement uncertainty instead).

### 742 HTAIPL/L — Ultra Vacuum ✅ unit and accuracy both found

HHV Thermal 1421112K25 · 11/11/2025 · valid 10/11/2026 · DHPG-222 + HPS-2 head, Sl.No 525/61

- Certificate face states **"Range : 1 x 10³ To 1x10⁻³ m.bar"** — the unit is explicit, not inferred
- **Acceptance Criteria: Pirani gauge ±10 % of the Master gauge** — ACCEPTED
- 10 points from 1.0×10⁻³ to 1.0×10³ mbar; traceable to **NPL Standard**
- `capability_appendix` recorded accuracy as NOT_STATED — wrong; ±10 % is on the certificate
- Caveat: ±10 % is an acceptance criterion, and very coarse for a master (poor TUR)

### 755 HTAIPL/L — CO2 Transmitter ✅ declared-vs-calibrated gap confirmed

Tritech HTA-004/24-25 · 21.03.25 · valid till 20.03.26 · Sense Air 045-7-0032-01

- **Range: CO2 100,000 PPM (10%)** — confirms the spreadsheet
- **Calibration Accuracy ±1 %** at every point. The appendix's "0.0% error" was the
  *observed* error, not the accuracy limit.
- Span points: zero (99.99 % N₂), 4,000 / 9,000 / **25,000 ppm** — so verified only to
  25,000 ppm against a declared 100,000
- Certificate covers a **second parameter the registry lacks: Temp 0 to 50 °C**
- Alarm setting 15,000 ppm

### 783 / 782 / 30 / 237 — reference artifacts, not instruments

**783** (CMTI 24/53/01/041-S/3/341-A) is a **set of 10 discrete gauge blocks**, each with
its own nominal size (2.5 … 25 mm) and **deviation at centre** (−0.031 to +0.109 µm) plus
min/max overall variation. There is no continuous range and no least count.

**782** (CMTI …341-B) has **two** capabilities, not one:

| Capability | Blocks | Span | Max error |
|---|---|---|---|
| Pitch blocks for **height** | 0, 50, 100, 150, 200, 250, 300, 330, **370** | 0–370 mm | −0.0011 mm |
| Pitch blocks for **outside** | 0, 20, 50, 100, 150, 200, 250, 300 | 0–300 mm | −0.0013 mm |

The spreadsheet's `300 mm` captures only the outside measurement and loses the 370 mm
height capability entirely.

**These confirm the artifact modelling gap.** A slip-gauge set can supply only its
nominal sizes (or stacked combinations) — modelling it as `{min: 2.5, max: 25}` claims it
can supply any value in between, which is false. Same for the surface plate (35) and the
weight boxes.

### 45 HTAIPL/L — Dial Gauge: the lab calibrates its own masters

HTA's own certificate HTA/C23829/03/26 (procedure NLAB/CAL/ML7/R01), and the master used
is **SLIP GAUGES Sl.No 30 HTAIPL/L** — one of the assets whose spreadsheet Range reads
`NA` and which I had classed unresolvable. So an asset with no recorded capability is
actively serving as a master in the lab's own calibration chain. Any UI that hides
capability-less masters would hide this one.

Also: the certificate calls the parameter **Length**; the registry says **Thickness**.
The same disagreement appears on 1003 and 44.

---

## Status — all 13 verified

| Asset | Outcome |
|---|---|
| 909 | master list correct; **appendix fabricated Frequency**; role→source; no Contact/Non-Contact split |
| 738 | range split resolved: Pressure 0–6 bar, Vacuum −1–0 bar; **appendix fabricated Time interval** |
| 853 | appendix correct; Gauge vs Differential Pressure, mbar vs hPa to settle |
| 600 | appendix correct; spreadsheet range wrong; needs 3 profiles |
| 35 | appendix correct; parameter is Flatness; artifact, no range |
| 227 | **both sources wrong**; declared 0–199990 Lux; 3 buckets; operating range 60–5000 |
| 742 | unit **mbar** + accuracy **±10 %** confirmed from certificate |
| 755 | range confirmed; accuracy **±1 %**; calibrated only to 25,000 ppm; extra Temp parameter |
| 1003 | LC 0.001 mm, ±2 µm confirmed |
| 45 | LC 0.01 mm, ±0.02 mm; master is asset 30 |
| 44 | LC 0.001 mm; no accuracy stated |
| 783 | artifact: 10 discrete blocks with per-block deviation |
| 782 | artifact: **two** capabilities (height 0–370, outside 0–300) |
