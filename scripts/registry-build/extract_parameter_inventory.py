"""Extract the distinct calibration-parameter inventory from the master instrument registry.

Produces the source data for CalibrationParameterStandards (see
docs/scope/master-spec-integration-scope.md section 5).

The scope doc asserts "41 parameters"; this script derives the real number and
shape directly from the registry so the seed script is not written against a
guess.

Usage:
    python scripts/extract_parameter_inventory.py [--registry PATH] [--out PATH]
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

DEFAULT_REGISTRY = Path(
    "C:/Users/kcsva/OneDrive/Documents/HTACalibr8s/reference_docs/master_list"
    "/master_details/master_instrment_registry.json"
)
DEFAULT_OUT = Path("docs/scope/parameter-inventory.json")


def iter_profiles(assets):
    """Yield (asset, profile) for every capability profile in the registry.

    Composite assets carry their profiles on components (and, defensively, on
    the component's master_record), so all three locations are walked.
    """
    for asset in assets:
        for profile in asset.get("capability_profiles") or []:
            yield asset, profile
        for component in asset.get("components") or []:
            for profile in component.get("capability_profiles") or []:
                yield asset, profile
            master_record = component.get("master_record") or {}
            for profile in master_record.get("capability_profiles") or []:
                yield asset, profile


def asset_category(asset):
    if asset.get("category"):
        return asset["category"]
    for component in asset.get("components") or []:
        record = component.get("master_record") or {}
        if record.get("category"):
            return record["category"]
    return None


def build_inventory(registry):
    assets = registry["assets"]

    units = defaultdict(set)
    subtypes = defaultdict(set)
    roles = defaultdict(set)
    categories = defaultdict(set)
    profile_count = defaultdict(int)
    asset_ids = defaultdict(set)
    ranges = defaultdict(list)
    bucket_count = defaultdict(int)
    accuracy_types = defaultdict(set)

    for asset, profile in iter_profiles(assets):
        name = profile["parameter"]
        key = asset.get("asset_no") or asset.get("asset_no_normalized")

        profile_count[name] += 1
        asset_ids[name].add(key)
        if profile.get("unit"):
            units[name].add(profile["unit"])
        if profile.get("subtype"):
            subtypes[name].add(profile["subtype"])
        if profile.get("role"):
            roles[name].add(profile["role"])
        category = asset_category(asset)
        if category:
            categories[name].add(category)

        lo, hi = profile.get("min"), profile.get("max")
        if lo is not None and hi is not None:
            ranges[name].append((lo, hi))

        for bucket in profile.get("buckets") or []:
            bucket_count[name] += 1
            accuracy = bucket.get("accuracy") or {}
            if accuracy.get("type"):
                accuracy_types[name].add(accuracy["type"])

    parameters = []
    for name in sorted(profile_count):
        spans = ranges[name]
        unit_list = sorted(units[name])
        parameters.append(
            {
                "standardName": name,
                "categories": sorted(categories[name]),
                "roles": sorted(roles[name]),
                "units": unit_list,
                # Most-common unit is a better default than alphabetical first.
                "defaultUnit": unit_list[0] if unit_list else None,
                "subtypes": sorted(subtypes[name]),
                "profileCount": profile_count[name],
                "assetCount": len(asset_ids[name]),
                "bucketCount": bucket_count[name],
                "accuracyTypes": sorted(accuracy_types[name]),
                "observedRange": (
                    {"min": min(s[0] for s in spans), "max": max(s[1] for s in spans)}
                    if spans
                    else None
                ),
            }
        )

    return {
        "source": {
            "schema_version": registry.get("metadata", {}).get("schema_version"),
            "asset_count": len(assets),
            "profile_count": sum(profile_count.values()),
        },
        "parameterCount": len(parameters),
        "parameters": parameters,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    inventory = build_inventory(registry)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(inventory, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"{inventory['parameterCount']} distinct parameters "
          f"from {inventory['source']['profile_count']} profiles "
          f"across {inventory['source']['asset_count']} assets")
    print(f"written to {args.out}")


if __name__ == "__main__":
    main()
