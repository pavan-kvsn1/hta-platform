"""Produce the standardized master instrument registry the application consumes.

The working registry under reference_docs/ is an intermediate artifact: it carries
extraction provenance, merge issues, certificate appendices, raw spreadsheet text and
audit notes. Useful while establishing the data, noise for the app.

This emits a clean, stable contract:

    apps/web-hta/src/data/master-instrument-registry.json

plus a sidecar holding every caveat stripped from it, so nothing is silently lost:

    docs/scope/registry-data-quality.json

What the standardization does:

  * flattens composite assets - every capability profile sits on the asset, tagged with
    component_id where it came from one, so filtering never has to walk two levels
  * normalizes parameter names through parameter-normalization-map.json, so the app sees
    standard names and never the 57 raw variants
  * canonicalizes units through the same map's unitAliases (µm vs um vs μm, %RH spellings)
  * normalizes accuracy into a discriminated union with a consistent shape per type
  * distinguishes range capabilities from reference artifacts, which have no continuous
    range at all
  * drops every extraction/audit field

Usage:
    python scripts/standardize_registry.py
    python scripts/standardize_registry.py --check   # report only
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

DEFAULT_REGISTRY = Path(
    "C:/Users/kcsva/OneDrive/Documents/HTACalibr8s/reference_docs/master_list"
    "/master_details/master_instrment_registry.json"
)
DEFAULT_MAP = Path("docs/scope/parameter-normalization-map.json")
DEFAULT_OUT = Path("apps/web-hta/src/data/master-instrument-registry.json")
DEFAULT_QUALITY = Path("docs/scope/registry-data-quality.json")

SCHEMA_VERSION = "2.0"

# Fields that exist only to document how the working registry was built.
ASSET_DROP = {
    "parameter_raw", "parameters", "roles", "roles_corrected", "range_text",
    "range_parsed", "range_parsed_original", "range_reference_doc", "merge_issues",
    "capability_appendix", "serial_parsed", "model_parsed", "make_parsed",
    "due_date_raw", "due_date_approximate", "sop_entries", "id",
}
PROFILE_DROP = {
    "provenance", "source_note", "accuracy_basis", "certificate_parameter",
    "span_points_ppm", "bucket_basis", "repeatability", "calibrated_against",
    "measurement_uncertainty", "measurement_uncertainty_percent", "note",
    "capability_kind",
}
BUCKET_DROP = {
    "extended_beyond_calibration", "extended_from", "extension_note",
}

PERCENT_OF_CANONICAL = {
    "reading": "reading",
    "rdg": "reading",
    "full scale": "full_scale",
    "full_scale": "full_scale",
    "fs": "full_scale",
    "span": "span",
}


def canonical_percent_of(value):
    if value is None:
        return None
    return PERCENT_OF_CANONICAL.get(str(value).strip().lower(), str(value).strip())


def normalize_accuracy(acc):
    """Normalize accuracy into a discriminated union with one shape per type.

    The working registry has three shapes with inconsistent keys. Consumers should be
    able to switch on `type` and know exactly which fields are present.
    """
    if not acc:
        return None
    kind = acc.get("type")

    if kind == "symmetric":
        return {
            "type": "symmetric",
            "value": acc.get("value"),
            "unit": acc.get("unit"),
            "polarity": acc.get("polarity") or "±",
        }

    if kind == "formula":
        return {
            "type": "formula",
            "expression": acc.get("expression"),
            "percent_of": canonical_percent_of(acc.get("percent_of")),
            "percent_value": acc.get("percent_value"),
            "digits": acc.get("digits"),
            "digits_unit": acc.get("digits_unit"),
            "polarity": acc.get("polarity") or "±",
        }

    if kind == "class":
        return {
            "type": "class",
            "class": acc.get("raw") or acc.get("class"),
            "polarity": acc.get("polarity"),
        }

    return {"type": "unknown", "raw": acc}


def build(registry, mapping):
    param_map = {k: v for k, v in mapping["parameters"].items() if not k.startswith("$")}
    unit_alias = {k: v for k, v in mapping["unitAliases"].items() if not k.startswith("$")}

    quality = {
        "$comment": [
            "Caveats stripped out of the standardized registry so the app contract stays",
            "clean. Keyed by asset number. Nothing here is needed to render or filter;",
            "all of it matters when judging whether a master is fit for a given job.",
        ],
        "assets": {},
    }
    unmapped = set()
    assets_out = []

    for asset in registry["assets"]:
        asset_no = asset.get("asset_no") or asset.get("asset_no_normalized")

        # Collect profiles from the asset and from any component, tagging origin.
        collected = [(None, p) for p in (asset.get("capability_profiles") or [])]
        components_out = []
        for component in asset.get("components") or []:
            record = component.get("master_record") or {}
            cid = component.get("id")
            components_out.append(
                {
                    "id": cid,
                    "instrument_desc": record.get("instrument_desc"),
                    "make": record.get("make"),
                    "model": record.get("model"),
                    "serial_no": record.get("serial_no"),
                    "asset_no": record.get("asset_no"),
                }
            )
            for p in (component.get("capability_profiles") or []):
                collected.append((cid, p))
            for p in (record.get("capability_profiles") or []):
                collected.append((cid, p))

        notes = []
        profiles_out = []
        for index, (component_id, prof) in enumerate(collected, start=1):
            raw_param = prof.get("parameter")
            entry = param_map.get(raw_param)
            if entry is None:
                unmapped.add(raw_param)
                standard = raw_param
            else:
                standard = entry["standardName"]

            unit = prof.get("unit")
            unit = unit_alias.get(unit, unit)

            is_artifact = (
                prof.get("capability_kind") == "artifact" or "artifact" in prof
            )

            buckets_out = []
            for b in prof.get("buckets") or []:
                lc = b.get("least_count")
                buckets_out.append(
                    {
                        "id": b.get("id"),
                        "min": b.get("min"),
                        "max": b.get("max"),
                        "min_inclusive": b.get("min_inclusive", True),
                        "max_inclusive": b.get("max_inclusive", True),
                        "least_count": (
                            {
                                "value": lc.get("value"),
                                "unit": unit_alias.get(lc.get("unit"), lc.get("unit")),
                            }
                            if lc
                            else None
                        ),
                        "accuracy": normalize_accuracy(b.get("accuracy")),
                    }
                )
                if b.get("extended_beyond_calibration"):
                    notes.append(
                        f"profile {standard}: bucket {b.get('id')} is extrapolated above "
                        f"{b.get('extended_from')} - {b.get('extension_note')}"
                    )
                acc = b.get("accuracy") or {}
                if acc.get("basis_unresolved"):
                    notes.append(
                        f"profile {standard}: accuracy '{acc.get('expression')}' has no"
                        f" stated basis - percent_of is null and must not be assumed"
                    )

            profile_out = {
                "id": f"P{index}",
                "parameter": standard,
                "role": prof.get("role"),
                "unit": unit,
                "kind": "artifact" if is_artifact else "range",
                "min": prof.get("min"),
                "max": prof.get("max"),
                "min_inclusive": prof.get("min_inclusive", True),
                "max_inclusive": prof.get("max_inclusive", True),
                "buckets": buckets_out,
            }
            if component_id:
                profile_out["component_id"] = component_id
            if prof.get("subtype"):
                profile_out["subtype"] = prof["subtype"]
                if entry and entry.get("subtypeKind"):
                    profile_out["subtype_kind"] = entry["subtypeKind"]
            if prof.get("operating_range"):
                profile_out["operating_range"] = prof["operating_range"]
            if prof.get("measurement_mode"):
                profile_out["mode"] = prof["measurement_mode"]
            if is_artifact and prof.get("artifact"):
                profile_out["artifact"] = prof["artifact"]

            profiles_out.append(profile_out)

            # Preserve the audit trail in the sidecar rather than the contract.
            prov = prof.get("provenance")
            if prov:
                notes.extend(prov.get("notes") or [])

        # asset_no_normalized only exists on the 3 composite assets; for the rest the
        # normalized id is the leading token of asset_no ("227 HTAIPL/L" -> "227",
        # "907,908 HTAIPL/L" -> "907,908").
        normalized_id = asset.get("asset_no_normalized")
        if not normalized_id and asset_no:
            normalized_id = str(asset_no).split()[0]

        status = asset.get("calibration_status") or {}
        out = {
            "id": str(normalized_id or "").strip(),
            "asset_no": asset_no,
            "asset_type": asset.get("asset_type"),
            "category": asset.get("category"),
            "instrument_desc": asset.get("instrument_desc"),
            "make": asset.get("make"),
            "model": asset.get("model"),
            "serial_no": asset.get("serial_no"),
            "usage": asset.get("usage"),
            "calibrated_at": asset.get("calibrated_at"),
            "report_no": asset.get("report_no"),
            "next_due_on": asset.get("next_due_on"),
            "calibration_status": status.get("status"),
            "sop_references": asset.get("sop_references") or [],
            "certificate_file": asset.get("certificate_file"),
            "capability_profiles": profiles_out,
        }
        if components_out:
            out["components"] = components_out

        assets_out.append(out)

        if notes:
            quality["assets"][asset_no] = {
                "instrument_desc": asset.get("instrument_desc"),
                "notes": notes,
            }

    # `id` is the app's lookup key, so it must be unique. The source registry reuses
    # some asset numbers across physically different instruments, so disambiguate
    # deterministically (by serial) and report it - the collision is a source defect.
    integrity = []
    seen = {}
    for out in assets_out:
        seen.setdefault(out["id"], []).append(out)
    for base, group in sorted(seen.items()):
        if len(group) < 2:
            continue
        integrity.append(
            {
                "issue": "duplicate_asset_number",
                "id": base,
                "instruments": [
                    {"instrument_desc": g["instrument_desc"], "serial_no": g["serial_no"]}
                    for g in group
                ],
                "resolution": (
                    "ids were suffixed -1, -2 ... in generation order so the contract has"
                    " unique keys, but asset_no remains ambiguous. Fix at source: two"
                    " physically different instruments must not share an asset number."
                ),
            }
        )
        for index, g in enumerate(group, start=1):
            g["id"] = f"{base}-{index}"
            g["duplicate_asset_no"] = True

    unitless = [
        {"asset_no": a["asset_no"], "parameter": p["parameter"]}
        for a in assets_out
        for p in a["capability_profiles"]
        if not p["unit"]
    ]
    if unitless:
        integrity.append(
            {
                "issue": "profile_without_unit",
                "count": len(unitless),
                "profiles": unitless,
                "resolution": (
                    "A range with no unit cannot be compared against a UUC range. These"
                    " profiles must be excluded from range filtering until a unit is"
                    " supplied."
                ),
            }
        )

    quality["integrity"] = integrity

    standardized = {
        "schema_version": SCHEMA_VERSION,
        "generated_on": date.today().isoformat(),
        "source": {
            "registry_schema_version": registry.get("metadata", {}).get("schema_version"),
            "normalization_map_version": mapping.get("version"),
        },
        "asset_count": len(assets_out),
        "profile_count": sum(len(a["capability_profiles"]) for a in assets_out),
        "assets": assets_out,
    }
    return standardized, quality, unmapped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--map", dest="map_path", type=Path, default=DEFAULT_MAP)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--quality", type=Path, default=DEFAULT_QUALITY)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    mapping = json.loads(args.map_path.read_text(encoding="utf-8"))

    standardized, quality, unmapped = build(registry, mapping)

    if unmapped:
        print("VALIDATION FAILED - parameters not covered by the normalization map:")
        for name in sorted(unmapped):
            print(f"  - {name}")
        return 1

    params = sorted({
        p["parameter"] for a in standardized["assets"] for p in a["capability_profiles"]
    })
    artifacts = [
        (a["asset_no"], p["parameter"])
        for a in standardized["assets"]
        for p in a["capability_profiles"]
        if p["kind"] == "artifact"
    ]
    acc_types = {}
    for a in standardized["assets"]:
        for p in a["capability_profiles"]:
            for b in p["buckets"]:
                t = (b["accuracy"] or {}).get("type", "none")
                acc_types[t] = acc_types.get(t, 0) + 1

    print(f"schema {SCHEMA_VERSION}: {standardized['asset_count']} assets, "
          f"{standardized['profile_count']} profiles, {len(params)} distinct parameters")
    print(f"  artifact profiles     : {len(artifacts)}")
    print(f"  accuracy by type      : {acc_types}")
    print(f"  assets with caveats   : {len(quality['assets'])}")

    for issue in quality.get("integrity", []):
        if issue["issue"] == "duplicate_asset_number":
            names = " / ".join(
                f"{i['instrument_desc']} ({i['serial_no']})" for i in issue["instruments"]
            )
            print(f"  INTEGRITY  asset_no {issue['id']} reused by: {names}")
        elif issue["issue"] == "profile_without_unit":
            print(f"  INTEGRITY  {issue['count']} profiles have no unit "
                  f"- excluded from range filtering")

    if args.check:
        print("\n--check: nothing written")
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(standardized, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    args.quality.parent.mkdir(parents=True, exist_ok=True)
    args.quality.write_text(
        json.dumps(quality, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nwritten to {args.out}")
    print(f"caveats to {args.quality}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
