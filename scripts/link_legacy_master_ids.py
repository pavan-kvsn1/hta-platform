"""Add legacy_id to each registry unit, joining against the old master list.

Certificates reference a master instrument by the sequential integer id from
apps/web-hta/src/data/master-instruments.json. The registry keys by asset number
instead, so migrating the store to the registry without carrying that id across would
break every saved certificate's master reference.

The join is the normalized asset number plus position within the asset. That was
verified against the real data: 209 legacy rows to 209 registry units, 202 asset
numbers on both sides, matching counts per asset number, and matching order within
every multi-unit asset. The one difference is whitespace - "935HTAIPL/L" against
"935 HTAIPL/L" - which normalizing removes.

Fails closed: a unit that cannot be joined is an error, not a null, because a silently
missing legacy_id would look identical to an instrument that simply cannot be selected.
"""

import collections
import json
import re
import sys
from pathlib import Path

LEGACY = Path("apps/web-hta/src/data/master-instruments.json")
REGISTRY = Path("apps/web-hta/src/data/master-instrument-registry.json")


def normalize(asset_no):
    return re.sub(r"\s+", "", asset_no or "").upper()


def main():
    legacy = json.loads(LEGACY.read_text(encoding="utf-8"))
    if isinstance(legacy, dict):
        legacy = legacy.get("instruments") or legacy.get("data") or []
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))

    by_asset = collections.defaultdict(list)
    for row in legacy:
        by_asset[normalize(row.get("asset_no"))].append(row)

    problems = []
    linked = 0
    for asset in registry["assets"]:
        rows = by_asset.get(normalize(asset["asset_no"]), [])
        if len(rows) != len(asset["units"]):
            problems.append(
                f"{asset['asset_no']}: {len(asset['units'])} units but {len(rows)} legacy rows"
            )
            continue
        for unit, row in zip(asset["units"], rows):
            legacy_id = row.get("id")
            if not isinstance(legacy_id, int):
                problems.append(f"{asset['asset_no']}: legacy row has no integer id")
                continue
            unit["legacy_id"] = legacy_id
            linked += 1

    if problems:
        print("VALIDATION FAILED - legacy ids could not be joined:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    ids = [u["legacy_id"] for a in registry["assets"] for u in a["units"]]
    if len(ids) != len(set(ids)):
        duplicated = [i for i, n in collections.Counter(ids).items() if n > 1]
        print(f"VALIDATION FAILED - legacy ids are not unique: {duplicated[:10]}")
        return 1

    REGISTRY.write_text(
        json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"linked {linked} units to legacy ids; all unique")
    return 0


if __name__ == "__main__":
    sys.exit(main())
