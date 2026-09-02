#!/usr/bin/env python3
"""
Extract least counts from calibration certificate PDFs.

This script:
1. Reads all PDFs from the MASTER LIST folder
2. Extracts the "Least Count" field and parameter information
3. Matches certificates to master instruments by asset number/model
4. Creates a JSON mapping of instrument → parameter → least count
"""

import json
import re
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
import logging

try:
    import pymupdf
except ImportError:
    print("Installing pymupdf...")
    os.system("pip install pymupdf")
    import pymupdf

try:
    import pytesseract
    from pdf2image import convert_from_path
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("Warning: pytesseract/pdf2image not available - OCR fallback will not work")

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Map parameter group names to canonical parameter values
PARAMETER_MAPPING = {
    # Pressure variants
    'Pressure': 'Pressure',
    'Differential Pressure': 'Differential Pressure',
    'Vacuum': 'Vacuum',
    'Pressure Gauge': 'Pressure',
    'Differential Pressure Gauge': 'Differential Pressure',
    'Pressure Indicating Device': 'Pressure',
    'Absolute Pressure': 'Pressure',
    'Gauge Pressure': 'Pressure',

    # Temperature variants
    'Temperature': 'Temperature',
    'RTD': 'RTD',
    'Thermocouple': 'Thermocouple',
    'Temperature Sensor': 'Temperature',

    # Electrical variants
    'Voltage': 'AC/DC Voltage',
    'AC/DC Voltage': 'AC/DC Voltage',
    'Current': 'AC/DC Current',
    'AC/DC Current': 'AC/DC Current',
    'AC Voltage': 'AC/DC Voltage',
    'DC Voltage': 'AC/DC Voltage',
    'AC Current': 'AC/DC Current',
    'DC Current': 'AC/DC Current',
    'Resistance': 'Resistance',
    'Frequency': 'Frequency',
    'Capacitance': 'Capacitance',
    'Power': 'Power',

    # Flow variants
    'Flow': 'Flow',
    'Flow Rate': 'Flow',

    # Humidity variants
    'Relative Humidity': 'Relative Humidity',
    'Humidity': 'Relative Humidity',

    # Others
    'Dimension': 'Dimension',
    'Particle Count': 'Particle Count',
    'Air Velocity': 'Air Velocity',
    'Speed': 'Speed',
    'Speed (Contact)': 'Speed (Contact)',
    'Speed (Non-Contact)': 'Speed (Non-Contact)',
}


def extract_text_from_pdf(pdf_path: str) -> tuple:
    """
    Extract text from a PDF file using multiple methods.
    Returns (text, method_used) tuple.
    """
    # Method 1: Try PyMuPDF
    try:
        doc = pymupdf.open(pdf_path)
        text = ""
        for page_num, page in enumerate(doc):
            text += page.get_text()
        if text and len(text.strip()) > 100:  # Only return if substantial text found
            return (text, "pymupdf")
    except Exception as e:
        logger.debug(f"PyMuPDF failed on {pdf_path}: {e}")

    # Method 2: Try OCR with Tesseract
    if TESSERACT_AVAILABLE:
        try:
            logger.debug(f"Attempting OCR on {pdf_path}")
            images = convert_from_path(pdf_path, first_page=1, last_page=1)  # First page only
            if images:
                text = pytesseract.image_to_string(images[0])
                if text and len(text.strip()) > 50:
                    return (text, "ocr")
        except Exception as e:
            logger.debug(f"OCR failed on {pdf_path}: {e}")

    return ("", "none")


def extract_least_count(text: str) -> Optional[str]:
    """
    Extract least count from certificate text.
    Looks for patterns like "Least Count : 0.01 bar"
    """
    # Pattern 1: "Least Count : value unit" or "Least Count: value unit"
    pattern1 = r'Least\s+Count\s*:?\s*([+-]?\d+\.?\d*)\s*([a-zA-Z°%/\s]+?)(?=\n|$|[A-Z])'
    match = re.search(pattern1, text)
    if match:
        value = match.group(1)
        unit = match.group(2).strip()
        return f"{value} {unit}"

    # Pattern 2: Look for "0.01 bar" right after "Least Count"
    pattern2 = r'Least\s+Count\s*:?\s*([0-9+/\-.\s]+?(?:bar|%|mV|mm|kg|°C|V|A|Hz|Ω|µF|mA|V\/V|°|rpm|m/s))'
    match = re.search(pattern2, text)
    if match:
        return match.group(1).strip()

    return None


def extract_accuracy(text: str) -> Optional[str]:
    """
    Extract accuracy from certificate text.
    Looks for patterns like "Accuracy : +/- 0.1%FS"
    """
    # Pattern 1: "Accuracy : +/- 0.1%FS" or similar
    pattern1 = r'Accuracy\s*:?\s*([+\-/%0-9.FS°\s]+?)(?=\n|$|[A-Z]\w+\s*:)'
    match = re.search(pattern1, text)
    if match:
        return match.group(1).strip()

    # Pattern 2: Try to get just the numeric and symbol part
    pattern2 = r'Accuracy\s*:?\s*([+/\-0-9.%FDS°]+)'
    match = re.search(pattern2, text)
    if match:
        return match.group(1).strip()

    return None


def extract_test_instrument(text: str) -> Optional[str]:
    """Extract the test instrument name/type from the certificate."""
    # Look for "Test Instrument :" pattern
    pattern = r'Test\s+Instrument\s*:?\s*([^\n]+)'
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()
    return None


def infer_parameter_from_context(text: str, test_instrument: str) -> List[str]:
    """
    Infer parameter type from test instrument name and certificate context.
    Returns list of likely parameter names.
    """
    parameters = []
    text_lower = text.lower()
    test_lower = test_instrument.lower()

    # Infer from test instrument name
    if 'pressure' in test_lower:
        if 'differential' in test_lower:
            parameters.append('Differential Pressure')
        else:
            parameters.append('Pressure')

    if 'temperature' in test_lower or 'thermometer' in test_lower:
        parameters.append('Temperature')

    if 'rtd' in test_lower:
        parameters.append('RTD')

    if 'thermocouple' in test_lower:
        parameters.append('Thermocouple')

    if 'voltage' in test_lower or 'multimeter' in test_lower:
        parameters.append('AC/DC Voltage')

    if 'current' in test_lower:
        parameters.append('AC/DC Current')

    if 'frequency' in test_lower:
        parameters.append('Frequency')

    if 'resistance' in test_lower or 'ohm' in test_lower:
        parameters.append('Resistance')

    if 'capacitance' in test_lower or 'farad' in test_lower:
        parameters.append('Capacitance')

    if 'humidity' in test_lower:
        parameters.append('Relative Humidity')

    if 'flow' in test_lower:
        parameters.append('Flow')

    if 'power' in test_lower:
        parameters.append('Power')

    # If still empty, try to infer from certificate content
    if not parameters:
        if 'kg/cm2' in text or 'bar' in text or 'pressure' in text_lower:
            parameters.append('Pressure')
        elif 'voltage' in text_lower or '°C' in text:
            parameters.append('Temperature')

    return parameters if parameters else ['Unknown']


def extract_model_and_serial(text: str) -> tuple:
    """Extract instrument model and serial number from certificate."""
    model_match = re.search(r'Model\s*:?\s*([^\n]+)', text)
    model = model_match.group(1).strip() if model_match else None

    serial_match = re.search(r'Serial\s+[Nn]o\.?\s*:?\s*([^\n]+)', text)
    serial = serial_match.group(1).strip() if serial_match else None

    return model, serial


def extract_asset_number_from_filename(filename: str) -> Optional[str]:
    """Extract asset number from filename (e.g., '1000 HTAIPL L.pdf' -> '1000')."""
    match = re.match(r'^(\d+)\s+', filename)
    if match:
        return match.group(1)
    return None


def load_master_instruments(json_path: str) -> Dict[str, Any]:
    """Load master instruments JSON and create lookup maps."""
    with open(json_path, 'r', encoding='utf-8') as f:
        instruments = json.load(f)

    # Create lookup maps
    asset_lookup = {}
    model_serial_lookup = {}

    for inst in instruments:
        asset = inst.get('asset_no', '').split()[0]  # Extract numeric part
        if asset:
            if asset not in asset_lookup:
                asset_lookup[asset] = []
            asset_lookup[asset].append(inst)

        model = inst.get('model', '')
        serial = inst.get('serial_no', '')
        if model and serial:
            key = f"{model}_{serial}"
            if key not in model_serial_lookup:
                model_serial_lookup[key] = []
            model_serial_lookup[key].append(inst)

    return {
        'instruments': instruments,
        'asset_lookup': asset_lookup,
        'model_serial_lookup': model_serial_lookup
    }


def match_certificate_to_instrument(
    pdf_filename: str,
    certificate_text: str,
    master_data: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Match a certificate to a master instrument using multiple strategies.
    """
    # Strategy 1: Match by asset number in filename
    asset_num = extract_asset_number_from_filename(pdf_filename)
    if asset_num and asset_num in master_data['asset_lookup']:
        candidates = master_data['asset_lookup'][asset_num]
        if len(candidates) == 1:
            return candidates[0]
        # If multiple, try to narrow down
        logger.warning(
            f"Multiple instruments with asset {asset_num}: {[c['instrument_desc'] for c in candidates]}"
        )

    # Strategy 2: Match by model and serial from certificate
    model, serial = extract_model_and_serial(certificate_text)
    if model and serial:
        key = f"{model}_{serial}"
        if key in master_data['model_serial_lookup']:
            candidates = master_data['model_serial_lookup'][key]
            if len(candidates) == 1:
                return candidates[0]

    return None


def process_pdf_folder(
    folder_path: str,
    master_json_path: str,
    output_json_path: str
) -> None:
    """
    Process all PDFs in a folder and extract least counts.
    """
    logger.info(f"Loading master instruments from {master_json_path}")
    master_data = load_master_instruments(master_json_path)

    least_counts_by_instrument = {}
    warnings = []

    pdf_files = sorted(Path(folder_path).glob('*.pdf'))
    logger.info(f"Found {len(pdf_files)} PDF files")

    extraction_methods = {'pymupdf': 0, 'ocr': 0, 'none': 0}

    for idx, pdf_path in enumerate(pdf_files, 1):
        pdf_filename = pdf_path.name
        logger.info(f"[{idx}/{len(pdf_files)}] Processing {pdf_filename}")

        # Extract text from PDF
        text, method = extract_text_from_pdf(str(pdf_path))
        extraction_methods[method] += 1

        if not text:
            warnings.append(f"Could not extract text from {pdf_filename}")
            continue

        # Extract least count
        least_count = extract_least_count(text)
        if not least_count:
            warnings.append(f"Could not find least count in {pdf_filename}")
            continue

        # Extract test instrument info
        test_instrument = extract_test_instrument(text)

        # Infer parameters
        parameters = infer_parameter_from_context(
            text,
            test_instrument or "Unknown"
        )

        # Match to master instrument
        master_inst = match_certificate_to_instrument(
            pdf_filename,
            text,
            master_data
        )

        if not master_inst:
            warnings.append(
                f"Could not match {pdf_filename} to master instrument. "
                f"Test instrument: {test_instrument}, Parameters: {parameters}"
            )
            continue

        inst_id = master_inst['id']
        inst_desc = master_inst['instrument_desc']

        # Extract accuracy as well
        accuracy = extract_accuracy(text)

        # Store least count and accuracy for each inferred parameter
        if inst_id not in least_counts_by_instrument:
            least_counts_by_instrument[inst_id] = {
                'instrument_desc': inst_desc,
                'asset_no': master_inst.get('asset_no', 'N/A'),
                'parameters': {}
            }

        for param in parameters:
            least_counts_by_instrument[inst_id]['parameters'][param] = {
                'least_count': least_count,
                'accuracy': accuracy or 'Not found'
            }

        logger.info(
            f"  ✓ Matched to instrument #{inst_id}: {inst_desc}"
            f"\n    Parameters: {', '.join(parameters)}"
            f"\n    Least Count: {least_count}"
            f"\n    Accuracy: {accuracy or 'Not found'}"
        )

    # Write output
    logger.info(f"Writing results to {output_json_path}")
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(
            {
                'least_counts': least_counts_by_instrument,
                'summary': {
                    'total_pdfs_processed': len(pdf_files),
                    'instruments_with_least_counts': len(least_counts_by_instrument),
                    'total_parameter_entries': sum(
                        len(inst['parameters'])
                        for inst in least_counts_by_instrument.values()
                    ),
                    'warnings_count': len(warnings),
                    'extraction_methods': extraction_methods
                },
                'warnings': warnings
            },
            f,
            indent=2,
            ensure_ascii=False
        )

    logger.info(f"✓ Output written to {output_json_path}")
    logger.info(f"Summary: {len(least_counts_by_instrument)} instruments, {len(warnings)} warnings")


if __name__ == '__main__':
    # Paths
    project_root = Path(__file__).parent.parent
    pdf_folder = project_root / '..' / 'reference_docs' / 'master_list' / 'MASTER LIST AS PER ASSENT NUMBER 02032026'
    master_json = project_root / '..' / 'reference_docs' / 'master_list' / 'master_list_converted.json'
    output_json = project_root / '..' / 'reference_docs' / 'master_list' / 'least_counts_by_instrument.json'

    # Normalize paths
    pdf_folder = pdf_folder.resolve()
    master_json = master_json.resolve()
    output_json = output_json.resolve()

    logger.info(f"PDF Folder: {pdf_folder}")
    logger.info(f"Master JSON: {master_json}")
    logger.info(f"Output JSON: {output_json}")

    if not pdf_folder.exists():
        logger.error(f"PDF folder not found: {pdf_folder}")
        exit(1)

    if not master_json.exists():
        logger.error(f"Master JSON not found: {master_json}")
        exit(1)

    process_pdf_folder(str(pdf_folder), str(master_json), str(output_json))
