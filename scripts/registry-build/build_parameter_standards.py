"""Apply the curated normalization map to the registry inventory.

Produces the seed input for CalibrationParameterStandards
(docs/scope/master-spec-integration-scope.md section 5.2).

The map (docs/scope/parameter-normalization-map.json) is reviewed input; this
script is the mechanical part. It fails loudly when the registry contains a
parameter the map does not cover, so a registry update cannot silently
introduce an unseeded parameter.

Usage:
    python scripts/build_parameter_standards.py            # build + validate
    python scripts/build_parameter_standards.py --check    # validate only, no write
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_REGISTRY = Path(
    "C:/Users/kcsva/OneDrive/Documents/HTACalibr8s/reference_docs/master_list"
    "/master_details/master_instrment_registry.json"
)
DEFAULT_MAP = Path("docs/scope/parameter-normalization-map.json")
DEFAULT_OUT = Path("docs/scope/parameter-standards.json")


def iter_profiles(assets):
    """Yield (asset, profile) for every capability profile in the registry."""
    for asset in assets:
        for profile in asset.get("capability_profiles") or []:
            yield asset, profile
        for component in asset.get("components") or []:
            for profile in component.get("capability_profiles") or []:
                yield asset, profile
            record = component.get("master_record") or {}
            for profile in record.get("capability_profiles") or []:
                yield asset, profile


def canonical_unit(unit, aliases):
    return aliases.get(unit, unit)


def build(registry, mapping):
    assets = registry["assets"]
    param_map = {
        k: v for k, v in mapping["parameters"].items() if not k.startswith("$")
    }
    unit_aliases = {
        k: v for k, v in mapping["unitAliases"].items() if not k.startswith("$")
    }

    errors = []
    unmapped = set()

    units = defaultdict(set)
    raw_units = defaultdict(set)
    subtypes = defaultdict(set)
    roles = defaultdict(set)
    sources = defaultdict(set)
    profile_count = defaultdict(int)
    asset_ids = defaultdict(set)
    bucket_count = defaultdict(int)
    accuracy_types = defaultdict(set)
    lo = {}
    hi = {}
    subtype_kind = {}
    subtype_required = {}
    category = {}
    review = {}
    rationales = defaultdict(list)

    for asset, profile in iter_profiles(assets):
        raw = profile["parameter"]
        entry = param_map.get(raw)
        if entry is None:
            unmapped.add(raw)
            continue

        std = entry["standardName"]
        key = asset.get("asset_no") or asset.get("asset_no_normalized")

        category.setdefault(std, entry.get("category"))
        if entry.get("category") and category[std] != entry["category"]:
            errors.append(
                f"category conflict for '{std}': "
                f"{category[std]} vs {entry['category']} (via raw '{raw}')"
            )

        if entry.get("subtypeKind"):
            subtype_kind.setdefault(std, entry["subtypeKind"])
            if subtype_kind[std] != entry["subtypeKind"]:
                errors.append(
                    f"subtypeKind conflict for '{std}': "
                    f"{subtype_kind[std]} vs {entry['subtypeKind']}"
                )
        if entry.get("subtypeRequired") is not None:
            subtype_required[std] = entry["subtypeRequired"]

        review[std] = review.get(std, False) or bool(entry.get("review"))
        if entry.get("rationale"):
            rationales[std].append(f"{raw}: {entry['rationale']}")

        sources[std].add(raw)
        profile_count[std] += 1
        asset_ids[std].add(key)

        if profile.get("unit"):
            raw_units[std].add(profile["unit"])
            units[std].add(canonical_unit(profile["unit"], unit_aliases))

        subtype = entry.get("forceSubtype") or profile.get("subtype")
        if subtype:
            subtypes[std].add(subtype)

        role = entry.get("forceRole") or profile.get("role")
        if role:
            roles[std].add(role)

        pmin, pmax = profile.get("min"), profile.get("max")
        if pmin is not None:
            lo[std] = pmin if std not in lo else min(lo[std], pmin)
        if pmax is not None:
            hi[std] = pmax if std not in hi else max(hi[std], pmax)

        for bucket in profile.get("buckets") or []:
            bucket_count[std] += 1
            acc = bucket.get("accuracy") or {}
            if acc.get("type"):
                accuracy_types[std].add(acc["type"])

    if unmapped:
        for raw in sorted(unmapped):
            errors.append(f"registry parameter not covered by the map: '{raw}'")

    # Conflicts are detected per-profile, so the same problem repeats once per
    # profile that hits it. Report each distinct problem once.
    errors = list(dict.fromkeys(errors))

    standards = []
    for std in sorted(profile_count):
        unit_list = sorted(units[std])
        standards.append(
            {
                "standardName": std,
                "category": category.get(std),
                "units": unit_list,
                "defaultUnit": unit_list[0] if unit_list else None,
                "subtypes": sorted(subtypes[std]),
                "subtypeKind": subtype_kind.get(std),
                "subtypeRequired": subtype_required.get(std, False),
                "roles": sorted(roles[std]),
                "observedRange": (
                    {"min": lo.get(std), "max": hi.get(std)}
                    if std in lo and std in hi
                    else None
                ),
                "accuracyTypes": sorted(accuracy_types[std]),
                "profileCount": profile_count[std],
                "assetCount": len(asset_ids[std]),
                "bucketCount": bucket_count[std],
                "sourceNames": sorted(sources[std]),
                "needsReview": review.get(std, False),
                "reviewNotes": rationales.get(std, []),
                "rawUnitsSeen": sorted(raw_units[std]),
            }
        )

    return standards, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--map", dest="map_path", type=Path, default=DEFAULT_MAP)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--check", action="store_true", help="validate only; do not write output"
    )
    args = parser.parse_args()

    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    mapping = json.loads(args.map_path.read_text(encoding="utf-8"))

    standards, errors = build(registry, mapping)

    if errors:
        print("VALIDATION FAILED", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    needs_review = [s for s in standards if s["needsReview"]]
    no_accuracy = [s for s in standards if not s["accuracyTypes"]]
    formula_acc = [s for s in standards if "formula" in s["accuracyTypes"]]
    non_symmetric = [
        s
        for s in standards
        if set(s["accuracyTypes"]) - {"symmetric"} and s["accuracyTypes"]
    ]

    print(f"{len(standards)} standard parameters "
          f"(from {len(mapping['parameters']) - 1} raw registry names)")
    print(f"  needing engineer review : {len(needs_review)}")
    print(f"  with no accuracy data   : {len(no_accuracy)}")
    print(f"  with formula accuracy   : {len(formula_acc)}")
    print(f"  with non-symmetric acc. : {len(non_symmetric)}")

    if not args.check:
        payload = {
            "mapVersion": mapping.get("version"),
            "registrySchemaVersion": registry.get("metadata", {}).get("schema_version"),
            "standardCount": len(standards),
            "reviewRequiredCount": len(needs_review),
            "standards": standards,
        }
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"written to {args.out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
