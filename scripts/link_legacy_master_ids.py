"""Backfill registry identity from the old master list, and link legacy ids.

Two jobs, one join, because they need the same pairing.

1. legacy_id on every unit. Certificates reference a master by the sequential integer
   id from master-instruments.json; the registry keys by asset number. Without the id
   carried across, moving the store onto the registry breaks every saved certificate's
   master reference.

2. Identity for the units the standardizer could not match. Three units - 580B, 580C
   and 188C - were flagged has_master_record: false and left with null make, model,
   serial, dates and report number. That flag was wrong: the master list does hold
   them. They are extra units inside a shared asset number, and the matcher keyed on
   asset number alone, so only the first unit of each asset found its row.

The join is asset number plus position within the asset, verified against the data:
209 legacy rows to 209 units, 202 asset numbers on both sides, counts matching per
asset number, and order matching within all five multi-unit assets.

Only null fields are filled. Where the registry has a value it stays - it was read
from a calibration certificate and is the better source, which is why 188C keeps
"Low Pressure External Transducer with Calibrator" over the master list's shorter name.

Fails closed on an unjoinable unit: a silently missing legacy_id looks exactly like an
instrument that cannot be selected.
"""

import collections
import json
import re
import sys
from datetime import date
from pathlib import Path

LEGACY = Path("apps/web-hta/src/data/master-instruments.json")
REGISTRY = Path("apps/web-hta/src/data/master-instrument-registry.json")

# Matches the standardizer, so a backfilled unit gets the same warning window as the
# rest rather than a second rule.
EXPIRING_SOON_DAYS = 60

BACKFILL_FIELDS = {
    "instrument_desc": "instrument_desc",
    "category": "type",
    "usage": "usage",
    "calibrated_at": "calibrated_at",
    "report_no": "report_no",
    "make": "make",
    "model": "model",
    "serial_no": "instrument_sl_no",
}


def normalize(asset_no):
    return re.sub(r"\s+", "", asset_no or "").upper()


def to_iso(value):
    """M/D/YYYY to ISO. Returns None rather than guessing at anything else."""
    if not value:
        return None
    match = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$", str(value))
    if not match:
        return None
    month, day, year = (int(part) for part in match.groups())
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def flatten(value):
    """The old file writes a composite as {ind, sen}; the registry writes the string."""
    if isinstance(value, dict):
        ind = value.get("ind") or ""
        sen = value.get("sen") or ""
        return f"Ind: {ind} Sen: {sen}".strip()
    if value is None:
        return None
    text = str(value).strip()
    # 'NA' is an absent value written longhand.
    return None if text.upper() in {"", "NA", "N/A"} else text


TRAILING_SEPARATOR = re.compile(r"[\s&,;/]+$")


def repair_parts(unit):
    """Strip a separator the Ind/Sen split left on the indicator part.

    "Ind: 5250062 & Sen: 25005083" split to an indicator of "5250062 &", because the
    pattern stops at "Sen" and only the whitespace before it was consumed. A serial
    number with a stray ampersand does not match the instrument it identifies. Fixed at
    source in standardize_registry.py too; this repairs data already generated.
    """
    changed = 0
    for key in ("make_parts", "model_parts", "serial_parts"):
        parts = unit.get(key)
        if not isinstance(parts, dict):
            continue
        for side in ("ind", "sen"):
            value = parts.get(side)
            if isinstance(value, str):
                cleaned = TRAILING_SEPARATOR.sub("", value.strip())
                if cleaned != value:
                    parts[side] = cleaned
                    changed += 1
    return changed


def parts_of(value):
    if isinstance(value, dict) and (value.get("ind") or value.get("sen")):
        return {"ind": value.get("ind"), "sen": value.get("sen")}
    return None


def calibration_state(iso_due, today):
    if not iso_due:
        return "UNKNOWN", None
    due = date.fromisoformat(iso_due)
    days = (due - today).days
    if days < 0:
        return "EXPIRED", -days
    if days <= EXPIRING_SOON_DAYS:
        return "EXPIRING_SOON", days
    return "VALID", days


def main():
    legacy = json.loads(LEGACY.read_text(encoding="utf-8"))
    if isinstance(legacy, dict):
        legacy = legacy.get("instruments") or legacy.get("data") or []
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    today = date.today()

    by_asset = collections.defaultdict(list)
    for row in legacy:
        by_asset[normalize(row.get("asset_no"))].append(row)

    problems = []
    linked = 0
    filled = collections.Counter()
    repaired = []

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

            had_record = unit.get("has_master_record")
            for registry_key, legacy_key in BACKFILL_FIELDS.items():
                if unit.get(registry_key):
                    continue
                value = flatten(row.get(legacy_key))
                if value:
                    unit[registry_key] = value
                    filled[registry_key] += 1

            for registry_key, legacy_key in (
                ("make_parts", "make"),
                ("model_parts", "model"),
                ("serial_parts", "instrument_sl_no"),
            ):
                if unit.get(registry_key) is None:
                    parts = parts_of(row.get(legacy_key))
                    if parts:
                        unit[registry_key] = parts
                        filled[registry_key] += 1

            if not unit.get("sop_references") and row.get("sop_references"):
                unit["sop_references"] = row["sop_references"]
                filled["sop_references"] += 1

            if not unit.get("next_due_on"):
                iso = to_iso(row.get("next_due_on"))
                if iso:
                    unit["next_due_on"] = iso
                    filled["next_due_on"] += 1
                    # The due date decides the state, so they move together.
                    state, days = calibration_state(iso, today)
                    unit["calibration_state"] = state
                    unit["calibration_days"] = days

            filled["separator_stripped"] += repair_parts(unit)

            if had_record is False:
                # The flag was wrong: the master list does hold this unit.
                unit["has_master_record"] = True
                repaired.append(f"{asset['asset_no']} unit {unit['id']} (legacy {legacy_id})")

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
    if filled:
        print("backfilled from the master list:")
        for key, count in sorted(filled.items()):
            print(f"  {key}: {count}")
    if repaired:
        print("has_master_record corrected to true for:")
        for entry in repaired:
            print(f"  {entry}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
