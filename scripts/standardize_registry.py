"""Produce the standardized master instrument registry the application consumes.

The working registry under reference_docs/ is an intermediate artifact: it carries
extraction provenance, merge issues, certificate appendices, raw spreadsheet text and
audit notes. Useful while establishing the data, noise for the app.

This emits a clean, stable contract:

    apps/web-hta/src/data/master-instrument-registry.json

plus a sidecar holding every caveat stripped from it, so nothing is silently lost:

    docs/scope/registry-data-quality.json

What the standardization does:

  * gives every asset a units[] array - one entry per physical instrument - so there is
    exactly one shape and consumers never branch. The working registry records the same
    situation two ways: composites for 149/188/580, repeated rows sharing a number for
    741/784. Both become units. Most assets have a single unit.
  * takes unit ids from the lab's own lettered certificates where they exist
    (188A/188B/188C, 580A/580B/580C) rather than inventing a numbering
  * normalizes parameter names through parameter-normalization-map.json, so the app sees
    standard names and never the 57 raw variants
  * canonicalizes units through the same map's unitAliases (µm vs um vs μm, %RH spellings)
  * normalizes accuracy into a discriminated union with a consistent shape per type
  * collapses per-subtype profiles into one profile with a subtypes[] array, matching
    how both wireframes render them (a profile header plus a subtype selector). The
    working registry emits a profile per (parameter, role, subtype) - asset 711 alone
    drops from 34 profiles to 10.
  * splits indicator/sensor composite fields ('Ind: 1523 Sen: 5626') into parts, which
    the Basic Info tab renders as a Composite checkbox
  * maps calibration status to the badge vocabulary the wireframes use
    (VALID / EXPIRING_SOON / EXPIRED / UNKNOWN)
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
import re
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


UNIT_LETTER = re.compile(r"^\s*\d+\s*([A-Z])\b")

# "Ind: 1523 Sen: 5626", "Ind : HD2303.0 Sen:AP471S3", "Ind : 08020628 Sen : 41020793"
IND_SEN = re.compile(r"\bind\s*[:.]?\s*(.+?)\s*\bsen\s*[:.]?\s*(.+)$", re.I)

# Days before the due date at which a calibration counts as expiring soon.
EXPIRING_SOON_DAYS = 60


def split_ind_sen(value):
    """Split an indicator/sensor composite field into its two parts.

    33 assets record make, model or serial as a single string covering both halves of
    an indicator-plus-sensor instrument. The scope wireframe's Basic Info tab renders
    these as a 'Composite: Ind [_] Sen [_]' pair, so the split has to be available
    rather than left inside one string.
    """
    if not value:
        return None
    match = IND_SEN.match(str(value).strip())
    if not match:
        return None
    return {"ind": strip_separator(match.group(1)), "sen": strip_separator(match.group(2))}


# The pattern stops at "Sen", so a separator written before it - "Ind: 5250062 & Sen:
# 25005083" - is left on the end of the indicator part. A serial number with a stray
# ampersand does not match the instrument it is meant to identify.
TRAILING_SEPARATOR = re.compile(r"[\s&,;/]+$")


def strip_separator(value):
    return TRAILING_SEPARATOR.sub("", str(value).strip())


def calibration_state(status):
    """Map the registry's status to the vocabulary the wireframes use for badges.

    UNDER_RECAL and SERVICE_PENDING are operational states the lab sets by hand; they
    cannot be derived from a due date and so never come out of here.
    """
    if not status:
        return {"state": "UNKNOWN", "days": None}
    kind = status.get("status")
    if kind == "overdue":
        return {"state": "EXPIRED", "days": status.get("days_overdue")}
    if kind == "valid":
        days = status.get("days_until_due")
        if days is not None and days <= EXPIRING_SOON_DAYS:
            return {"state": "EXPIRING_SOON", "days": days}
        return {"state": "VALID", "days": days}
    return {"state": "UNKNOWN", "days": None}


def group_profiles(profiles):
    """Collapse per-subtype profiles into one profile carrying a subtypes[] array.

    The working registry emits a separate profile for every (parameter, role, subtype)
    combination - asset 711 has 34, of which 28 are RTD and Thermocouple subtype
    variants. Both wireframes instead show one profile per (parameter, role) with a
    subtype selector inside it, and buckets that follow the selected subtype.

    Grouping here rather than in the UI means every screen that renders profiles gets
    the same structure for free.
    """
    grouped = {}
    order = []
    for prof in profiles:
        key = (
            prof["parameter"],
            prof["role"],
            prof["kind"],
            prof["unit"],
            prof.get("mode"),
        )
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        grouped[key].append(prof)

    out = []
    for key in order:
        members = grouped[key]
        subtyped = [p for p in members if p.get("subtype")]

        # Profiles without a subtype stay as they are. More than one in a group would
        # mean two indistinguishable capabilities, so they are kept separate rather
        # than silently merged.
        if not subtyped:
            out.extend(members)
            continue

        base = dict(subtyped[0])
        subtypes = []
        for member in members:
            subtypes.append(
                {
                    "id": member.get("subtype"),
                    "min": member.get("min"),
                    "max": member.get("max"),
                    "min_inclusive": member.get("min_inclusive", True),
                    "max_inclusive": member.get("max_inclusive", True),
                    "buckets": member.get("buckets") or [],
                }
            )

        lows = [s["min"] for s in subtypes if s["min"] is not None]
        highs = [s["max"] for s in subtypes if s["max"] is not None]

        base.pop("subtype", None)
        base["subtypes"] = subtypes
        # Profile range is the envelope across subtypes; per-subtype detail lives in
        # subtypes[]. Buckets are empty here so there is one place to read them from.
        base["min"] = min(lows) if lows else None
        base["max"] = max(highs) if highs else None
        base["buckets"] = []
        out.append(base)

    for index, prof in enumerate(out, start=1):
        prof["id"] = f"P{index}"
    return out


def normalized_asset_no(asset):
    value = asset.get("asset_no_normalized")
    if value:
        return str(value).strip()
    asset_no = asset.get("asset_no")
    return str(asset_no).split()[0].strip() if asset_no else ""


def unit_records(asset):
    """Yield one record per physical instrument under this asset entry.

    A composite asset yields its components; anything else yields itself. The two are
    the same situation recorded two different ways in the working registry.
    """
    if asset.get("asset_type") == "composite" and asset.get("components"):
        for component in asset["components"]:
            record = dict(component.get("master_record") or {})
            # Certificate-derived components have no master record at all; their only
            # identity is the component-level instrument_desc.
            if not record:
                record = {
                    "instrument_desc": component.get("instrument_desc"),
                    "_no_master_record": True,
                }
            record["certificate_file"] = component.get("certificate_file")
            if component.get("calibration_status"):
                record["calibration_status"] = component["calibration_status"]
            record["capability_profiles"] = (
                list(component.get("capability_profiles") or [])
                + list((component.get("master_record") or {}).get("capability_profiles") or [])
            )
            yield record
    else:
        yield asset


def group_by_asset_no(assets):
    """Group the working registry's rows into one entry per asset number.

    An asset number identifies one entry in the lab's master list. Several physical
    instruments can sit under it - a calibrator and its current coil, three paperless
    recorders - and the lab distinguishes them with lettered certificates (188A, 188B,
    188C). The working registry records this two different ways: as composites for 149,
    188 and 580, and as repeated rows sharing a number for 741 and 784.

    Both become one asset with a units[] array. Every asset gets units[], most with a
    single entry, so consumers have exactly one shape to handle.
    """
    grouped = {}
    order = []
    for asset in assets:
        key = normalized_asset_no(asset)
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        for record in unit_records(asset):
            grouped[key].append(record)
    return [(key, grouped[key]) for key in order]


def unit_id(asset_number, record, index):
    """Prefer the lab's own letter (from '188B HTAIPL L.pdf') over an invented ordinal."""
    certificate = record.get("certificate_file") or ""
    match = UNIT_LETTER.match(certificate)
    if match:
        return match.group(1)
    return str(index)


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

    for asset_number, records in group_by_asset_no(registry["assets"]):
      units_out = []
      notes = []
      for unit_index, asset in enumerate(records, start=1):
        asset_no = asset.get("asset_no") or f"{asset_number} HTAIPL/L"

        collected = list(asset.get("capability_profiles") or [])

        profiles_out = []
        for index, prof in enumerate(collected, start=1):
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

        profiles_out = group_profiles(profiles_out)

        status = asset.get("calibration_status") or {}
        state = calibration_state(status)

        make_parts = split_ind_sen(asset.get("make"))
        model_parts = split_ind_sen(asset.get("model"))
        serial_parts = split_ind_sen(asset.get("serial_no"))

        unit_out = {
            "id": unit_id(asset_number, asset, unit_index),
            "instrument_desc": asset.get("instrument_desc"),
            # 'composite' here means one instrument built from an indicator plus a
            # sensor, which is what the Basic Info tab's Composite checkbox toggles.
            # It is unrelated to several instruments sharing an asset number.
            "asset_type": "composite"
            if (make_parts or model_parts or serial_parts)
            else "simple",
            "make": asset.get("make"),
            "make_parts": make_parts,
            "model": asset.get("model"),
            "model_parts": model_parts,
            "serial_no": asset.get("serial_no"),
            "serial_parts": serial_parts,
            "category": asset.get("category"),
            "usage": asset.get("usage"),
            "calibrated_at": asset.get("calibrated_at"),
            "report_no": asset.get("report_no"),
            "next_due_on": asset.get("next_due_on"),
            "calibration_state": state["state"],
            "calibration_days": state["days"],
            "sop_references": asset.get("sop_references") or [],
            "certificate_file": asset.get("certificate_file"),
            "capability_profiles": profiles_out,
        }
        # Units known only from a certificate have no master-list entry, so no serial
        # number and no attributable calibration dates.
        if asset.get("_no_master_record"):
            unit_out["has_master_record"] = False

        units_out.append(unit_out)

      assets_out.append(
          {
              "id": asset_number,
              "asset_no": records[0].get("asset_no") or f"{asset_number} HTAIPL/L",
              "unit_count": len(units_out),
              "units": units_out,
          }
      )

      if notes:
          quality["assets"][asset_number] = {
              "instrument_desc": units_out[0]["instrument_desc"] if units_out else None,
              "notes": notes,
          }

    integrity = []

    # An asset number holding several instruments is normal where the lab issues
    # lettered certificates (188A/188B/188C). It is a defect where it does not - 741 and
    # 784 hold unrelated instruments with different makes, labs and due dates, and only
    # one certificate between them. Report the ones with no lettering.
    multi = [a for a in assets_out if a["unit_count"] > 1]
    for a in multi:
        lettered = all(u["id"].isalpha() for u in a["units"])
        if lettered:
            continue
        integrity.append(
            {
                "issue": "shared_asset_number_without_lettering",
                "id": a["id"],
                "instruments": [
                    {
                        "unit": u["id"],
                        "instrument_desc": u["instrument_desc"],
                        "serial_no": u["serial_no"],
                        "certificate_file": u["certificate_file"],
                    }
                    for u in a["units"]
                ],
                "resolution": (
                    "Several instruments share this asset number but the lab issues no"
                    " lettered certificates for them, so there is nothing in the source"
                    " that distinguishes the units. Units are numbered 1, 2 ... in"
                    " registry order, which is arbitrary. Confirm at source whether these"
                    " belong under one number at all."
                ),
            }
        )

    unitless = [
        {"asset_no": a["asset_no"], "unit": u["id"], "parameter": p["parameter"]}
        for a in assets_out
        for u in a["units"]
        for p in u["capability_profiles"]
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

    orphans = [
        {
            "asset_id": a["id"],
            "unit": u["id"],
            "instrument_desc": u["instrument_desc"],
            "certificate_file": u["certificate_file"],
        }
        for a in assets_out
        for u in a["units"]
        if u.get("has_master_record") is False
    ]
    if orphans:
        integrity.append(
            {
                "issue": "unit_without_master_record",
                "count": len(orphans),
                "units": orphans,
                "resolution": (
                    "These instruments exist only because a certificate was found for"
                    " them; the lab's master list has no entry. They have no serial number"
                    " and no attributable calibration dates, so their due status cannot be"
                    " tracked. Either add them to the master list or confirm they are"
                    " retired."
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
        "unit_count": sum(a["unit_count"] for a in assets_out),
        "profile_count": sum(
            len(u["capability_profiles"]) for a in assets_out for u in a["units"]
        ),
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

    all_profiles = [
        p for a in standardized["assets"] for u in a["units"] for p in u["capability_profiles"]
    ]
    params = sorted({p["parameter"] for p in all_profiles})
    artifacts = [p for p in all_profiles if p["kind"] == "artifact"]
    def profile_buckets(profile):
        """All buckets of a profile, whether direct or held under a subtype."""
        if profile.get("subtypes"):
            return [b for s in profile["subtypes"] for b in s["buckets"]]
        return profile["buckets"]

    acc_types = {}
    subtyped = 0
    for p in all_profiles:
        if p.get("subtypes"):
            subtyped += 1
        for b in profile_buckets(p):
            t = (b["accuracy"] or {}).get("type", "none")
            acc_types[t] = acc_types.get(t, 0) + 1

    print(f"schema {SCHEMA_VERSION}: {standardized['asset_count']} assets, "
          f"{standardized['unit_count']} units, {standardized['profile_count']} profiles, "
          f"{len(params)} distinct parameters")
    print(f"  profiles w/ subtypes  : {subtyped}")
    print(f"  artifact profiles     : {len(artifacts)}")
    print(f"  accuracy by type      : {acc_types}")
    print(f"  assets with caveats   : {len(quality['assets'])}")

    for issue in quality.get("integrity", []):
        if issue["issue"] == "shared_asset_number_without_lettering":
            names = " / ".join(
                f"{i['instrument_desc']} ({i['serial_no']})" for i in issue["instruments"]
            )
            print(f"  INTEGRITY  asset {issue['id']} holds unlettered units: {names}")
        elif issue["issue"] == "unit_without_master_record":
            print(f"  INTEGRITY  {issue['count']} units exist only from a certificate "
                  f"- no master-list entry, due status untrackable")
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
