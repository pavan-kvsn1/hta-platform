# E2E Lifecycle Tests (P3-5) — Required Fixes Before They Pass

> **Priority:** High (blocks P3-5 sign-off)
> **Discovered:** 2026-05-04 (during P3-5 implementation)
> **Status:** Spec written, needs form interaction rework
> **File:** `apps/web-hta/e2e/journeys/full-lifecycle.spec.ts`

## Problem

The lifecycle spec was written with minimal form filling (customer name + address only). The actual certificate submit endpoint (`POST /api/certificates/:id/submit`) validates **6 required fields** plus signature. The tests will fail at Step 1 of every flow.

## API Validation Requirements (certificates/index.ts:1017-1068)

The submit endpoint requires in the **request body**:
- `signatureData` (string) — engineer's signature
- `signerName` (string) — must match profile name exactly
- `reviewerId` (string) — if not already set on the certificate

And validates these **database fields** are populated:
- `dateOfCalibration` — must be set
- `customerName` — must be set
- `uucDescription` — must be set
- `masterInstruments.length > 0` — at least one linked master instrument
- `ambientTemperature` — must be set

## What the Test Currently Does vs What It Needs

| Section | Current | Required |
|---------|---------|----------|
| Summary | Fills customerName + address | + SRF number, SRF date, date of calibration, calibratedAt (LAB radio), reviewer selection |
| UUC | Skipped | Description, make, model, serial number, instrument ID, add parameter (type + unit + range) |
| Master Instruments | Skipped | Cascading selects: Category > Description > Instrument. Then assign parameter + SOP ref |
| Environment | Skipped | Ambient temperature (24), relative humidity (53) |
| Results | Skipped | At least 1 calibration point per parameter (standard reading + UUC reading) |
| Remarks | Skipped | Select calibration status checkbox |
| Conclusion | Skipped | Add at least one conclusion statement |
| Submit | Clicks submit button | Signature canvas drawing + signer name confirmation |

## Reference Data (from HTA-00001-24-04 PDF)

```
Customer:       Test Company Pvt Ltd, 123 Test Street, Bangalore
UUC:            Description: "Test UUC", Make: "Test Make", Model: "Test Model", SN: "Test SN No"
Environment:    24 degC, 53 %RH
Procedure:      HTA Cal Procedure NLAB/CAL/TL2/R01
Parameter:      TEMPERATURE, range -100 to 100 degC
Master Instr:   Digital RTD Thermometer with sensor, Delta Ohm, HD 2307.0
Calibrated by:  KIRAN KUMAR (engineer)
Checked by:     RAJESH SHARMA (reviewer)
Approved by:    HEMANTH KUMAR (admin)
Customer sign:  TEST CUSTOMER (customer@example.com)

Calibration points (8):
  Std Reading -> UUC Reading -> Error -> Status
  -45.11      -> -43.22      -> -1.89 -> Pass
  -18.79      -> -20.12      ->  1.33 -> Pass
   14.67      ->  15.07      -> -0.40 -> Pass
   47.29      ->  49.71      -> -2.42 -> Pass
  -32.56      -> -34.12      ->  1.56 -> Pass
   29.57      ->  31.02      -> -1.45 -> Pass
   -5.92      ->  -4.23      -> -1.69 -> Pass
    4.25      ->   4.28      -> -0.03 -> Pass
```

## UI Selector Reference (from form component analysis)

### Section Navigation
Sections are tabs with IDs: `summary`, `uuc-details`, `master-inst`, `environment`, `results`, `remarks`, `conclusion`, `submit`
- Click via: `page.locator('button').filter({ hasText: 'Summary' })` or by section label

### Key Form Fields

**Summary (SummarySection.tsx):**
- Customer name: `page.getByPlaceholder('Start typing customer name...')`
- Customer address: `page.getByPlaceholder('Enter customer address')`
- SRF number: `page.getByPlaceholder('Enter SRF Number')`
- SRF date: DatePicker with placeholder "Select SRF date"
- Date of calibration: DatePicker with placeholder "Select calibration date"
- Calibrated at: `page.locator('input[value="LAB"]')` (radio button)
- Reviewer: `page.getByRole('combobox')` (custom dropdown, placeholder "Select a reviewer...")
  - Opens dropdown, click reviewer by name: `page.locator('button').filter({ hasText: 'Rajesh Sharma' })`

**UUC (UUCSection.tsx):**
- Description: `page.getByPlaceholder('e.g., Temp/Humidity Sensor')`
- Make: `page.getByPlaceholder('e.g., Dwyer')`
- Model: `page.getByPlaceholder('e.g., RHP-2011')`
- Serial number: `page.getByPlaceholder('e.g., 0010')`
- Instrument ID: `page.getByPlaceholder('e.g., VRSF/ENG/HVC020-TRH')`
- Parameter type: Radix Select with placeholder "Select parameter type..."
- Parameter unit: Radix Select with placeholder "Select unit..."
- Range min/max: inputs with placeholder "Min" / "Max"

**Master Instruments (MasterInstrumentSection.tsx):**
- Category: Radix Select, placeholder "Select category..."
- Parameter group: Radix Select, placeholder "All parameter groups"
- Description: Radix Select, placeholder "Select description..."
- Make: Radix Select, placeholder "All makes"
- Instrument: Radix Select, placeholder "Select instrument..."
- SOP reference: input with placeholder "e.g., NLAB/CAL/T01/R01"

Seeded categories: Electro-Technical, Thermal, Mechanical, Others, Source (209 instruments total)
For temperature calibration use: Category="Thermal", Parameter Group="Temperature"

**Environment (EnvironmentalSection.tsx):**
- Temperature: `page.getByLabel('Ambient Temperature')` or input with step="0.1"
- Humidity: `page.getByLabel('Relative Humidity')` or input with step="0.1"

**Results (ResultsSection.tsx):**
- Points count: Radix Select (1-20)
- Standard reading: number input per row
- UUC reading: number input per row
- Error formula: Radix Select ("A-B" or "B-A")

**Submit (FinalizeSection.tsx):**
- Submit button: `page.getByRole('button', { name: /submit for peer review/i })`
- Signature modal opens with canvas + signer name
- Canvas: `page.locator('canvas')`
- Confirm: button with text "Confirm" / "Submit"

### Radix Select Interaction Pattern
```typescript
// Click trigger to open
await page.locator('[data-slot="select-trigger"]').filter({ hasText: 'Select category...' }).click()
// Click option
await page.locator('[data-slot="select-item"]').filter({ hasText: 'Thermal' }).click()
```

## CUSTOMER_REVISION_REQUIRED Flow Issue

The API submit endpoint (line 1046) only allows resubmission from `DRAFT` or `REVISION_REQUIRED`:
```typescript
if (certificate.status !== 'DRAFT' && certificate.status !== 'REVISION_REQUIRED') {
  return reply.status(400).send(...)
}
```

When a customer requests revision, the status becomes `CUSTOMER_REVISION_REQUIRED`. Need to investigate:
- Does the UI use a different endpoint for this status?
- Does it first transition to REVISION_REQUIRED via an admin/backend action?
- P3-5c Step 4 ("Engineer views customer feedback, edits, resubmits") may need to account for this

## Reviewer Role Clarification

There is **no REVIEWER role** in the database. The role enum is just ENGINEER and ADMIN. Reviewing is assignment-based:
- `canReviewCertificate()` checks: admin can review any cert, engineers can review certs where `reviewerId === user.id`
- `rajesh@htaipl.com` is seeded as ENGINEER (correct)
- The "reviewer" in test terminology just means the engineer assigned as reviewer on a certificate

## Action Items

1. [ ] Update `test-data.ts` — add `TEST_CERTIFICATE_FULL` with all fields from reference PDF
2. [ ] Rewrite `engineerCreateAndSubmit()` in lifecycle spec to fill all 8 sections
3. [ ] Investigate CUSTOMER_REVISION_REQUIRED resubmit flow (check if there's a separate endpoint or intermediate status change)
4. [ ] Test the Radix Select interaction pattern works in Playwright (may need `force: true` or `waitFor` between cascading selects)
5. [ ] Verify master instrument cascading selects work with seeded data (Category: Thermal > Param Group: Temperature > pick instrument)
6. [ ] Handle DatePicker interaction (likely a calendar popup — need to figure out the click sequence)
