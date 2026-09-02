#!/usr/bin/env python3
"""
Manual extraction guide for least counts and accuracy from PDF certificates.
This script helps systematically document the data by:
1. Listing all PDFs
2. Showing extraction requirements
3. Creating a guided workflow for manual data collection
"""

import json
from pathlib import Path
from typing import Dict, List, Any

def generate_extraction_guide(pdf_folder: str, output_path: str) -> None:
    """
    Generate an extraction guide JSON with placeholder entries for each PDF.
    Users can fill in the least_count and accuracy values.
    """
    pdf_files = sorted(Path(pdf_folder).glob('*.pdf'))

    guide = {
        "metadata": {
            "total_files": len(pdf_files),
            "instructions": [
                "1. Open each PDF file in the 'pdfs' directory",
                "2. Look for 'Least Count' field on the first page",
                "3. Look for 'Accuracy' field on the first page",
                "4. Record the exact values in the 'data' section below",
                "5. Identify the parameter type from 'Test Instrument' or 'Group' field",
                "Example: 'Least Count: 0.01 bar' → record as '0.01 bar'",
                "Example: 'Accuracy: +/- 0.1%FS' → record as '+/- 0.1%FS'"
            ],
            "priority_order": "Process highest-count parameters first (Pressure, Temperature, Voltage, etc.)"
        },
        "pdf_extraction_checklist": []
    }

    for pdf_file in pdf_files:
        # Extract asset number from filename
        filename = pdf_file.name
        parts = filename.split()
        asset_no = parts[0] if parts else "UNKNOWN"

        guide["pdf_extraction_checklist"].append({
            "filename": filename,
            "asset_no": asset_no,
            "least_count": "FILL_ME",
            "accuracy": "FILL_ME",
            "test_instrument": "FILL_ME",
            "parameter": "FILL_ME",
            "notes": ""
        })

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(guide, f, indent=2, ensure_ascii=False)

    print(f"Generated extraction guide: {output_path}")
    print(f"Total files to process: {len(pdf_files)}")
    print(f"Sample entries to fill:")
    for entry in guide["pdf_extraction_checklist"][:5]:
        print(f"  - {entry['filename']}")

def load_master_instruments(json_path: str) -> Dict[str, Any]:
    """Load master instruments JSON for reference."""
    with open(json_path, 'r', encoding='utf-8') as f:
        instruments = json.load(f)
    return instruments

def match_asset_to_instrument(asset_no: str, instruments: List[Dict]) -> Dict:
    """Find master instrument by asset number."""
    for inst in instruments:
        if inst.get('asset_no', '').startswith(asset_no):
            return inst
    return None

if __name__ == '__main__':
    project_root = Path(__file__).parent.parent
    pdf_folder = project_root / '..' / 'reference_docs' / 'master_list' / 'MASTER LIST AS PER ASSENT NUMBER 02032026'
    guide_output = project_root / '..' / 'reference_docs' / 'master_list' / 'extraction_guide.json'
    master_json = project_root / '..' / 'reference_docs' / 'master_list' / 'master_list_converted.json'

    pdf_folder = pdf_folder.resolve()
    guide_output = guide_output.resolve()
    master_json = master_json.resolve()

    print(f"Generating extraction guide...")
    print(f"PDF Folder: {pdf_folder}")
    generate_extraction_guide(str(pdf_folder), str(guide_output))

    print(f"\nTo use this guide:")
    print(f"1. Open {guide_output}")
    print(f"2. Fill in 'least_count', 'accuracy', 'test_instrument', and 'parameter' for each PDF")
    print(f"3. Run: python scripts/consolidate_extracted_data.py to process the collected data")
