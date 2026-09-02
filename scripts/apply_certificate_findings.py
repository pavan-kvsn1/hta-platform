"""Write certificate-verified capability profiles into the master instrument registry.

Fills capability_profiles for the 13 assets whose certificates were read directly from
the scanned PDFs (see docs/scope/certificate-verification.md), and corrects two
range_parsed entries the upstream extractor got wrong.

RANGE SEMANTICS (per lab): the DECLARED range is the capability. Calibration points are
samples within it, not a limit on it. The accuracy and least count established at the
lowest calibrated point extend down to the declared minimum, and those at the highest
point extend up to the declared maximum. Buckets here therefore span the declared range,
not the calibrated-point span.

Every profile written carries a `provenance` block naming the certificate it came from,
so inferred data can always be told from extracted data.

This script MUTATES the registry. Take a backup first; --check reports without writing.

Usage:
    python scripts/apply_certificate_findings.py --check
    python scripts/apply_certificate_findings.py
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

DEFAULT_REGISTRY = Path(
    "C:/Users/kcsva/OneDrive/Documents/HTACalibr8s/reference_docs/master_list"
    "/master_details/master_instrment_registry.json"
)

VERIFIED_ON = "2026-09-02"


def sym(value, unit):
    return {"type": "symmetric", "value": value, "unit": unit, "polarity": "±"}


def pct(expression, percent_of, percent_value):
    """Percentage accuracy whose basis (reading / full scale / span) IS stated on the cert."""
    return {
        "type": "formula",
        "expression": expression,
        "percent_of": percent_of,
        "percent_value": percent_value,
        "polarity": "±",
    }


def pct_basis_unknown(expression, percent_value):
    """Percentage accuracy whose basis is NOT stated on the certificate.

    Do not guess: '+/- 1%' against settings written in % CO2 could mean 1% of reading,
    1% of full scale, or 1 percentage point of concentration - a 250x spread at the low
    end of the range. percent_of is left null and the entry is flagged so filtering
    cannot silently treat it as percent-of-reading.
    """
    return {
        "type": "formula",
        "expression": expression,
        "percent_of": None,
        "percent_value": percent_value,
        "polarity": "±",
        "basis_unresolved": True,
        "basis_note": (
            "The certificate states the percentage but not what it is a percentage OF."
            " Resolve with the lab before using this for accuracy-based filtering."
        ),
    }


def bucket(bid, lo, hi, lc_value, lc_unit, accuracy):
    return {
        "id": bid,
        "min": lo,
        "max": hi,
        "min_inclusive": True,
        "max_inclusive": True,
        "least_count": (
            {"value": lc_value, "unit": lc_unit} if lc_value is not None else None
        ),
        "accuracy": accuracy,
    }


def profile(pid, parameter, role, unit, lo, hi, buckets, **extra):
    p = {
        "id": pid,
        "parameter": parameter,
        "role": role,
        "unit": unit,
        "min": lo,
        "max": hi,
        "min_inclusive": True,
        "max_inclusive": True,
        "buckets": buckets,
    }
    p.update(extra)
    return p


# --------------------------------------------------------------------------------------
# Certificate-verified findings, keyed by asset_no.
# --------------------------------------------------------------------------------------

FINDINGS = {
    "909 HTAIPL/L": {
        "certificate": "TransCal TSC/25-26/4881-1 (cal 09 Jun 2025, due 08 Jun 2026)",
        "notes": [
            "Certificate nomenclature is 'Tachometer Calibrator (Speed Source)', so role is"
            " source, not measuring. The registry's roles field said measuring.",
            "The certificate reports ONE RPM capability; it does not distinguish contact from"
            " non-contact. Both declared parameters are given the same verified capability,"
            " matching the spreadsheet's 'Speed (Contact & Non Contact)'.",
            "Accuracy ±5 rpm is marked '(Claimed by Customer)' on the certificate - the lab"
            " measured deviation and uncertainty but did not establish the accuracy limit.",
            "NOT BUCKETED BY DECISION. The certificate states one global Range/LC/Accuracy,"
            " so a single bucket is faithful to it. Be aware of what this does not capture:"
            " measurement uncertainty varies by 170x across the range - ±5.16% at the 6 rpm"
            " point, 0.70% at 10 rpm, 0.40% at 100 rpm, 0.09-0.13% through the middle, and"
            " ±0.03% at 60000-99000 rpm. Treating the whole span as ±0.03%-grade performance"
            " would badly overstate the low end. If accuracy-based filtering ever needs to be"
            " trustworthy near the bottom of this range, revisit.",
        ],
        "role_correction": "source",
        "profiles": [
            profile("P1", "Speed (Contact)", "source", "rpm", 0.0, 100000.0,
                    [bucket("B1", 0.0, 100000.0, 0.1, "rpm", sym(5.0, "rpm"))],
                    accuracy_basis="claimed_by_customer"),
            profile("P2", "Speed (Non-Contact)", "source", "rpm", 0.0, 100000.0,
                    [bucket("B1", 0.0, 100000.0, 0.1, "rpm", sym(5.0, "rpm"))],
                    accuracy_basis="claimed_by_customer"),
        ],
    },

    "738 HTAIPL/L": {
        "certificate": "TransCal TSC/25-26/16176-3 (cal 02 Dec 2025, due 01 Dec 2026)",
        "notes": [
            "The certificate splits the two parameters across separate pages: Pressure on"
            " page 2 (0-6 bar), Vacuum on page 3 (-1 to 0 bar). The spreadsheet's combined"
            " '-1 to 6 bar' must NOT be applied to both.",
            "Accuracy ±0.05% FS is marked '(Claimed by customer)'.",
            "capability_appendix for this asset claims 'Time interval, 0-24 h', which appears"
            " nowhere in the certificate.",
            "NOT BUCKETED BY DECISION. One global Range/LC/Accuracy per page, so a single"
            " bucket per parameter is faithful. Not captured: on the Pressure page the"
            " measurement uncertainty is ±0.0008 bar for the 0.6-2.0 bar points and jumps to"
            " ±0.0022 bar for 3.0-6.0 bar - nearly 3x. The Vacuum page is uniform at"
            " ±0.0003 bar.",
        ],
        "profiles": [
            profile("P1", "Pressure", "measuring", "bar", 0.0, 6.0,
                    [bucket("B1", 0.0, 6.0, 0.0001, "bar",
                            pct("±0.05% FS", "full scale", 0.0005))],
                    accuracy_basis="claimed_by_customer"),
            profile("P2", "Vacuum", "measuring", "bar", -1.0, 0.0,
                    [bucket("B1", -1.0, 0.0, 0.0001, "bar",
                            pct("±0.05% FS", "full scale", 0.0005))],
                    accuracy_basis="claimed_by_customer"),
        ],
    },

    "853 HTAIPL/L": {
        "certificate": "PI Calibration Laboratory PICAL/1025/P/246 (cal 03.11.2025, due 03.11.2026)",
        "notes": [
            "The certificate results table is headed GAUGE PRESSURE and 'Parameter of"
            " Measurement' reads 'Pressure'; the master list calls this Differential Pressure."
            " The declared parameter name is kept here to stay consistent with parameters[],"
            " with the certificate's own term recorded in certificate_parameter.",
            "Unit is mbar on the certificate; the spreadsheet says hPa. 1 mbar = 1 hPa exactly,"
            " so the values agree, but string-based unit matching would not.",
            "Observed error was 0.23% FS against a ±0.5% FS specification.",
        ],
        "profiles": [
            profile("P1", "Differential Pressure", "measuring", "mbar", 0.0, 2.0,
                    [bucket("B1", 0.0, 2.0, 0.001, "mbar",
                            pct("±0.5% FS", "full scale", 0.005))],
                    certificate_parameter="Gauge Pressure"),
        ],
    },

    "600 HTAIPL/L": {
        "certificate": "TransCal TSC/24-25/22042-3 (4 pages, ISO 16063-21 back-to-back comparison)",
        "notes": [
            "Three measurement modes, each with its own range and least count. The registry"
            " had zero profiles and the spreadsheet recorded only '5.5 mm/s to 135 mm/s',"
            " which appears nowhere in the certificate.",
            "No accuracy is stated for any mode; only measurement uncertainty (±2.79-3.38%)."
            " Accuracy filtering cannot use these profiles.",
            "NOT BUCKETED BY DECISION. Each mode states one global Range/LC. Not captured:"
            " uncertainty varies with excitation frequency and amplitude (2.79-3.38% on"
            " velocity, up to 6.7% at the 1.00 m/s2 acceleration points), and the calibration"
            " is organised by frequency (10/50/100/300 Hz) rather than by amplitude band, so"
            " amplitude buckets would not represent it correctly anyway.",
        ],
        "profiles": [
            profile("P1", "Acceleration", "measuring", "m/s²", 0.1, 400.0,
                    [bucket("B1", 0.1, 400.0, 0.1, "m/s²", None)],
                    measurement_uncertainty_percent=3.4),
            profile("P2", "Velocity", "measuring", "mm/s", 0.01, 400.0,
                    [bucket("B1", 0.01, 400.0, 0.01, "mm/s", None)],
                    measurement_uncertainty_percent=2.89),
            profile("P3", "Displacement", "measuring", "mm", 0.001, 4.0,
                    [bucket("B1", 0.001, 4.0, 0.001, "mm", None)],
                    measurement_uncertainty_percent=2.8),
        ],
    },

    "35 HTAIPL/L": {
        "certificate": "TransCal TSC/24-25/22042-4 (cal 14 Mar 2025, due 13 Mar 2026)",
        "notes": [
            "REFERENCE ARTIFACT, not a measuring instrument. A surface plate has no min/max"
            " measuring range - its capability is a flatness deviation over a fixed surface.",
            "Measured flatness 3.75 µm (point heights -2.81 to +0.94 µm over a 4x4 grid),"
            " against the IS 7327-2003 Grade 0 limit of 4 µm for 400x400 mm.",
            "The master list calls the parameter 'Level'; the certificate measures Flatness.",
            "The certificate explicitly provides no conformity statement.",
        ],
        "capability_kind": "artifact",
        "profiles": [
            profile("P1", "Flatness", "measuring", "µm", None, None, [],
                    capability_kind="artifact",
                    certificate_parameter="Flatness",
                    artifact={
                        "surface_size_mm": "400 x 400",
                        "measured_flatness_um": 3.75,
                        "grade": "Grade 0",
                        "grade_tolerance_um": 4,
                        "standard": "IS 7327-2003",
                        "measurement_uncertainty": "±1.3·√((L+W)/100) µm at k=2",
                    }),
        ],
    },

    "227 HTAIPL/L": {
        "certificate": "WIKA C-250811-37-1 (cal 13/08/2025, due 13/08/2026)",
        "notes": [
            "Declared range is 0 to 199990 Lux. The spreadsheet said 100-10000 and"
            " capability_appendix said 0-19999; both are wrong.",
            "Per the declared-range rule, the top calibrated bucket (2000-19999 Lux, LC 1 Lux)"
            " is extended to the declared maximum of 199990 Lux.",
            "The instrument's resolution list is 0.01/0.1/1/10/100 Lux - the 10 and 100 Lux"
            " steps were not exercised by the calibration, so the extended top bucket keeps"
            " LC 1 Lux. Revisit if finer bucket boundaries are needed above 19999 Lux.",
            "The certificate also states an Operating Range of 60 to 5000 Lux, distinct from"
            " the declared range.",
            "Remark on the certificate: 'The Lux Meter is not Verified for Spectral"
            " responsivity.'",
        ],
        "profiles": [
            profile("P1", "Light Intensity", "measuring", "lux", 0.0, 199990.0,
                    [
                        bucket("B1", 0.0, 199.99, 0.01, "lux",
                               pct("±4% rdg", "reading", 0.04)),
                        bucket("B2", 200.0, 1999.9, 0.1, "lux",
                               pct("±4% rdg", "reading", 0.04)),
                        dict(bucket("B3", 2000.0, 199990.0, 1.0, "lux",
                                    pct("±4% rdg", "reading", 0.04)),
                             extended_beyond_calibration=True,
                             extended_from=19999.0,
                             extension_note=(
                                 "Calibrated only to 19999 Lux. Extended to the declared"
                                 " maximum per the declared-range rule. CAUTION: the"
                                 " instrument's resolution list is 0.01/0.1/1/10/100 Lux,"
                                 " so real buckets with least count 10 and 100 almost"
                                 " certainly exist above 19999 Lux. Holding least count at"
                                 " 1 Lux across the whole extension is a placeholder, not a"
                                 " measured fact - split this bucket once the resolution"
                                 " breakpoints are known."
                             )),
                    ],
                    operating_range={"min": 60.0, "max": 5000.0, "unit": "lux"},
                    measurement_uncertainty_percent=4.9),
        ],
    },

    "742 HTAIPL/L": {
        "certificate": "HHV Thermal 1421112K25 (11/11/2025, valid 10/11/2026), traceable to NPL",
        "notes": [
            "Certificate face states 'Range : 1 x 10^3 To 1x10^-3 m.bar' - the unit is"
            " explicit. The spreadsheet's '103 to 10-3' lost the superscripts.",
            "Acceptance criterion 'Pirani gauge ±10% of the Master gauge' was ACCEPTED. This"
            " is the tolerance used for the pass/fail decision, not a manufacturer accuracy"
            " specification, and it is coarse for a master (poor test uncertainty ratio).",
            "capability_appendix recorded accuracy as NOT_STATED, which is wrong.",
        ],
        "range_parsed_fix": [{"min": 0.001, "max": 1000.0, "unit": "mbar"}],
        "profiles": [
            profile("P1", "Ultra Vacuum", "measuring", "mbar", 0.001, 1000.0,
                    [bucket("B1", 0.001, 1000.0, None, None,
                            pct_basis_unknown("±10% of the Master gauge", 0.10))],
                    accuracy_basis="acceptance_criterion"),
        ],
    },

    "755 HTAIPL/L": {
        "certificate": "Tritech HTA-004/24-25 (21.03.25, valid till 20.03.26)",
        "notes": [
            "Declared range 'CO2: 100,000 PPM (10%)'. Span gases reached 25,000 ppm; per the"
            " declared-range rule the ±1% accuracy extends to the full declared range.",
            "Calibration Accuracy is ±1% at every point. capability_appendix recorded"
            " '0.0% error', which is the OBSERVED error, not the accuracy limit.",
            "The certificate covers a SECOND parameter absent from the registry: Temp 0 to"
            " 50 deg C. Added here as P2.",
            "Alarm setting 15,000 PPM (1.5%). This asset is overdue.",
        ],
        "range_parsed_fix": [{"min": 0.0, "max": 100000.0, "unit": "ppm"}],
        "profiles": [
            profile("P1", "CO2", "measuring", "ppm", 0.0, 100000.0,
                    [
                        # Calibration points are bucket BOUNDARIES: zero gas, then the
                        # three span gases. Each bucket spans between adjacent points.
                        bucket("B1", 0.0, 4000.0, None, None,
                               pct_basis_unknown("+/- 1%", 0.01)),
                        bucket("B2", 4000.0, 9000.0, None, None,
                               pct_basis_unknown("+/- 1%", 0.01)),
                        bucket("B3", 9000.0, 25000.0, None, None,
                               pct_basis_unknown("+/- 1%", 0.01)),
                        dict(bucket("B4", 25000.0, 100000.0, None, None,
                                    pct_basis_unknown("+/- 1%", 0.01)),
                             extended_beyond_calibration=True,
                             extended_from=25000.0,
                             extension_note=(
                                 "Highest span gas was 2.5% CO2 (25,000 ppm). Extended to"
                                 " the declared maximum of 100,000 ppm per the"
                                 " declared-range rule, carrying the accuracy established"
                                 " at the top calibrated point."
                             )),
                    ],
                    span_points_ppm=[0, 4000, 9000, 25000],
                    bucket_basis="calibration points are bucket boundaries"),
            profile("P2", "Temperature", "measuring", "°C", 0.0, 50.0,
                    [bucket("B1", 0.0, 50.0, None, None, None)],
                    note="Declared on the certificate; no accuracy or least count given."),
        ],
    },

    "1003 HTAIPL/L": {
        "certificate": "TransCal TSC/24-25/22320-2 (per IS 2967)",
        "notes": [
            "Certificate calls the parameter Length; the registry says Thickness.",
            "Accuracy is '±2 µm ... as per customer requirement' - customer-specified.",
            "Certificate also records instrument-quality attributes (parallelism of measuring"
            " faces 0.9 µm, flatness of anvil 0.6 µm and spindle 0.9 µm, repeatability"
            " 1.0 µm) which are not measurement capabilities.",
        ],
        "profiles": [
            profile("P1", "Thickness", "measuring", "mm", 0.0, 25.0,
                    [bucket("B1", 0.0, 25.0, 0.001, "mm", sym(2.0, "µm"))],
                    certificate_parameter="Length",
                    accuracy_basis="claimed_by_customer",
                    measurement_uncertainty="±0.9 µm at k=2"),
        ],
    },

    "45 HTAIPL/L": {
        "certificate": "HTA/C23829/03/26 (in-house, procedure NLAB/CAL/ML7/R01)",
        "notes": [
            "Calibrated in-house by HTA. The master used was SLIP GAUGES Sl.No 30 HTAIPL/L -"
            " an asset whose own capability the registry does not record.",
            "Certificate calls the parameter Length; the registry says Thickness.",
        ],
        "profiles": [
            profile("P1", "Thickness", "measuring", "mm", 0.0, 10.0,
                    [bucket("B1", 0.0, 10.0, 0.01, "mm", sym(0.02, "mm"))],
                    certificate_parameter="Length",
                    calibrated_against="30 HTAIPL/L"),
        ],
    },

    "44 HTAIPL/L": {
        "certificate": "TransCal TSC/25-26/18709-2",
        "notes": [
            "Range/Resolution 0-0.14 mm / 0.001 mm; 24 calibration points, all Pass.",
            "No accuracy limit is stated on the certificate. Repeatability 0.0004 mm.",
            "Certificate calls the parameter Displacement; the registry says Thickness.",
        ],
        "profiles": [
            profile("P1", "Thickness", "measuring", "mm", 0.0, 0.14,
                    [bucket("B1", 0.0, 0.14, 0.001, "mm", None)],
                    certificate_parameter="Displacement",
                    repeatability="0.0004 mm"),
        ],
    },

    "783 HTAIPL/L": {
        "certificate": "CMTI 24/53/01/041-S/3/341-A (30-01-2025), NABL CC-2153",
        "notes": [
            "REFERENCE ARTIFACT: a set of 10 discrete tungsten-carbide slip gauges (Mikronix,"
            " Grade 0), each with its own nominal size and deviation at centre. It is NOT a"
            " continuous 2.5-25 mm range - the set can realise only its nominal sizes, or"
            " sums of stacked blocks.",
            "Calibrated by gauge block comparator against secondary master slip gauges.",
        ],
        "capability_kind": "artifact",
        "profiles": [
            profile("P1", "Thickness", "source", "mm", 2.5, 25.0, [],
                    capability_kind="artifact",
                    certificate_parameter="Length",
                    artifact={
                        "grade": "Grade 0",
                        "material": "Tungsten Carbide",
                        "count": 10,
                        "deviation_unit": "µm",
                        "blocks": [
                            {"nominal_mm": 2.5, "deviation_um": -0.031, "var_min_um": -0.070, "var_max_um": -0.031},
                            {"nominal_mm": 5.1, "deviation_um": 0.083, "var_min_um": 0.064, "var_max_um": 0.128},
                            {"nominal_mm": 7.7, "deviation_um": 0.048, "var_min_um": 0.003, "var_max_um": 0.088},
                            {"nominal_mm": 10.3, "deviation_um": 0.027, "var_min_um": -0.037, "var_max_um": 0.068},
                            {"nominal_mm": 12.9, "deviation_um": 0.092, "var_min_um": 0.065, "var_max_um": 0.150},
                            {"nominal_mm": 15.0, "deviation_um": 0.109, "var_min_um": -0.006, "var_max_um": 0.109},
                            {"nominal_mm": 17.6, "deviation_um": 0.061, "var_min_um": -0.030, "var_max_um": 0.082},
                            {"nominal_mm": 20.2, "deviation_um": -0.046, "var_min_um": -0.113, "var_max_um": -0.018},
                            {"nominal_mm": 22.8, "deviation_um": 0.079, "var_min_um": -0.036, "var_max_um": 0.079},
                            {"nominal_mm": 25.0, "deviation_um": -0.026, "var_min_um": -0.026, "var_max_um": 0.062},
                        ],
                    }),
        ],
    },

    "782 HTAIPL/L": {
        "certificate": "CMTI 24/53/01/041-S/3/341-B (24-01-2025), NABL CC-2153",
        "notes": [
            "REFERENCE ARTIFACT with TWO capabilities, not one: pitch blocks for height"
            " measurement (0-370 mm) and for outside measurement (0-300 mm). The spreadsheet's"
            " '300 mm' captured only the outside capability and lost the 370 mm height one.",
            "Discrete pitch-block sizes, not a continuous range.",
        ],
        "capability_kind": "artifact",
        "profiles": [
            profile("P1", "Length", "source", "mm", 0.0, 370.0, [],
                    capability_kind="artifact",
                    measurement_mode="height",
                    artifact={
                        "blocks_mm": [0, 50, 100, 150, 200, 250, 300, 330, 370],
                        "max_abs_error_mm": 0.0011,
                    }),
            profile("P2", "Length", "source", "mm", 0.0, 300.0, [],
                    capability_kind="artifact",
                    measurement_mode="outside",
                    artifact={
                        "blocks_mm": [0, 20, 50, 100, 150, 200, 250, 300],
                        "max_abs_error_mm": 0.0013,
                    }),
        ],
    },
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--check", action="store_true", help="report without writing")
    args = parser.parse_args()

    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    by_asset = {a.get("asset_no"): a for a in registry["assets"]}

    missing = [k for k in FINDINGS if k not in by_asset]
    if missing:
        print("ERROR: assets not found in registry: " + ", ".join(missing))
        return 1

    occupied = [
        k for k in FINDINGS if by_asset[k].get("capability_profiles")
    ]
    if occupied:
        print("ERROR: refusing to overwrite existing capability_profiles on: "
              + ", ".join(occupied))
        return 1

    profiles_added = 0
    ranges_fixed = 0

    for asset_no, finding in FINDINGS.items():
        asset = by_asset[asset_no]

        provenance = {
            "source": "calibration_certificate",
            "certificate": finding["certificate"],
            "verified_on": VERIFIED_ON,
            "method": "read directly from the scanned certificate PDF",
            "range_semantics": (
                "buckets span the DECLARED range; calibration points are samples within it,"
                " and the outermost buckets extend to the declared limits"
            ),
            "notes": finding["notes"],
        }

        for prof in finding["profiles"]:
            prof = dict(prof)
            prof["provenance"] = provenance
            asset.setdefault("capability_profiles", []).append(prof)
            profiles_added += 1

        if finding.get("capability_kind"):
            asset["capability_kind"] = finding["capability_kind"]

        if finding.get("role_correction"):
            asset["roles_corrected"] = {
                "from": asset.get("roles"),
                "to": [finding["role_correction"]],
                "reason": "certificate nomenclature",
            }
            asset["roles"] = [finding["role_correction"]]

        if finding.get("range_parsed_fix"):
            asset["range_parsed_original"] = asset.get("range_parsed")
            asset["range_parsed"] = finding["range_parsed_fix"]
            ranges_fixed += 1

        print(f"  {asset_no:<16} +{len(finding['profiles'])} profile(s)"
              f"{'  [range_parsed corrected]' if finding.get('range_parsed_fix') else ''}"
              f"{'  [artifact]' if finding.get('capability_kind') else ''}")

    print()
    print(f"{len(FINDINGS)} assets, {profiles_added} profiles added, "
          f"{ranges_fixed} range_parsed corrections")

    if args.check:
        print("\n--check: nothing written")
        return 0

    args.registry.write_text(
        json.dumps(registry, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nwritten to {args.registry}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
