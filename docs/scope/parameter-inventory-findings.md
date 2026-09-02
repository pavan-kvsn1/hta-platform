# Parameter Inventory — Findings from the Master Registry

**Created**: 2026-09-02
**Source**: `reference_docs/master_list/master_details/master_instrment_registry.json` (schema 1.0, 204 assets)
**Produced by**: `scripts/extract_parameter_inventory.py` → `docs/scope/parameter-inventory.json`

This validates the assumptions in `master-spec-integration-scope.md` §5 (Parameter Types
Expansion) and §1.3 (UUC-Based Pre-filtering) against the actual registry, before the
seed script and filtering logic are written against them.

---

## Headline: there are two parameter vocabularies, and they disagree

The registry names parameters in two independent places:

| Vocabulary | Where | Size | Used by |
|---|---|---:|---|
| **Asset-level** | `asset.parameters[]` — a flat list of labels | **41** | nothing yet |
| **Profile-level** | `capability_profile.parameter` | **57** | master pre-filtering (§1.3) |

The scope doc's "**extract all 41 parameters**" is the **asset-level** list. But every
filtering rule in §1.3 matches against `capability_profile.parameter` — the **57**-name
vocabulary. Seeding from one and filtering on the other breaks the match for every name
that differs.

They differ substantially: **12** asset-level names have no profile counterpart, and
**28** profile-level names never appear in an asset list.

**Only in asset-level:** `AC/DC Current`, `AC/DC Voltage`, `CO2`, `Dew Point`, `Force`,
`Level`, `Power`, `Sound Intensity`, `Ultra Vacuum`, `Vibration Velocity`, `Volume`, `Weight`

Some are renames the seed must map (`Weight`→`Mass`, `Dew Point`→`Dew Point Temperature`,
`Sound Intensity`→`Sound Pressure Level`, `Level`→`Level / Inclination`). Others —
`CO2`, `Volume`, `Ultra Vacuum` — have no profile coverage at all.

Note this contradicts the scope doc's stated direction in one place: it lists
"AC/DC Voltage [merged]" as the target, but the registry's **profiles** have already
*split* these into `AC Voltage` / `DC Voltage` / `AC Current` / `DC Current`.

> **Decision needed**: which vocabulary is the source of truth for
> `CalibrationParameterStandards`? Recommendation: seed from **profile-level (57)**,
> since that is what filtering matches, and carry an alias table for the 12 asset-level
> names so legacy data still resolves.

---

## Why the two vocabularies differ: provenance

Cross-checking against `reference_docs/master_list/MASTER LIST AS PER SOP & PARAMETER.xlsx`
(sheet `MASTER LIST AS PER SOP`, 215 rows, 202 with asset numbers) settles the question.
The registry's own metadata names two source files, and each vocabulary comes from a
different one:

```
MASTER LIST AS PER SOP & PARAMETER.xlsx   HTA_capability_matrix_result_inferred.json
  PARAMETER column (free text)                        |
        |                                             |
        v                                             v
  asset.parameter_raw                        capability_profiles[].parameter
        |                                          (57 names)
        v
  asset.parameters[]  (41 names)
```

**The 41 are lab-authored** — a human wrote them in the SOP spreadsheet, e.g.
`"SOURCE (RTD & TC) (AC/DC VOLTAGE &AC/DC CURRENT) (FREQUENCY ,RESISTANCE & CAPACITANCE )"`,
which the parser split into a parameter list. **The 57 are machine-inferred** — note the
source filename literally ends `_inferred`.

This matters because **the inferred names sometimes correct or specialize the lab's own
terminology**:

| Lab wrote (Excel) | Inferred profile name | What happened |
|---|---|---|
| `Sound Intensity` | `Sound Pressure Level` | Physics correction — a dB meter measures SPL, not intensity (W/m²) |
| `POWER` | `Three-phase AC Power` | Specialization, not declared by the lab |
| `Velocity` | `Velocity` | Unchanged — but the *parser* enriched the asset-level copy to `Vibration Velocity` |
| `AC/DC VOLTAGE` | `AC Voltage` + `DC Voltage` | Split into the two quantities actually calibrated |

> **This maps directly onto the §5 customName feature.** The corrected/canonical term is
> the `standardName`; the lab's own word from the spreadsheet is the natural default for
> `customName`. The Excel therefore isn't just a cross-check — it is the seed data for
> each org's initial parameter naming, which §5.2 currently defaults to
> `customName = standardName`. Defaulting to the lab's own vocabulary instead would mean
> the UI reads the way their SOPs already read on day one.

**Recommendation stands but is now better grounded**: seed `CalibrationParameterStandards`
from the profile-level names (they are what filtering matches, and they are the
metrologically corrected ones), and seed each org's `CalibrationParameters.customName`
from the spreadsheet term where it differs.

---

## Coverage gaps that break pre-filtering

§1.3 filters masters by `capability_profile[param].min/max/accuracy`. Two populations
cannot satisfy that filter at all:

**16 of 204 assets (8%) have zero capability profiles.** They have `parameters[]` labels
but no profile, so they can never appear in an "eligible masters" list — they would
silently vanish from selection:

| Asset | Description | Declared parameters |
|---|---|---|
| 165 HTAIPL/L | 6½ Digit Precision Multimeter | AC/DC Voltage, AC/DC Current, Frequency, Resistance, Capacitance |
| 237, 30, 783 HTAIPL/L | Slip Gauges | Thickness |
| 1003 HTAIPL/L | Micrometer | Thickness |
| 44, 45 HTAIPL/L | Dial Gauges | Thickness |
| 782 HTAIPL/L | Steel Caliper Checker | Length |
| 35 HTAIPL/L | Granite Surface Plate | Level |
| 600 HTAIPL/L | Vibration Meter | Vibration Velocity |
| 909 HTAIPL/L | Tachometer calibrator | Speed (Contact), Speed (Non-Contact) |
| 853 HTAIPL/L | Digital Manometer | Differential Pressure |
| 738 HTAIPL/L | Digital Pressure Gauge | Pressure, Vacuum |
| 742 HTAIPL/L | Digital Hi.Pr. Pirani Gauge | Ultra Vacuum |
| 227 HTAIPL/L | Digital Lux Meter | Light Intensity |

The precision multimeter and the pressure gauges are not obscure instruments — losing
them from selection would be visible to users immediately.

**24 of 544 profiles have zero buckets**, so they carry no least count or accuracy.
Accuracy-based filtering has nothing to evaluate; range-only filtering still works.
Affected parameters include `Air Flow`, `Level / Inclination`, `Particle Count`, `Time`.

> **Decision needed**: what does the UI do with a master that has no profile, or a
> profile with no accuracy? Options: exclude silently (current logic implies this),
> show as ineligible with a reason, or show as eligible-with-warning. §1.3 says
> "Gray out ineligible instruments with reason" — that reason needs a distinct case
> for "no capability data" versus "range/accuracy insufficient".

---

## Normalization needed before seeding

The 57 raw names are not 57 clean parameters. Grouping needed:

1. **Case-only duplicate** — `Time Interval` (6 assets) and `Time interval` (4 assets)
   are the same parameter. Seeding raw produces two rows.

2. **Thermocouple simulation is modelled twice.** Six parameters
   (`Type-J/K/N/R/S/T thermocouple simulation`, role=source, 2 assets each) plus
   `Temperature - Type K sensor` duplicate what `Thermocouple` already expresses via its
   10 subtypes. Collapse into `Thermocouple` + subtype, or keep separate deliberately.

3. **Family sprawl** — same physical quantity split across rows:
   - *Temperature*: `Temperature`, `Temperature indicator`, `Temperature sensor`,
     `Temperature Generation`, `Dew Point Temperature`, `Temperature - Type K sensor`
   - *Force* (all `kgf`): `Compression Force`, `Tension Force`, `Force - pull mode`,
     `Force - push mode`
   - *Flow*: `Air Flow`, `Compressed Air Flow`, `Flow`, `Liquid Flow`
   - *Speed*: `Speed`, `Speed (Contact)`, `Speed (Non-Contact)`
   - *Pressure*: `Pressure`, `Differential Pressure`, `Gauge Pressure`, `Vacuum`
     (scope anticipated Differential + Vacuum; **`Gauge Pressure` was not in the plan**)

4. **Unit spelling inconsistency within one parameter.** `Relative Humidity` carries
   `% RH`, `% r.h`, and `%RH` — three spellings of one unit. `Differential Pressure`
   has `mbar` and `mbar g`. The seed's `units[]` array will contain duplicates unless
   units are normalized too. This is the same class of problem the custom-name feature
   exists to solve, but it needs solving *inside* the standard, not per-org.

5. **`subtype` is overloaded.** The scope doc models subtype as thermocouple/RTD type.
   The registry also uses it for gauge-block dimensions on `Flatness` and `Parallelness`
   (`24.00mm`, `24.12mm`, `24.25mm`, `24.37mm`). A subtype dropdown labelled
   "Thermocouple/RTD type" would render these nonsensically.

---

## The accuracy model in the scope doc covers only 93% of the data

§1.1 defines:

```typescript
accuracy: {type: string, value: number, unit: string, polarity: string}
```

That matches exactly one of the three accuracy shapes the registry actually contains:

| `type` | Buckets | Shape | Fits the doc's interface? |
|---|---:|---|---|
| `symmetric` | 1401 | `{value, unit, polarity}` | Yes |
| `formula` | 109 | `{expression, percent_of, percent_value, digits, digits_unit, polarity}` | **No** — has no `value` or `unit` |
| `class` | 2 | `{raw, polarity}` | **No** — has no numeric value at all |

A formula accuracy looks like:

```json
{ "type": "formula", "expression": "+/-0.02% of reading +/-2 count",
  "polarity": "±", "percent_of": "reading", "percent_value": 0.0002,
  "digits": 2.0, "digits_unit": "count" }
```

A class accuracy is just `{"type": "class", "polarity": null, "raw": "F2 Class"}`.

**This breaks three things as specified:**

1. **§1.3 filter rule 4** — `capability_profile[param].accuracy >= UUC.accuracy` cannot be
   evaluated for a formula accuracy without a reading to resolve it against, and has no
   number at all for a class accuracy.
2. **§4.3 results validation** — "Compare error against accuracy limits" has the same
   problem, though here a reading *is* available, so formula accuracies are resolvable
   at that point.
3. **§2.2 admin capabilities tab** — rendering `±{value}{unit}` produces `±undefined`
   for 111 buckets.

`least_count` is uniform (`{value, unit}`, 1423/1423) and needs no such treatment.

> **Decision needed**: accuracy needs a discriminated union, plus an evaluator
> `resolveAccuracy(accuracy, reading) -> {value, unit} | null`. Filtering must then
> decide what to do when it returns null — 24 profiles have no buckets at all, and
> 2 more carry only a class accuracy.

---

## Normalization outcome

`scripts/build_parameter_standards.py` applies the curated map and reduces
**57 raw names → 43 standard parameters**, of which **16 need engineer sign-off**.

Merges applied:

| Standard | Folded from |
|---|---|
| `Thermocouple` | `Thermocouple` + 6 `Type-X thermocouple simulation` + `Temperature - Type K sensor` |
| `Temperature` | `Temperature`, `Temperature indicator`, `Temperature sensor`, `Temperature Generation` |
| `Force (Compression)` | `Compression Force`, `Force - push mode` |
| `Force (Tension)` | `Tension Force`, `Force - pull mode` |
| `Relative Humidity` | `Relative Humidity`, `Relative Humidity Generation` |
| `Time Interval` | `Time Interval`, `Time interval` |

Unit canonicalization also caught a trap worth noting: `Particle Count` used
`μm` (U+03BC, greek small letter mu) while `Flatness`/`Parallelness` used
`um`. These render identically to `µm` (U+00B5, micro sign) but are distinct
codepoints and would never have compared equal.

The builder is **fail-closed**: it exits non-zero if the registry contains any parameter
the map does not cover, or if two raw names fold into one standard with conflicting
categories. Both guards are verified. A future registry version therefore cannot
silently introduce an unseeded parameter.

**Still requiring review** (16): `Air Flow`, `Flatness`, `Flow`, `Force (Compression)`,
`Force (Tension)`, `Gauge Pressure`, `Level / Inclination`, `Light Intensity`,
`Parallelness`, `Particle Count`, `Relative Humidity`, `Speed`, `Temperature`,
`Thermocouple`, `Time`, `Velocity`. Each carries a `reviewNotes` rationale in
`parameter-standards.json`.

---

## What this changes in the plan

| Scope doc assumption | Reality | Impact |
|---|---|---|
| "41 parameters" seeded | 41 asset-level / 57 profile-level, disagreeing | Phase 3 seed script + §5.2 |
| Seed extracted directly, verified automatically | Raw extraction yields duplicates and unnormalized units | Needs a curated mapping layer, not a straight dump |
| Pre-filtering matches `parameter` | 8% of assets have no profile to match | §1.3 needs a no-capability-data path |
| Subtype = TC/RTD type | Also used for gauge dimensions | Subtype UI must be parameter-aware |
| AC/DC merged | Profiles already split AC/DC | §"After (30+ types)" direction is inverted |
| `accuracy` is `{type,value,unit,polarity}` | 3 shapes; 111 buckets don't fit | §1.1 interface, §1.3 filter, §4.3 validation, §2.2 display |

**Status**: the normalization map now exists and yields 43 standards. The remaining
blocker for Phase 3 is engineer sign-off on the 16 flagged merges, and a decision on
the accuracy discriminated union.

---

## Artifacts and how to reproduce

| File | Kind | Purpose |
|---|---|---|
| `scripts/extract_parameter_inventory.py` | generated-output producer | Raw survey of the registry |
| `docs/scope/parameter-inventory.json` | generated | raw parameters with units/subtypes/roles/counts |
| `docs/scope/parameter-normalization-map.json` | **reviewed input** | Curated raw → standard mapping |
| `scripts/build_parameter_standards.py` | validator + producer | Applies the map, fails closed |
| `docs/scope/parameter-standards.json` | generated | the standards — seed input for §5.2 |
| `scripts/apply_certificate_findings.py` | registry mutator | Writes certificate-verified profiles into the working registry |
| `scripts/standardize_registry.py` | contract producer | Emits the app-facing registry + a caveat sidecar |
| `apps/web-hta/src/data/master-instrument-registry.json` | **generated contract** | What the app consumes (schema 2.0) |
| `apps/web-hta/src/lib/master-instrument-registry.ts` | hand-written types | TypeScript contract for the above |
| `docs/scope/registry-data-quality.json` | generated | Caveats and integrity issues stripped out of the contract |

### The pipeline

```
reference_docs/.../master_instrment_registry.json      (working registry, outside the repo)
        │   apply_certificate_findings.py  ← certificate-verified profiles
        ▼
   working registry (annotated: provenance, notes, merge_issues, appendices)
        │   standardize_registry.py  ← normalization map
        ├──────────────────────────────► apps/web-hta/src/data/master-instrument-registry.json
        │                                (clean contract: no provenance, no audit fields)
        └──────────────────────────────► docs/scope/registry-data-quality.json
                                         (every caveat that was stripped)
```

The working registry stays the place where extraction and verification are argued out;
the standardized file is a stable contract with none of that noise. Regenerate rather
than hand-editing either JSON.

**Schema 2.0 differs from the scope doc's §1.1 sketch in three ways**, all forced by the
data: `accuracy` is a discriminated union rather than `{type,value,unit,polarity}`;
profiles carry `kind: 'range' | 'artifact'` because reference artifacts have no
continuous range; and composite assets' component profiles are flattened onto the asset
with a `component_id` tag so filtering never walks two levels.

```bash
python scripts/extract_parameter_inventory.py
# 57 distinct parameters from 544 profiles across 204 assets

python scripts/build_parameter_standards.py --check   # validate without writing
python scripts/build_parameter_standards.py
# 43 standard parameters (from 57 raw registry names)
#   needing engineer review : 16
```

Only `parameter-normalization-map.json` is hand-maintained. The other two JSON files
are regenerated and should not be edited directly.

Both scripts take `--registry` so they can run against a relocated or updated registry;
the default path points outside the repo at
`reference_docs/master_list/master_details/`.
