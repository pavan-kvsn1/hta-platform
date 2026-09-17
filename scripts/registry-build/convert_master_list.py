#!/usr/bin/env python3
"""
Convert the HTA Master Instrument Excel sheet into a clean, structured JSON.

Usage:
    python scripts/convert_master_list.py <excel_path> [--output <output_path>] [--log-level DEBUG|INFO|WARNING]

Example:
    python scripts/convert_master_list.py ../reference_docs/master_list/"MASTER LIST AS PER SOP & PARAMETER.xlsx"
    python scripts/convert_master_list.py ../reference_docs/master_list/"MASTER LIST AS PER SOP & PARAMETER.xlsx" --output output/master_list.json

Reads the "MASTER LIST AS PER SOP" sheet and produces:
  - A clean JSON with normalized dates, parsed ranges, structured SOP entries,
    merged duplicates, and raw text preserved for auditability.
  - A companion _conversion_log.json with warnings, merge decisions, and parse failures.
"""

import argparse
import json
import logging
import re
import sys
from datetime import datetime
from pathlib import Path
from difflib import SequenceMatcher

import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SHEET_NAME = "MASTER LIST AS PER SOP"

# Column mapping: Excel header -> internal key
COLUMN_MAP = {
    "Sl.No": "sl_no",
    "Instrument Description": "instrument_desc",
    "Range": "range",
    "Make": "make",
    "Model": "model",  # Note: Excel header has a leading space " Model"
    "Asset No.": "asset_no",
    "Instrument Sl. No": "serial_no",
    "Usage": "usage",
    "Calibrated at": "calibrated_at",
    "Report No.": "report_no",
    "Next due on": "next_due_on",
    "SOP REFERENCE": "sop_reference",
    "PARAMETER": "parameter",
}

# Category section headers in the Excel (row where Sl.No = this text, rest empty)
CATEGORY_HEADERS = {
    "ELECTRO-TECHNICAL": "Electro-Technical",
    "THERMAL": "Thermal",
    "MECHANICAL": "Mechanical",
    "OTHERS": "Others",
    "SOURCE INSTRUMENTS": "Source",
}

# SOP prefix -> procedure scope (what calibration procedure this SOP covers)
# This is NOT the parameter group — it describes the procedure, not the measured quantity.
SOP_PROCEDURE_SCOPE = {
    "ET1": "RTD & Thermocouple calibration",
    "ET2": "AC/DC Voltage & Current calibration",
    "ET3": "AC/DC Voltage & Current calibration (extended)",
    "ET4": "General electrical measuring",
    "ET5": "Frequency, Resistance & Capacitance calibration",
    "ET6": "Resistance calibration (dedicated)",
    "ET7": "AC Voltage & Current calibration (high-range)",
    "TL1": "Temperature calibration (contact)",
    "TL2": "Temperature calibration (readout)",
    "TL3": "Temperature calibration (high-range thermocouple)",
    "TL4": "Temperature calibration (IR / non-contact)",
    "TL6": "Dew point calibration",
    "ML1": "Pressure / vacuum / differential pressure calibration",
    "ML2": "Pressure calibration (extended range)",
    "ML3": "Speed / RPM calibration",
    "ML4": "Force & weight calibration",
    "ML5": "Vibration calibration",
    "ML6": "Dimensional calibration (slip gauges)",
    "ML7": "Dimensional calibration (general)",
    "ML8": "Dimensional calibration (surface plate)",
    "ML9": "Level & angle calibration",
    "ML10": "Dimensional calibration (linear)",
    "ML12": "Hardness calibration",
    "ML13": "Weight calibration (standard)",
    "ML14": "Vacuum calibration",
    "EL1": "Temperature & humidity (environment) calibration",
    "EL2": "Sound level calibration",
    "EL3": "Light / lux calibration",
    "EL4": "Air velocity calibration",
    "EL6": "CO2 / gas detection calibration",
    "OS1": "Time / stopwatch calibration",
    "OS2": "Moisture calibration",
    "OS3": "Particle count (aerosol) calibration",
    "OS4": "CO2 measurement calibration",
    "OS5": "Flow calibration",
    "VL1": "Particle count / clean room validation",
    "VL2": "Validation (recorder)",
    "WC2": "Water chemistry / conductivity calibration",
}

# Normalization map: raw PARAMETER text fragments -> canonical parameter names
# Applied after splitting on delimiters (, / | & and parenthesized sub-groups)
PARAMETER_NORMALIZE = {
    # Pressure family
    "pressure": "Pressure",
    "vacuum": "Vacuum",
    "diff pressure": "Differential Pressure",
    "ultra vacuum": "Ultra Vacuum",
    # Temperature family
    "temperature": "Temperature",
    "relative huimidity": "Relative Humidity",  # typo in source
    "relative humidity": "Relative Humidity",
    "dew point": "Dew Point",
    # Electrical
    "rtd": "RTD",
    "tc": "Thermocouple",
    "ac voltage": "AC Voltage",
    "dc voltage": "DC Voltage",
    "ac/dc voltage": "AC/DC Voltage",
    "ac current": "AC Current",
    "dc current": "DC Current",
    "ac/dc current": "AC/DC Current",
    "ac/dc voltage &ac/dc current": "AC/DC Voltage, AC/DC Current",  # compound
    "dc voltage &dc current": "DC Voltage, DC Current",
    "dc voltage & dc current": "DC Voltage, DC Current",
    "frequency": "Frequency",
    "resistance": "Resistance",
    "capacitance": "Capacitance",
    "power": "Power",
    # Mechanical
    "force": "Force",
    "weight": "Weight",
    "speed": "Speed",
    "speed (contact & non contact)": "Speed (Contact), Speed (Non-Contact)",
    "velocity": "Vibration Velocity",
    "air velocity": "Air Velocity",
    "hardness": "Hardness",
    "length": "Length",
    "thickness": "Thickness",
    "level": "Level",
    "angle": "Angle",
    "flatness": "Flatness",
    "parallelness": "Parallelness",
    # Sound / Light / Environment
    "sound intensity": "Sound Intensity",
    "light intensity": "Light Intensity",
    "air flow": "Air Flow",
    "liquid flow": "Liquid Flow",
    "moisture content": "Moisture Content",
    "conductivity simulation": "Conductivity",
    "conductivity": "Conductivity",
    "co2": "CO2",
    "partical": "Particle Count",  # typo in source
    "particle": "Particle Count",
    "time": "Time",
    "volume": "Volume",
}

# Month name -> number for "Jan-2027" style dates
MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

logger = logging.getLogger("convert_master_list")

# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def clean_cell(value) -> str:
    """Normalize a cell value: stringify, strip whitespace/newlines, collapse spaces."""
    if pd.isna(value):
        return ""
    s = str(value).replace("\n", " ").replace("\r", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_asset_no(raw: str) -> str:
    """Normalize asset number spacing (e.g., '935HTAIPL/L' -> '935 HTAIPL/L')."""
    s = raw.strip()
    # Insert space before HTAIPL if missing
    s = re.sub(r"(\d)(HTAIPL)", r"\1 \2", s)
    # Also handle HATIPL typo
    s = re.sub(r"(\d)(HATIPL)", r"\1 \2", s)
    return s


def parse_date(raw: str) -> dict:
    """
    Parse a date string into ISO format.
    Returns {"date": "YYYY-MM-DD" | null, "approximate": bool, "raw": str}
    """
    if not raw:
        return {"date": None, "approximate": False, "raw": ""}

    raw = raw.strip()

    # Handle pandas datetime strings ("2026-01-30 00:00:00")
    pd_dt = re.match(r"^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}$", raw)
    if pd_dt:
        return {"date": pd_dt.group(1), "approximate": False, "raw": raw}

    # Handle "Mon-YYYY" format (e.g., "Jan-2027")
    mon_year = re.match(r"^([A-Za-z]{3})-(\d{4})$", raw)
    if mon_year:
        month_str, year_str = mon_year.groups()
        month = MONTH_MAP.get(month_str.lower())
        if month:
            return {
                "date": f"{year_str}-{month:02d}-01",
                "approximate": True,
                "raw": raw,
            }

    # Handle M/D/YY or M/D/YYYY
    parts = raw.split("/")
    if len(parts) == 3:
        try:
            month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
            # Expand 2-digit year
            if year < 100:
                year = 2000 + year if year <= 50 else 1900 + year
            # Validate
            dt = datetime(year, month, day)
            return {"date": dt.strftime("%Y-%m-%d"), "approximate": False, "raw": raw}
        except (ValueError, OverflowError):
            pass

    # Handle already-ISO or other parseable formats
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(raw, fmt)
            return {"date": dt.strftime("%Y-%m-%d"), "approximate": False, "raw": raw}
        except ValueError:
            continue

    # Unparseable
    return {"date": None, "approximate": False, "raw": raw}


def parse_range(raw: str) -> dict:
    """
    Parse the Range column into structured data.
    Returns {"text": str, "reference_doc": str|null, "parsed": list|null}
    """
    if not raw:
        return {"text": "", "reference_doc": None, "parsed": None}

    result = {"text": raw, "reference_doc": None, "parsed": None}

    # Check if it's a reference doc pointer
    ref_match = re.match(r"Refer\s+Doc\.?\s*No[.:]?\s*[-:]?\s*(.+)", raw, re.IGNORECASE)
    if ref_match:
        result["reference_doc"] = ref_match.group(1).strip()
        return result

    if re.match(r"Refer\s+the\s+Manual", raw, re.IGNORECASE):
        result["reference_doc"] = "Refer the Manual"
        return result

    if raw.upper() in ("NA", "N/A", "-"):
        return result

    # Normalize unicode characters for parsing
    normalized = raw.replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-")

    # Handle ± ranges (e.g., "± 25 mbar" means -25 to +25 mbar)
    pm_match = re.match(r"[±\xb1]\s*(\d+\.?\d*)\s*(\S.*)", normalized)
    if pm_match:
        val, unit = pm_match.groups()
        val_f = float(val)
        return {
            "text": raw,
            "reference_doc": None,
            "parsed": [{"min": -val_f, "max": val_f, "unit": unit.strip()}],
        }

    # Try to parse numeric ranges
    parsed_ranges = []

    # Pattern: "Temp: (5 to 50)°C  Hum: (20 to 95)%RH" or "Voltage: 120V to 240 V"
    # 5-group: (label, min, unit1, max, unit2) — take whichever unit is non-empty
    compound = re.findall(
        r"(?:(\w[\w\s]*?):\s*)?\(?([+-]?\d+\.?\d*)\s*(\S*?)\s*(?:to|~|-)\s*([+-]?\d+\.?\d*)\)?\s*([°%]?\S+)",
        normalized,
    )
    if len(compound) >= 2:
        for label, min_val, unit1, max_val, unit2 in compound:
            unit = (unit2 or unit1).strip().rstrip(",")
            entry = {"min": float(min_val), "max": float(max_val), "unit": unit}
            if label and label.strip():
                entry["label"] = label.strip()
            parsed_ranges.append(entry)
        result["parsed"] = parsed_ranges
        return result

    # Single compound match (e.g., "(5 to 50)°C")
    if len(compound) == 1:
        label, min_val, unit1, max_val, unit2 = compound[0]
        unit = (unit2 or unit1).strip().rstrip(",")
        entry = {"min": float(min_val), "max": float(max_val), "unit": unit}
        if label and label.strip():
            entry["label"] = label.strip()
        parsed_ranges.append(entry)
        result["parsed"] = parsed_ranges
        return result

    # Pattern: simple "X to Y unit" or "X to Y" — e.g., "0 to 100 kgf", "-1 bar to 20 bar"
    simple = re.match(
        r"([+-]?\d+\.?\d*)\s*(\S*?)\s*(?:to|~|-)\s*([+-]?\d+\.?\d*)\s*(\S*)",
        normalized,
    )
    if simple:
        min_val, unit1, max_val, unit2 = simple.groups()
        unit = (unit2 or unit1).strip().rstrip(",")
        if unit:
            parsed_ranges.append({"min": float(min_val), "max": float(max_val), "unit": unit})
            result["parsed"] = parsed_ranges
            return result

    # Pattern: discrete values like "94 dB & 114 dB" or "5kg, 10kg"
    discrete = re.findall(r"([+-]?\d+\.?\d*)\s*([°%]?\w[/\w]*)", normalized)
    if len(discrete) >= 2:
        units = set(u for _, u in discrete)
        if len(units) == 1:
            values = [float(v) for v, _ in discrete]
            unit = units.pop()
            parsed_ranges.append({
                "values": values,
                "unit": unit,
            })
            result["parsed"] = parsed_ranges
            return result

    return result


def parse_composite_field(raw: str) -> dict:
    """
    Parse composite make/model/serial fields with 'Ind:' / 'Sen:' notation.
    Returns {"raw": str, "indicator": str|null, "sensor": str|null}
    """
    if not raw:
        return {"raw": "", "indicator": None, "sensor": None}

    result = {"raw": raw, "indicator": None, "sensor": None}

    # Check for Ind: / Sen: pattern
    ind_match = re.search(r"Ind[.:]?\s*[:]\s*(.+?)(?:\s+Sen[.:]?\s*[:]|&\s*Sen[.:]?\s*[:]|$)", raw, re.IGNORECASE)
    sen_match = re.search(r"Sen[.:]?\s*[:]\s*(.+?)$", raw, re.IGNORECASE)

    if ind_match:
        result["indicator"] = ind_match.group(1).strip().rstrip("&").strip()
    if sen_match:
        result["sensor"] = sen_match.group(1).strip()

    return result


def parse_sop_references(raw: str) -> list[str]:
    """Split SOP reference string into clean list."""
    if not raw:
        return []
    # Split on comma, strip whitespace, remove empties
    refs = [r.strip() for r in raw.split(",") if r.strip()]
    return refs


def extract_sop_prefix(sop: str) -> str | None:
    """Extract the prefix code from a SOP reference (e.g., 'NLAB/CAL/ET1/R01' -> 'ET1')."""
    match = re.match(r"NLAB/CAL/(\w+)/", sop)
    return match.group(1) if match else None


def parse_roles(param_text: str) -> list[str]:
    """Extract roles (MEASURING, SOURCE) from the PARAMETER column text."""
    if not param_text:
        return []
    upper = param_text.upper()
    roles = []
    if "MEASURING" in upper:
        roles.append("measuring")
    if "SOURCE" in upper:
        roles.append("source")
    # If neither keyword found but text exists, default to measuring
    if not roles and param_text.strip():
        roles.append("measuring")
    return roles


def parse_parameters(param_text: str) -> list[str]:
    """
    Extract normalized parameter names from the PARAMETER column text.
    Splits compound values, fixes typos, normalizes casing.

    Examples:
        "Pressure , Vacuum" -> ["Pressure", "Vacuum"]
        "Diff pressure, Temperature" -> ["Differential Pressure", "Temperature"]
        "Speed (Contact & Non Contact)" -> ["Speed (Contact)", "Speed (Non-Contact)"]
        "SOURCE (RTD & TC) (AC/DC VOLTAGE &AC/DC CURRENT)" -> ["RTD", "Thermocouple", "AC/DC Voltage", "AC/DC Current"]
        "MEASURING RESISTANCE" -> ["Resistance"]
    """
    if not param_text:
        return []

    text = param_text.strip()

    # First, check if the entire text (lowered) matches a normalize key
    lower_full = text.lower()
    if lower_full in PARAMETER_NORMALIZE:
        # May contain commas (e.g., "Speed (Contact), Speed (Non-Contact)")
        return [p.strip() for p in PARAMETER_NORMALIZE[lower_full].split(",")]

    # Strip role prefixes for further parsing
    cleaned = re.sub(r"^(MEASURING\s*&?\s*SOURCE|MEASURING|SOURCE)\s*", "", text, flags=re.IGNORECASE).strip()

    # If cleaned is empty after stripping (e.g., "SOURCE" alone with no params), skip
    if not cleaned:
        return []

    # Extract parenthesized groups: "(RTD & TC)", "(AC/DC VOLTAGE &AC/DC CURRENT)", etc.
    paren_groups = re.findall(r"\(([^)]+)\)", cleaned)

    # Also get non-parenthesized parts
    non_paren = re.sub(r"\([^)]*\)", "", cleaned).strip()

    # Collect all raw tokens
    raw_tokens = []

    # From parenthesized groups: split on , and &
    for group in paren_groups:
        # Split on comma first, then & within each
        for part in re.split(r",", group):
            for sub in re.split(r"\s*&\s*", part.strip()):
                sub = sub.strip()
                if sub:
                    raw_tokens.append(sub)

    # From non-parenthesized part: split on , / |
    if non_paren:
        for part in re.split(r"[,/|]", non_paren):
            part = part.strip().rstrip(",")
            if part:
                raw_tokens.append(part)

    # Normalize each token
    params = []
    seen = set()
    for token in raw_tokens:
        lower = token.lower().strip()
        if not lower:
            continue
        normalized = PARAMETER_NORMALIZE.get(lower)
        if normalized:
            # Normalized value may itself be comma-separated (e.g., "DC Voltage, DC Current")
            for p in normalized.split(","):
                p = p.strip()
                if p and p not in seen:
                    params.append(p)
                    seen.add(p)
        else:
            # Title-case the raw token as fallback
            titled = token.strip().title()
            if titled and titled not in seen:
                params.append(titled)
                seen.add(titled)
                logger.debug(f"Parameter token not in normalize map: '{token}' -> '{titled}'")

    return params


def build_sop_entries(sop_refs: list[str], param_text: str) -> list[dict]:
    """
    Build structured SOP entries from SOP references and PARAMETER text.
    Each SOP gets its own entry with:
      - procedure_scope: what the SOP procedure covers (from SOP prefix)
      - roles: measuring / source (from PARAMETER text)
      - parameters: the actual measured quantities (from PARAMETER text)
    """
    if not sop_refs:
        return []

    roles = parse_roles(param_text)
    parameters = parse_parameters(param_text)

    entries = []
    for sop in sop_refs:
        prefix = extract_sop_prefix(sop)
        scope = SOP_PROCEDURE_SCOPE.get(prefix, None) if prefix else None

        entry = {
            "sop_reference": sop,
            "procedure_scope": scope,
            "roles": roles,
            "parameters": parameters,
        }

        entries.append(entry)

    return entries


def similarity(a: str, b: str) -> float:
    """Fuzzy string similarity ratio (0-1)."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


# ---------------------------------------------------------------------------
# Main conversion pipeline
# ---------------------------------------------------------------------------


def read_excel(path: str) -> pd.DataFrame:
    """Read the master list sheet into a DataFrame with clean column names."""
    df = pd.read_excel(path, sheet_name=SHEET_NAME, header=0, dtype=str)

    # Strip BOM and whitespace from column names
    df.columns = [c.strip().lstrip("\ufeff") for c in df.columns]

    # Drop unnamed/empty columns (Excel merged cells create hundreds of these)
    df = df[[c for c in df.columns if not c.startswith("Unnamed:")]]

    logger.info(f"Read {len(df)} rows, columns: {list(df.columns)}")
    return df


def identify_categories(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[int, str]]:
    """
    Identify category header rows and assign categories to data rows.
    Returns (filtered DataFrame without header rows, {row_index: category}).
    """
    category_rows = {}
    current_category = "Unknown"
    row_categories = {}

    for idx, row in df.iterrows():
        sl = clean_cell(row.iloc[0])

        # Check if this is a category header
        if sl.upper() in CATEGORY_HEADERS:
            current_category = CATEGORY_HEADERS[sl.upper()]
            category_rows[idx] = current_category
            logger.debug(f"Row {idx}: category header '{sl}' -> {current_category}")
            continue

        # Skip the header row if it appears again (Sl.No)
        if sl == "Sl.No":
            continue

        # Skip empty rows
        if not sl:
            continue

        # Check if sl_no is numeric (data row)
        try:
            int(float(sl))
            row_categories[idx] = current_category
        except (ValueError, TypeError):
            # Non-numeric, non-header — might be a sub-header or junk
            logger.warning(f"Row {idx}: skipping non-numeric Sl.No = '{sl}'")

    # Filter to only data rows
    data_df = df.loc[list(row_categories.keys())].copy()
    return data_df, row_categories


def process_rows(df: pd.DataFrame, row_categories: dict[int, str]) -> list[dict]:
    """Process each data row into a structured instrument dict."""
    instruments = []
    warnings = []

    for idx, row in df.iterrows():
        category = row_categories.get(idx, "Unknown")

        # Clean all cells
        sl_no = clean_cell(row.iloc[0])
        instrument_desc = clean_cell(row.iloc[1])
        range_raw = clean_cell(row.iloc[2])
        make_raw = clean_cell(row.iloc[3])
        model_raw = clean_cell(row.iloc[4])
        asset_no_raw = clean_cell(row.iloc[5])
        serial_no_raw = clean_cell(row.iloc[6])
        usage = clean_cell(row.iloc[7])
        calibrated_at = clean_cell(row.iloc[8])
        report_no = clean_cell(row.iloc[9])
        next_due_on_raw = clean_cell(row.iloc[10])
        sop_ref_raw = clean_cell(row.iloc[11])
        parameter_raw = clean_cell(row.iloc[12]) if len(row) > 12 else ""

        # Parse ID
        try:
            inst_id = int(float(sl_no))
        except (ValueError, TypeError):
            logger.warning(f"Row {idx}: could not parse Sl.No '{sl_no}', skipping")
            continue

        # Normalize asset number
        asset_no = normalize_asset_no(asset_no_raw)

        # Parse date
        date_info = parse_date(next_due_on_raw)
        if date_info["date"] is None and next_due_on_raw:
            warnings.append({
                "id": inst_id,
                "field": "next_due_on",
                "issue": f"Could not parse date: '{next_due_on_raw}'",
            })

        # Parse range
        range_info = parse_range(range_raw)

        # Parse composite fields
        make_info = parse_composite_field(make_raw)
        model_info = parse_composite_field(model_raw)
        serial_info = parse_composite_field(serial_no_raw)

        # Parse SOP references
        sop_refs = parse_sop_references(sop_ref_raw)

        # Build SOP entries
        sop_entries = build_sop_entries(sop_refs, parameter_raw)

        instrument = {
            "id": inst_id,
            "category": category,
            "instrument_desc": instrument_desc,
            # Identity
            "make": make_info["raw"],
            "make_parsed": (
                {"indicator": make_info["indicator"], "sensor": make_info["sensor"]}
                if make_info["indicator"] or make_info["sensor"]
                else None
            ),
            "model": model_info["raw"],
            "model_parsed": (
                {"indicator": model_info["indicator"], "sensor": model_info["sensor"]}
                if model_info["indicator"] or model_info["sensor"]
                else None
            ),
            "asset_no": asset_no,
            "serial_no": serial_info["raw"],
            "serial_parsed": (
                {"indicator": serial_info["indicator"], "sensor": serial_info["sensor"]}
                if serial_info["indicator"] or serial_info["sensor"]
                else None
            ),
            # Operational
            "usage": usage or None,
            "calibrated_at": calibrated_at or None,
            "report_no": report_no or None,
            # Date
            "next_due_on": date_info["date"],
            "due_date_approximate": date_info["approximate"] or None,  # omit False
            "due_date_raw": (
                date_info["raw"]
                if date_info["raw"]
                and not date_info["raw"].startswith(date_info["date"] or "\x00")
                else None
            ),
            # Range
            "range_text": range_info["text"] or None,
            "range_reference_doc": range_info["reference_doc"],
            "range_parsed": range_info["parsed"],
            # Parameters
            "parameter_raw": parameter_raw or None,
            "parameters": parse_parameters(parameter_raw),
            "roles": parse_roles(parameter_raw),
            "sop_references": sop_refs,
            "sop_entries": sop_entries,
        }

        instruments.append(instrument)

    return instruments, warnings


def merge_duplicates(instruments: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Handle duplicate asset numbers:
    - Same asset + similar description -> merge into one with combined SOP entries
    - Same asset + different description -> keep separate, flag them
    """
    from collections import defaultdict

    asset_groups = defaultdict(list)
    for inst in instruments:
        asset_groups[inst["asset_no"]].append(inst)

    merged = []
    merge_log = []

    for asset_no, group in asset_groups.items():
        if len(group) == 1:
            merged.append(group[0])
            continue

        # Cluster by description similarity
        clusters = []
        used = set()

        for i, inst_a in enumerate(group):
            if i in used:
                continue
            cluster = [inst_a]
            used.add(i)

            for j, inst_b in enumerate(group):
                if j in used:
                    continue
                sim = similarity(inst_a["instrument_desc"], inst_b["instrument_desc"])
                if sim > 0.6:
                    cluster.append(inst_b)
                    used.add(j)

            clusters.append(cluster)

        for cluster in clusters:
            if len(cluster) == 1:
                # Unique instrument despite shared asset_no
                merged.append(cluster[0])
                merge_log.append({
                    "action": "kept_separate",
                    "asset_no": asset_no,
                    "ids": [c["id"] for c in cluster],
                    "descriptions": [c["instrument_desc"] for c in cluster],
                    "reason": "Only one in similarity cluster",
                })
            else:
                # Merge: take the first as base, combine SOP entries and parameter text
                base = cluster[0].copy()
                all_sop_entries = list(base["sop_entries"])
                all_sop_refs = list(base["sop_references"])
                all_param_raw = [base["parameter_raw"]] if base["parameter_raw"] else []
                merged_ids = [base["id"]]

                for other in cluster[1:]:
                    merged_ids.append(other["id"])
                    # Add unique SOP entries
                    existing_sops = {e["sop_reference"] for e in all_sop_entries}
                    for entry in other["sop_entries"]:
                        if entry["sop_reference"] not in existing_sops:
                            all_sop_entries.append(entry)
                            existing_sops.add(entry["sop_reference"])
                    # Add unique SOP refs
                    for ref in other["sop_references"]:
                        if ref not in all_sop_refs:
                            all_sop_refs.append(ref)
                    # Collect parameter text
                    if other["parameter_raw"] and other["parameter_raw"] not in all_param_raw:
                        all_param_raw.append(other["parameter_raw"])
                    # Take the latest due date
                    if other["next_due_on"] and (
                        not base["next_due_on"] or other["next_due_on"] > base["next_due_on"]
                    ):
                        base["next_due_on"] = other["next_due_on"]
                        base["due_date_approximate"] = other["due_date_approximate"]
                        base["due_date_raw"] = other.get("due_date_raw")

                base["sop_entries"] = all_sop_entries
                base["sop_references"] = all_sop_refs
                base["parameter_raw"] = " | ".join(all_param_raw) if all_param_raw else None
                # Merge parameters and roles (union of all)
                all_params = list(base.get("parameters", []))
                all_roles = list(base.get("roles", []))
                for other in cluster[1:]:
                    for p in other.get("parameters", []):
                        if p not in all_params:
                            all_params.append(p)
                    for r in other.get("roles", []):
                        if r not in all_roles:
                            all_roles.append(r)
                base["parameters"] = all_params
                base["roles"] = all_roles
                base["_merged_from_ids"] = merged_ids

                merged.append(base)
                merge_log.append({
                    "action": "merged",
                    "asset_no": asset_no,
                    "ids": merged_ids,
                    "descriptions": [c["instrument_desc"] for c in cluster],
                    "reason": f"Similar descriptions (similarity > 0.6), combined SOP entries",
                })

    # Re-sort by original ID
    merged.sort(key=lambda x: x["id"])

    return merged, merge_log


def validate_output(instruments: list[dict]) -> list[dict]:
    """Run validation checks and return warnings."""
    warnings = []
    today = datetime.now().strftime("%Y-%m-%d")

    for inst in instruments:
        # Date validation
        if inst["next_due_on"]:
            if inst["next_due_on"] < "2025-01-01" or inst["next_due_on"] > "2028-12-31":
                warnings.append({
                    "id": inst["id"],
                    "field": "next_due_on",
                    "issue": f"Date {inst['next_due_on']} outside expected range 2025-2028",
                })
            if inst["next_due_on"] < today:
                warnings.append({
                    "id": inst["id"],
                    "field": "next_due_on",
                    "issue": f"Date {inst['next_due_on']} is in the past (expired)",
                    "severity": "info",
                })

        # Missing critical fields
        if not inst["asset_no"]:
            warnings.append({"id": inst["id"], "field": "asset_no", "issue": "Missing asset number"})
        if not inst["instrument_desc"]:
            warnings.append({"id": inst["id"], "field": "instrument_desc", "issue": "Missing description"})
        if not inst["sop_references"]:
            warnings.append({
                "id": inst["id"],
                "field": "sop_references",
                "issue": "No SOP references found",
            })

        # SOP entries without procedure scope mapping
        for entry in inst.get("sop_entries", []):
            if entry["sop_reference"] != "AS A SOURCE" and not entry.get("procedure_scope"):
                prefix = extract_sop_prefix(entry["sop_reference"])
                warnings.append({
                    "id": inst["id"],
                    "field": "sop_entries",
                    "issue": f"SOP prefix '{prefix}' not in SOP_PROCEDURE_SCOPE for ref '{entry['sop_reference']}'",
                })

        # No parameters extracted
        if not inst.get("parameters"):
            warnings.append({
                "id": inst["id"],
                "field": "parameters",
                "issue": f"No parameters extracted from: '{inst.get('parameter_raw', '')}'",
            })

    return warnings


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Convert HTA Master Instrument Excel to JSON")
    parser.add_argument("excel_path", help="Path to the Excel file")
    parser.add_argument(
        "--output", "-o",
        help="Output JSON path (default: <excel_dir>/master_list_converted.json)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(levelname)-7s %(message)s",
    )

    excel_path = Path(args.excel_path)
    if not excel_path.exists():
        logger.error(f"File not found: {excel_path}")
        sys.exit(1)

    output_path = Path(args.output) if args.output else excel_path.parent / "master_list_converted.json"
    log_path = output_path.with_name(output_path.stem + "_conversion_log.json")

    # --- Pipeline ---
    logger.info(f"Reading {excel_path}")
    df = read_excel(str(excel_path))

    logger.info("Identifying category headers...")
    data_df, row_categories = identify_categories(df)
    logger.info(f"Found {len(data_df)} data rows across categories")

    logger.info("Processing rows...")
    instruments, parse_warnings = process_rows(data_df, row_categories)
    logger.info(f"Processed {len(instruments)} instruments")

    logger.info("Merging duplicate asset numbers...")
    instruments, merge_log = merge_duplicates(instruments)
    logger.info(f"After merge: {len(instruments)} instruments ({len(merge_log)} merge decisions)")

    logger.info("Validating output...")
    validation_warnings = validate_output(instruments)

    # --- Summary ---
    categories = {}
    for inst in instruments:
        cat = inst["category"]
        categories[cat] = categories.get(cat, 0) + 1

    summary = {
        "source_file": str(excel_path.name),
        "converted_at": datetime.now().isoformat(),
        "total_instruments": len(instruments),
        "by_category": categories,
        "parse_warnings": len(parse_warnings),
        "merge_decisions": len(merge_log),
        "validation_warnings": len(validation_warnings),
    }

    print("\n" + "=" * 60)
    print("  CONVERSION SUMMARY")
    print("=" * 60)
    print(f"  Source:       {excel_path.name}")
    print(f"  Instruments:  {len(instruments)}")
    for cat, count in sorted(categories.items()):
        print(f"    {cat}: {count}")
    print(f"  Parse warnings:      {len(parse_warnings)}")
    print(f"  Merge decisions:     {len(merge_log)}")
    print(f"  Validation warnings: {len(validation_warnings)}")
    print(f"  Output:       {output_path}")
    print(f"  Log:          {log_path}")
    print("=" * 60 + "\n")

    # --- Clean output: strip keys with None/False values to reduce noise ---
    STRIP_IF_FALSY = {
        "make_parsed", "model_parsed", "serial_parsed",
        "due_date_approximate", "due_date_raw",
        "range_reference_doc", "range_parsed",
    }
    for inst in instruments:
        for key in STRIP_IF_FALSY:
            if key in inst and not inst[key]:
                del inst[key]

    # --- Write output ---
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(instruments, f, indent=2, ensure_ascii=False)
    logger.info(f"Wrote {output_path}")

    conversion_log = {
        "summary": summary,
        "parse_warnings": parse_warnings,
        "merge_log": merge_log,
        "validation_warnings": validation_warnings,
    }
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(conversion_log, f, indent=2, ensure_ascii=False)
    logger.info(f"Wrote {log_path}")


if __name__ == "__main__":
    main()
