# Master Specification Integration Scope & Audit

**Document**: Architecture & Impact Analysis  
**Created**: 2026-09-02  
**Scope**: Integration of new `master_instrment_registry.json` into certificate editing UI

---

## Overview

The `master_instrment_registry.json` (49,960 lines) provides comprehensive master instrument capabilities with:
- **204 composite/simple assets** with normalized metadata
- **Hierarchical capability profiles** per parameter with range buckets
- **Parsed least counts & accuracy** values (type, value, unit, polarity)
- **Thermocouple subtypes** (Type K, J, T, E, N, R, S, B, L, U)
- **RTD curves** (Pt-100, Pt-46, Pt-200, Cu-53, Ni-100, Ni-120)
- **Structured capabilities** with range-dependent accuracy

This requires **3 major UI overhauls** + **4 supporting changes**:

---

## 1. Master Instrument Selection UI Redesign

### Current State
- **File**: `MasterInstrumentSection.tsx` (~600 lines)
- **Cascading dropdowns**: Category → Parameter Group → Description → Make → Selection
- **Issues**:
  - Old data model (no capability profiles)
  - `parameter_group` field doesn't map to new registry
  - No least count/accuracy display
  - No filtering based on UUC specs

### Required Changes

#### 1.1 Data Model Migration
**Impact**: `lib/master-instruments.ts`, `lib/stores/master-instrument-store.ts`

- [ ] Migrate from old master-instruments.json → new registry format
  - **From**: `{id, type, instrument_desc, make, model, asset_no, parameter_group, capabilities[]}`
  - **To**: Capability profiles with buckets: `{id, asset_type, components[], assets[]}`
- [ ] Create new TypeScript interfaces:
  ```typescript
  interface CapabilityProfile {
    id: string
    parameter: string
    role: 'source' | 'measuring'
    unit: string
    min: number
    max: number
    buckets: BucketData[]
    subtype?: string  // e.g., "Type K", "Pt-100"
    dims?: string[]   // e.g., channel numbers
  }
  
  interface BucketData {
    id: string
    min: number
    max: number
    least_count: {value: number, unit: string}
    accuracy: {type: string, value: number, unit: string, polarity: string}
  }
  
  interface MasterInstrumentRegistry {
    asset_no_normalized: string
    asset_type: 'simple' | 'composite'
    instrument_desc: string
    make: string
    model: string
    serial_no: string
    category: string
    capability_profiles: CapabilityProfile[]
  }
  ```

#### 1.2 Selection UI - Phase 1: Basic Display
**Impact**: `MasterInstrumentSection.tsx`, `MasterInstrumentsTable.tsx`

**See detailed wireframe**: `docs/wireframes/master-selection-ui.md`

**UI Components**:

1. **UUC Parameters Reference** (Collapsible Summary)
   - Shows current UUC parameter requirements
   - Filter criteria and eligibility stats
   - Collapsed by default to save space

2. **Filter Bar**
   - Category, Usage, Status dropdowns
   - Search by asset # or model name
   - [Clear Filters] button

3. **Eligible Masters List** (Card View)
   - Asset number, description, serial
   - Parameter coverage indicators (✓/✗)
   - Status badge + due date
   - Showing "X of Y eligible" count

4. **Selected Master Details Panel**
   - Basic info (make, model, serial, asset #, category, location)
   - Expandable capability profiles
   - Range buckets with least count/accuracy
   - Thermocouple/RTD subtype selector
   - [Remove Master] / [Add Another Master] buttons

**Changes**:
- [ ] **Remove** cascading parameter group filter (doesn't exist in new data)
- [ ] **Update** parameter capability display to use new hierarchical structure
- [ ] Show thermocouple subtypes if multiple exist for an instrument
- [ ] Show RTD curve info (Pt-100 vs Cu-53, etc.)
- [ ] Display least count & accuracy for each parameter+bucket
- [ ] Show range limits (min/max inclusive flags)

#### 1.3 Selection UI - Phase 2: UUC-Based Pre-filtering
**Impact**: `MasterInstrumentSection.tsx`

**Logic**:
```
For each UUC Parameter (parameterName, parameterUnit, rangeMin, rangeMax, accuracy):
  Filter Master Instruments where:
    1. Has capability_profile.parameter == UUC.parameterName
    2. instrument.capability_profile[param].min <= UUC.rangeMin
    3. instrument.capability_profile[param].max >= UUC.rangeMax
    4. instrument.capability_profile[param].accuracy >= UUC.accuracy
       (at the specific UUC range bucket)
```

**Implementation**:
- [ ] Create filter function: `getEligibleMasters(uucParameter: Parameter): MasterInstrument[]`
- [ ] Show filtered count badge: "3 of 45 eligible for Temperature"
- [ ] Add filter explanation tooltip: "Master must cover range X–Y with ≤±0.5°C"
- [ ] Gray out ineligible instruments with reason
- [ ] Update UI hint when parameter selection invalid: "No master covers this range"

---

## 2. Admin Instruments Page Overhaul

### Current State
- **File**: `app/admin/instruments/[id]/page.tsx` (~500 lines)
- **Displays**: Old `Instrument` interface with flat `rangeData[]` & `parameterCapabilities[]`
- **Issues**:
  - No capability profiles structure
  - No bucket-level accuracy/least count
  - No subtype (thermocouple/RTD) display
  - PDF upload broken (not showing on UI)

### Required Changes

#### 2.1 Data Model Migration
**Impact**: Backend API contracts, `Instrument` interface, DB schema (major)

- [ ] Update `Instrument` database schema to store new registry structure
  - **Old**: `{rangeData: RangeDataItem[], parameterCapabilities: string[], parameterRoles: string[]}`
  - **New**: `{capability_profiles: CapabilityProfile[], asset_type: string, components: []}`
  
- [ ] Create API endpoint: `GET /api/admin/instruments/:id/registry-view`
  - Returns instrument data in new registry format
  - Includes all capability profiles + buckets
  
- [ ] **Decision needed**: Backfill existing instruments from registry JSON?
  - Impact: One-time migration or continuous sync?
  - Recommendation: Continuous sync from registry source of truth

#### 2.2 Detail View Redesign
**Impact**: Entire admin instruments view page

**See detailed wireframe**: `docs/wireframes/admin-instrument-edit-final-fixed.md`

**Page Structure** (6 tabs with FIXED information banner):

1. **Fixed Banner** (4×2 grid - consistent across all tabs)
   - Asset #, Status, Category, Calibrated At, Next Due, Last Updated, Model, Serial
   - Serves as stable orientation/compass while viewing different tabs

2. **Basic Info Tab** (unchanged)
   - Asset number, category, description, make, model, serial
   - Composite field indicators (Indicator/Sensor sub-components if applicable)
   - Operational details (usage, calibration location)
   - Calibration tracking (report #, dates)

3. **Capabilities Tab** (replaces flat "Range Data")
   - Expandable capability profiles with parameter/role/unit/range summary
   - Hierarchical range buckets showing least count & accuracy
   - Inline editing for bucket values
   - Support for thermocouple/RTD subtypes with subtype selection
   - [+ Add Profile] button for adding new capabilities

4. **Certificates Tab** (with Active/Archived split)
   - **Active Certificates**: Current valid calibrations with ✓ indicator
   - **Archived Certificates**: Expired/superseded with ✗ indicator, [Restore] option
   - File upload area (drag-and-drop)
   - Quick metadata display (Uploaded date, size, pages)

5. **PDF Viewer Mode**
   - Full PDF display with page navigation
   - Control bar shows status: `✓ ACTIVE │ filename.pdf` or `✗ ARCHIVED │ filename.pdf`
   - [Back to Details] button to return to Certificates tab
   - Same fixed banner at top for orientation

6. **Metadata Tab**
   - Data source & origin (registry, created date, version)
   - Lifecycle tracking and change history
   - SOP reference mappings

7. **Audit Log Tab**
   - Chronological event log with filters
   - Action type, timestamp, user, details
   - [Revert] options for past changes

#### 2.3 Certificate Management Features
**Active vs Archived Display**:
- [ ] Backend API returns certificate metadata including validation status
- [ ] Frontend displays with status indicator (✓ ACTIVE / ✗ ARCHIVED)
- [ ] Archive logic: Certificates become archived when:
  - Manually marked as archived by user
  - New valid certificate replaces them
  - Calibration date passes expiration
  
**PDF Upload Bug Fix**:
**Current Issue**: Uploaded PDFs not visible on UI

**Investigation needed**:
- [ ] Check file upload endpoint: `POST /api/instruments/:id/certificates`
  - Verify success response
  - Check file storage location
  - Verify database record creation
  
- [ ] Check PDF retrieval endpoint: `GET /api/instruments/:id/certificates`
  - Verify records returned from DB with status field
  - Verify file existence on disk
  
- [ ] Check UI rendering logic: Certificates tab component
  - Verify data binding to certificate list with active/archived filter
  - Check status field filtering logic
  - Verify PDF component loads correctly from storage
  
- [ ] Check permissions/auth
  - Does user have read access to uploaded files?
  - Are files in correct storage bucket?

**Likely causes**:
1. API not returning uploaded records
2. File path incorrect in database
3. Status field missing (active/archived distinction)
4. UI filter hiding certificates unintentionally
5. Missing image/PDF display component

---

## 3. UUC Details Section Enhancements

### Current State
- **File**: `UUCSection.tsx` (~800 lines)
- **Serial Number**: Required field
- **Instrument ID**: Required field
- **Operating Range**: Required fields (min/max)

**See wireframe**: `docs/wireframes/uuc-admin-enhancements.md` (UUC Section section)

### Required Changes

#### 3.1 "Not Applicable" Support
**Impact**: `UUCSection.tsx`, certificate store, validation logic

**UI Design**:
- Add "Not Applicable" checkbox below each field (not replacing input)
- When checked: input disabled, show "N/A" label
- When unchecked: input enabled, clear "N/A" label
- Checkbox positioned inside field border for compact layout

**Fields with "N/A" support**:
- `uucSerialNumber` (Serial #)
- `uucInstrumentId` (Instrument ID)
- `operatingRange` (Min/Max bounds)

**Implementation**:
```typescript
// In certificate store:
uucSerialNumber: string
uucSerialNumberNotApplicable: boolean
uucInstrumentId: string
uucInstrumentIdNotApplicable: boolean
operatingMin: number | null
operatingMax: number | null
operatingRangeNotApplicable: boolean

// Validation:
isUUCValid = () => {
  return uucDescription && uucMake && uucModel &&
    ((uucSerialNumber) || uucSerialNumberNotApplicable) &&
    ((uucInstrumentId) || uucInstrumentIdNotApplicable) &&
    ((!operatingRangeNotApplicable && operatingMin && operatingMax) || operatingRangeNotApplicable)
}
```

#### 3.2 Operating Range "Not Applicable" + Constraint
**Impact**: `UUCSection.tsx`, `ResultsSection.tsx`, validation

**See wireframe**: `docs/wireframes/uuc-admin-enhancements.md` (Results Section section)

**Requirement**: If operating range is "Not Applicable":
- At least ONE calibration data point must be within the actual measurement range
- This is validated in Section 05 (Results table)

**UI Design**:
- Operating Range fields show "Not Applicable ⚠️" when checkbox is checked
- Informational hint below: "Constraint: At least ONE data point must be within measurement range [X–Y bar]"
- In Results table: Show status check ✓ or ✗ for each data point
- Validation summary: "At least 1 point [25.0] is in range 0–100 bar" when valid
- Error message when NO points in range: "Currently: ZERO points in range"

**Implementation**:

1. **UUC Section**:
   ```typescript
   operatingMin: number | null
   operatingMax: number | null
   operatingRangeNotApplicable: boolean
   ```

2. **Parameter Validation**:
   ```typescript
   isParameterValid = (param: Parameter) => {
     if (param.operatingRangeNotApplicable) {
       // Must have at least 1 data point in [parameterMin, parameterMax]
       return param.results.some(r => 
         r.standardReading >= param.rangeMin &&
         r.standardReading <= param.rangeMax
       )
     }
     // Otherwise: must have at least 1 point in [operatingMin, operatingMax]
     return param.results.some(r =>
       r.standardReading >= param.operatingMin &&
       r.standardReading <= param.operatingMax
     )
   }
   ```

3. **Section 05 Results Table**:
   - Show hint: "At least one point must be in [X–Y] range"
   - Flag rows with status indicator: ✓ in range / ✗ OUT OF RANGE
   - Validation passes only if constraint met
   - Show fix suggestions if validation fails

---

## 4. Section 05 — Dynamic Field Declarations Revamp

### Current State
- **File**: `ResultsSection.tsx` (~800 lines)
- **Current structure**: Fixed 3-column layout (Master Reading, UUC Before, UUC After)
- **Issues**:
  - Rigid table structure doesn't support real certificate requirements
  - No support for multiple fields per instrument
  - No support for mixed field types (numeric/expression/text)
  - No custom table naming per parameter
  - Error computation hardcoded to one Master + one UUC field

**See detailed spec**: `docs/todos/section05-dynamic-fields-revamp.md`

### Required Changes
**Impact**: `ResultsSection.tsx`, `certificate-store.ts`, certificate PDF generation

#### 4.1 Data Model Migration
```typescript
interface FieldDefinition {
  id: string
  name: string                              // e.g. "Standard Meter Reading (Y)"
  group: 'master' | 'uuc'
  type: 'numeric' | 'expression' | 'text'
  unit: string
  expression?: string                       // Formula if type=expression
  order: number
}

interface ErrorConfig {
  masterFieldId: string
  uucFieldId: string
  formula: 'A-B' | 'B-A'
  unit: string
}

interface Parameter {
  // ...existing fields...
  tableName: string                         // Custom table heading
  fieldDefinitions: FieldDefinition[]       // Dynamic column schema
  errorConfig: ErrorConfig
  results: CalibrationResultRow[]
}

interface CalibrationResultRow {
  id: string
  pointNumber: number
  values: Record<string, string>    // fieldId → value
  errorObserved: number | null
  isOutOfLimit: boolean
}
```

#### 4.2 Column Setup UI
**UI Components**:
- **Table Name**: Text input for custom certificate table heading
- **Master Fields Section**: List of master instrument fields with [+ Add Master Field]
- **UUC Fields Section**: List of UUC fields with [+ Add UUC Field]
- **Error Computation Section**:
  - Field A dropdown (Master numeric fields only)
  - Field B dropdown (UUC numeric fields only)
  - Formula selector: [A − B] or [B − A]
  - Error unit selector
- **Collapsed Summary**: One-line overview when not editing

**Behavior**:
- [ ] Default state: Pre-populate with one Master numeric and one UUC numeric field
- [ ] Adding field: Append new field definition with empty name
- [ ] Removing field: Clear if referenced in errorConfig, show warning
- [ ] Expression fields: Show formula input, computed read-only in table
- [ ] Numeric fields: Show precision enforcement based on least count
- [ ] Text fields: Plain text input

#### 4.3 Results Table Rendering
**Grouped Headers**:
- Master Instrument fields grouped under "Master Instrument" header
- UUC fields grouped under "UUC" header
- Sub-headers: Field name row, then unit row

**Column Display**:
- Fixed: Sl. No (first), Trail No (if applicable), Error Observed (last)
- Dynamic: Master fields, then UUC fields (based on fieldDefinitions order)
- Numeric cells: Number input with least count precision
- Text cells: Text input
- Expression cells: Read-only computed values

**Validation**:
- Error computed as: `formula === 'A-B' ? valueA - valueB : valueB - valueA`
- Compare error against accuracy limits
- Mark rows as ✓ in limit or ✗ out of limit

#### 4.4 Backward Compatibility
- Map old `standardReading` → Master numeric field
- Map old `beforeAdjustment` → UUC numeric field
- Map old `afterAdjustment` → second UUC numeric field (if present)
- Migration on form load via `mapApiToForm` function

#### 4.5 Certificate PDF Generation
- Use `tableName` field as table heading in PDF
- Render columns based on `fieldDefinitions` order
- Compute expressions for expression-type fields
- Apply error formula and display error column

---

## 5. Parameter Types & Units Expansion (Database-Backed, Pre-Seeded)

### Current State
- **File**: `UUCSection.tsx` (lines 20–136)
- **Hardcoded**: 22 parameter types with ~60 total units
- **Issue**: Different labs use different nomenclature for the same units/parameters

**See wireframe**: `docs/wireframes/uuc-admin-enhancements.md` (Parameter Type Expansion section)

### Approach: Phase 1 (Simplified)
**Goal**: Ship parameter database support with all parameters pre-seeded from master registry. Workflow for custom parameters deferred to Phase 2.

**Constraint**: Initially, labs can **customize names** but cannot **add new parameters** (those must come from master registry).

### Required Changes
**Impact**: Database schema, API endpoints, `UUCSection.tsx`, parameter management UI

#### 5.1 Database Schema
**New Tables**:

```sql
-- Standard parameter definitions (source of truth from master registry)
CREATE TABLE CalibrationParameterStandards (
  id UUID PRIMARY KEY,
  standardName VARCHAR(255) UNIQUE NOT NULL,  -- "RTD", "Thermocouple", "Pressure"
  category VARCHAR(100),                      -- "Temperature", "Pressure", "Electrical", etc.
  units VARCHAR(255)[],                       -- ["°C", "°F", "K", "Ω"]
  defaultUnit VARCHAR(50),
  subtypes VARCHAR(255)[] NULL,               -- ["Pt-100", "Pt-46", ...] or ["Type K", "Type J", ...]
  
  -- Governance tracking
  source VARCHAR(100),              -- "seed:master_registry_v1.0"
  seedVersion VARCHAR(50),          -- Track which seed script version
  
  createdAt TIMESTAMP DEFAULT NOW(),
  INDEX(standardName)
);

-- Organization-specific parameter customization
CREATE TABLE CalibrationParameters (
  id UUID PRIMARY KEY,
  organizationId UUID NOT NULL REFERENCES Organizations(id),
  standardParameterId UUID NOT NULL REFERENCES CalibrationParameterStandards(id),
  
  -- Lab's custom name/label for this parameter
  customName VARCHAR(255) NOT NULL,           -- "Platinum RTD", "Temp Ref", "Type K TC"
  
  -- Lab may customize units if needed (optional override)
  units VARCHAR(255)[] NULL,                  -- Override defaults if needed
  defaultUnit VARCHAR(50) NULL,
  
  -- Lab may customize subtypes (optional override)
  subtypes VARCHAR(255)[] NULL,
  
  active BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(organizationId, standardParameterId),
  INDEX(organizationId, active)
);
```

#### 5.2 Seed Script
**File**: `scripts/seed-calibration-parameters.ts`

```typescript
// Extract all 41 parameters from master registry and create standards

import { masterInstrumentRegistry } from '../reference_docs/master_list/master_instrment_registry.json'

const STANDARD_PARAMETERS = extractFromMasterRegistry(masterInstrumentRegistry)
// Result: ~41 parameters (RTD, Thermocouple, Pressure, Temperature, etc.)
// Each with: standardName, units, subtypes, category

async function seedCalibrationParameterStandards(db: Database) {
  for (const param of STANDARD_PARAMETERS) {
    await db.CalibrationParameterStandards.upsert({
      standardName: param.standardName,
      category: param.category,
      units: param.units,
      defaultUnit: param.defaultUnit,
      subtypes: param.subtypes,
      source: 'seed:master_registry_v1.0',
      seedVersion: '1.0'
    })
  }
}

async function seedOrgParameters(db: Database, organizationId: string) {
  // On first org login, auto-create CalibrationParameters
  // where customName = standardName (no custom names yet)
  
  const standards = await db.CalibrationParameterStandards.findAll()
  
  for (const standard of standards) {
    await db.CalibrationParameters.create({
      organizationId,
      standardParameterId: standard.id,
      customName: standard.standardName,  // Default: same as standard
      active: true
    })
  }
}
```

**When to run**:
- [ ] Run once: First deployment (seeds standards)
- [ ] Run per-org: First time org logs in (seeds org params)
- [ ] Run on update: When master registry changes (update standards)

#### 5.3 API Endpoints
**Backend** (`/api/calibration-parameters`):

```typescript
// GET /api/calibration-parameters
// Returns org-specific parameter list with custom names
Response: {
  parameters: {
    id: string
    standardName: string          // "RTD" (used internally)
    customName: string            // "Platinum RTD" (shown to user)
    units: string[]
    defaultUnit: string
    subtypes?: string[]
    category: string
  }[]
}

// PUT /api/admin/calibration-parameters/:id
// Customize parameter name/units for this org ONLY
Request: {
  customName?: string
  units?: string[]
  defaultUnit?: string
  active?: boolean
}
Response: { parameter: CalibrationParameter }

// (NO POST endpoint - can't add new parameters yet)
```

#### 5.4 Frontend Implementation

**Data Model**:
```typescript
interface CalibrationParameterStandard {
  id: string
  standardName: string    // "RTD"
  category: string
  units: string[]
  defaultUnit: string
  subtypes?: string[]
}

interface CalibrationParameter {
  id: string
  standardName: string    // "RTD" (from standard)
  customName: string      // "Platinum RTD" (what user sees)
  units: string[]
  defaultUnit: string
  subtypes?: string[]
  category: string
}
```

**Data Loading**:
- [ ] `lib/stores/parameter-store.ts` - NEW
  ```typescript
  export const useParameterStore = () => {
    const [parameters, setParameters] = useState<CalibrationParameter[]>([])
    const [loading, setLoading] = useState(true)
    
    useEffect(() => {
      // Fetch org-specific parameters from DB
      api.get('/calibration-parameters').then(setParameters)
      setLoading(false)
    }, [])
    
    return { parameters, loading }
  }
  ```

**UI Changes** (`UUCSection.tsx`):
- [ ] Remove hardcoded `PARAMETER_REGISTRY` config
- [ ] Call `useParameterStore()` to load org-specific parameters
- [ ] Display hierarchical dropdown using **customName** (e.g., "Platinum RTD")
- [ ] Store **standardName** internally in form (e.g., "RTD")
- [ ] When matching with master instruments, use standardName to filter
- [ ] Add subtype selection dropdown for parameters with subtypes
- [ ] Update parameter validation to require subtype when applicable

**Mapping Layer** (`lib/parameter-mapping.ts`):
```typescript
export function mapCustomToStandardName(customName: string, parameters: CalibrationParameter[]): string {
  return parameters.find(p => p.customName === customName)?.standardName || customName
}

export function mapStandardToCustomName(standardName: string, parameters: CalibrationParameter[]): string {
  return parameters.find(p => p.standardName === standardName)?.customName || standardName
}
```

**Master Filtering Integration**:
- When pre-filtering masters, convert UUC parameter name to standard:
  ```typescript
  const standardParamName = mapCustomToStandardName(uucParam.name, parameters)
  const eligibleMasters = filterByCapability(standardParamName, range, accuracy)
  ```

#### 5.5 Admin Management UI (Phase 1)
**NEW page**: `/admin/calibration-parameters`

- [ ] List all 41 standard parameters
- [ ] For each, show:
  - Standard name: "RTD"
  - Our custom name: "Platinum RTD" (with [Edit] button)
  - Units (showing defaults)
  - Category
  - Active/Inactive toggle

- [ ] Edit Modal (Customize Names Only):
  ```
  Parameter: RTD
  Custom Name: [Platinum RTD        ]
  Category: Temperature (read-only)
  Units: °C, °F, K, Ω (read-only, for now)
  Active: ☑ Yes
  
  [Cancel] [Save]
  ```

**Note**: Cannot add new parameters yet (deferred to Phase 2)

#### 5.6 Future: Custom Parameters Workflow (Phase 2 - TBD)
```
Later (not in scope now):
  - Allow labs to request/add new parameters
  - Approval workflow (TBD)
  - Custom parameter validation
  - Integration with master registry updates
```

#### 5.7 Backward Compatibility
- [ ] Seed CalibrationParameterStandards with all 41 parameters from master registry
- [ ] On first org login, auto-create CalibrationParameters with customName = standardName
- [ ] Existing certificates store parameter by name (not ID) - no migration needed
- [ ] Parameter matching works: stored name → custom name (if overridden)

---

## 6. Section 01 - Calibration Due Date Format Selection

### Current State
- **File**: `SummarySection.tsx`
- **Date Field**: `calibrationDueDate` (input type="date")
- **PDF Output**: Fixed format (need to verify)

**See wireframe**: `docs/wireframes/uuc-admin-enhancements.md` (Date Format Selection section)

### Required Changes
**Impact**: `SummarySection.tsx`, certificate PDF generation template

**UI Design**:
- Date input field (HTML date picker)
- Below: "PDF Format (how it appears on certificate)" label
- Radio button options for 7 common formats
- Live preview showing selected format: "Preview: 02 September 2026"
- Informational text explaining regional preferences

**Requirement**: Users can select which date format appears on the output PDF

**Format options** (common in certificates):
- `DD/MM/YYYY` (e.g., "02/09/2026")
- `DD-MM-YYYY` (e.g., "02-09-2026")
- `MM/DD/YYYY` (e.g., "09/02/2026")
- `DD MonthName YYYY` (e.g., "02 September 2026")
- `MonthName DD, YYYY` (e.g., "September 02, 2026")
- ISO 8601 `YYYY-MM-DD` (e.g., "2026-09-02")
- Month-Year only `MM/YYYY` (e.g., "09/2026")

**Implementation**:

- [ ] Add field to `CertificateFormData`:
  ```typescript
  calibrationDueDateFormat: 
    'DD/MM/YYYY' | 'DD-MM-YYYY' | 'MM/DD/YYYY' | 
    'DD MonthName YYYY' | 'MonthName DD, YYYY' | 
    'YYYY-MM-DD' | 'MM/YYYY'
  ```

- [ ] In `SummarySection.tsx`:
  - Add dropdown for date format selection below the date input
  - Show live preview: "Preview: 02 September 2026"
  - Set default based on lab location/customer preference

- [ ] In PDF generation:
  - Read `calibrationDueDateFormat` from form data
  - Apply selected format when writing to PDF
  - Utility function: `formatDateForCertificate(date: Date, format: string): string`

---

## 7. Supporting Changes

### 7.1 Certificate Store Updates
**File**: `lib/stores/certificate-store.ts`

Add new fields:
```typescript
// UUC enhancements
uucSerialNumberNotApplicable?: boolean
uucInstrumentIdNotApplicable?: boolean
operatingRangeNotApplicable?: boolean

// Parameter type support
parameterSubtype?: string  // e.g., "Type K", "Pt-100"

// Date format
calibrationDueDateFormat?: string

// Master spec integration
capability_profiles?: CapabilityProfile[]  // For display

// Section 05 dynamic fields
Parameter: {
  tableName?: string
  fieldDefinitions?: FieldDefinition[]
  errorConfig?: ErrorConfig
  results?: CalibrationResultRow[]  // Replaces old CalibrationResult[]
}
```

### 7.2 Validation Schema Updates
**File**: Wherever validation happens (Zod schema, custom validators)

Update `Parameter` validation:
```typescript
const ParameterSchema = z.object({
  parameterName: z.string().min(1),
  parameterUnit: z.string().min(1),
  rangeMin: z.coerce.number(),
  rangeMax: z.coerce.number(),
  operatingMin: z.coerce.number().optional(),
  operatingMax: z.coerce.number().optional(),
  operatingRangeNotApplicable: z.boolean().default(false),
  
  // NEW: Dynamic field declarations
  tableName: z.string().optional(),
  fieldDefinitions: z.array(FieldDefinitionSchema),
  errorConfig: ErrorConfigSchema,
  results: z.array(CalibrationResultRowSchema)
    .refine(results => {
      // Validate at least one point in range if operatingRangeNotApplicable
    })
})
```

### 7.3 Master Instrument Store Migration
**File**: `lib/stores/master-instrument-store.ts`

- [ ] Update `loadInstruments()` to fetch from new registry JSON
- [ ] Parse new structure into capability profiles
- [ ] Cache locally with timestamp
- [ ] Add filtering function: `filterByCapability(param, range, accuracy)`

---

## Wireframe References

This scope document is supported by three detailed wireframe documents that show the complete UI design:

### 1. **Master Selection UI** (`docs/wireframes/master-selection-ui.md`)
**Scope**: Master instrument selection during certificate creation
**Covers**:
- UUC Parameters Reference (collapsible summary)
- Filter bar (Category, Usage, Status, Search)
- Eligible Masters List (card view showing parameter coverage)
- Selected Master Details Panel with hierarchical capability profiles
- Range buckets showing least count & accuracy
- Thermocouple/RTD subtype selection
- Validation feedback and alerts

**Used in**: Certificate edit page → Master Instrument section

---

### 2. **Admin Instrument Edit Page** (`docs/wireframes/admin-instrument-edit-final-fixed.md`)
**Scope**: Admin instruments management and editing
**Covers**:
- **Fixed Information Banner** (4×2 grid - consistent across all tabs)
  - Shows: Asset #, Status, Category, Calibrated At, Next Due, Last Updated, Model, Serial
  - Never changes regardless of active tab
  
- **Basic Info Tab**: Identification, operational details, calibration tracking
- **Capabilities Tab**: Expandable profiles with bucket tables, inline editing, subtype selection
- **Certificates Tab**: 
  - ACTIVE section (✓) for current valid calibrations
  - ARCHIVED section (✗) for expired/superseded with [Restore] option
  - Upload area with file management
  
- **PDF Viewer Mode**: Full PDF display with status indicator (✓ ACTIVE / ✗ ARCHIVED)
- **Metadata Tab**: Source, origin, lifecycle tracking, SOP references
- **Audit Log Tab**: Chronological event log with filters

**Used in**: `/admin/instruments/[id]/page.tsx`

---

### 3. **UUC & Parameter Enhancements** (`docs/wireframes/uuc-admin-enhancements.md`)
**Scope**: UUC section, parameter type expansion, date format selection, results validation
**Covers**:
- **UUC Section "Not Applicable"**:
  - Serial Number with ☐ Not Applicable checkbox
  - Instrument ID with ☐ Not Applicable checkbox
  - Operating Range with ☐ Not Applicable + constraint hint
  
- **Parameter Type Expansion** (22 → 30+ types):
  - Hierarchical dropdown with categories (Temperature, Pressure, Electrical, Mechanical, Other)
  - RTD subtypes: Pt-100, Pt-46, Pt-200, Cu-53, Ni-100, Ni-120
  - Thermocouple subtypes: Type K, J, T, E, N, R, S, B, L, U
  - Separate options for Speed (Contact) vs Speed (Non-Contact)
  - Vacuum vs Differential Pressure as distinct parameters
  - Subtype selector dropdown when applicable
  
- **Calibration Due Date Format Selection**:
  - Date input + radio buttons for 7 format options
  - Live preview showing selected format
  - Information text about regional preferences
  
- **Results Section Operating Range Constraint**:
  - Status indicators: ✓ in range / ✗ OUT OF RANGE for each data point
  - Validation summary and fix suggestions
  - Constraint explanation when "Not Applicable" is checked

**Used in**: 
- Certificate edit page → UUC Section
- Certificate edit page → Section 01 Summary
- Certificate edit page → Section 05 Results (with dynamic field rendering)
- `/admin/instruments/[id]/page.tsx` → Capabilities Tab (for parameter display)

---

### 4. **Section 05 Dynamic Field Declarations** (`docs/todos/section05-dynamic-fields-revamp.md`)
**Scope**: Calibration results table structure, field declarations, error computation
**Covers**:
- **Per-Parameter Card Layout**:
  - Custom table name (certificate heading)
  - Column setup section (Master fields, UUC fields)
  - Error computation configuration
  - Collapsed summary view
  
- **Column Schema Builder**:
  - Master instrument field list with [+ Add Master Field]
  - UUC field list with [+ Add UUC Field]
  - Field type selector (numeric/expression/text)
  - Unit input for numeric fields
  - Expression formula input for expression fields
  - Field ordering/reordering
  
- **Error Computation Setup**:
  - Field A dropdown (Master numeric only)
  - Field B dropdown (UUC numeric only)
  - Formula selector: [A − B] or [B − A]
  - Error unit selector
  
- **Results Table Rendering**:
  - Grouped headers: Master Instrument | UUC
  - Dynamic columns based on fieldDefinitions
  - Numeric inputs with precision enforcement
  - Text inputs
  - Expression fields (read-only, computed)
  - Error column with formula application
  - Accuracy validation (✓ in limit / ✗ out of limit)
  
- **Data Model**:
  - FieldDefinition interface
  - ErrorConfig interface
  - CalibrationResultRow (replaces old CalibrationResult)
  - Backward compatibility migration

**Used in**: 
- Certificate edit page → Section 05 Calibration Results
- PDF generation (custom table names, dynamic columns)
- Admin page results display (reference)

---

## Wireframe Relationships

```
Certificate Edit Page
├─ Master Instrument Selection
│  └─ Ref: master-selection-ui.md (full modal/page design)
├─ UUC Section
│  └─ Ref: uuc-admin-enhancements.md (Not Applicable, parameter expansion)
├─ Section 01 Summary
│  └─ Ref: uuc-admin-enhancements.md (date format selection)
└─ Section 05 Results
   ├─ Ref: section05-dynamic-fields-revamp.md (column setup, field definitions, error config)
   ├─ Ref: uuc-admin-enhancements.md (operating range constraint validation)
   └─ Dynamic rendering based on fieldDefinitions + ErrorConfig

Admin Instruments Page
└─ Ref: admin-instrument-edit-final-fixed.md (complete page design)
   ├─ Fixed Banner (Asset #, Status, Category, etc. - constant across all tabs)
   ├─ Basic Info Tab
   ├─ Capabilities Tab (shows parameter + subtype selection)
   │  └─ Ref: uuc-admin-enhancements.md (parameter hierarchy, subtype display)
   ├─ Certificates Tab (Active/Archived separation)
   │  ├─ Active: Drag-drop upload, file listing with ✓
   │  └─ Archived: Expired/superseded with ✗ and [Restore]
   ├─ PDF Viewer Mode (with status indicator ✓ ACTIVE or ✗ ARCHIVED)
   ├─ Metadata Tab
   └─ Audit Log Tab
```

---

## Redundancy Clarification

**Is `uuc-admin-enhancements.md` redundant?** 

**No**, with this clarification:
- ✅ The "Admin Instruments Page" section in `uuc-admin-enhancements.md` is now **superseded** by `admin-instrument-edit-final-fixed.md` which shows the actual detailed page design
- ✅ All other sections (UUC enhancements, parameter expansion, date format, results constraints) are **still relevant** as they cover certificate editing, not admin instrument management

---

## Implementation Timeline & Phases

### Phase 1: Foundation (Weeks 1–2)
1. **Data Model Migration**
   - Update TypeScript interfaces for new registry
   - Create migration script: old JSON → new structure
   - Update master-instrument-store.ts to load new data

2. **Basic Display** (Master section)
   - Add capability profile card display
   - Show least count & accuracy per parameter
   - Remove old parameter group filtering

### Phase 2: Section 05 Dynamic Fields Revamp (Weeks 3–4)
1. **Data Model for Dynamic Fields**
   - Create FieldDefinition, ErrorConfig, CalibrationResultRow interfaces
   - Add to Parameter type in certificate-store.ts
   - Create backward compatibility migration (old → new structure)

2. **Column Setup UI**
   - Table name input
   - Master/UUC field list builders
   - Field type selector (numeric/expression/text)
   - Error computation configuration
   - Collapsed summary display

3. **Results Table Rendering**
   - Grouped headers (Master/UUC)
   - Dynamic column rendering based on fieldDefinitions
   - Numeric input with precision enforcement
   - Text input support
   - Expression field computation
   - Error calculation and accuracy validation

### Phase 3: Parameter Types Database (Weeks 5–6)
1. **Database Schema**
   - Create CalibrationParameterStandards table
   - Create CalibrationParameters table
   - Set up indexes and constraints
   
2. **Seed Script**
   - Extract all 41 parameters from master_instrment_registry.json
   - Populate CalibrationParameterStandards
   - Auto-create org CalibrationParameters on first login
   
3. **API Endpoints**
   - GET /api/calibration-parameters (fetch org params)
   - PUT /api/admin/calibration-parameters/:id (customize name/units)

4. **Frontend Integration**
   - Create parameter-store.ts to load from API
   - Create parameter-mapping.ts for name conversion
   - Update UUCSection.tsx to use API data
   - Display customName in UI, store standardName internally

5. **Admin Management UI**
   - List 41 standard parameters
   - Edit dialog to customize names
   - Active/Inactive toggle

### Phase 4: UUC Enhancements & Pre-filtering (Weeks 7–8)
1. **"Not Applicable" Support**
   - Serial number, Instrument ID, Operating Range
   - Update validation logic
   
2. **Date Format Selection**
   - Add dropdown to Summary section
   - Implement format utility functions

3. **Pre-filtering & Constraints**
   - Convert customName → standardName for master filtering
   - Implement eligibility logic
   - Update UI with filter badges
   - Operating range constraint validation

### Phase 5: Admin Page Overhaul (Weeks 9–10)
1. **Data Model in Backend**
   - Update DB schema for capability profiles
   - Create migration for existing instruments
   
2. **Admin UI Redesign**
   - New detail view with capability profiles
   - Bucket-level display
   - Fixed banner and tab navigation
   - Certificate Active/Archived sections
   
3. **PDF Upload Bug Fix**
   - Investigate root cause
   - Implement fix & tests

### Phase 6: PDF Generation & Integration (Week 11)
1. **Dynamic Field PDF Rendering**
   - Use custom tableName for each parameter
   - Render columns based on fieldDefinitions
   - Apply expression computation
   - Include error columns with formula

2. **Date Format in PDF**
   - Apply selected date format to due date field

### Phase 7 (Future): Custom Parameters Workflow
```
Deferred to Phase 2 (not in current scope):
- Request/approval workflow for custom parameters
- Parameter request dashboard
- Engineering review process
- Notification system
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Parameter name mapping errors** | Wrong master filters, data confusion | Thorough testing of customName ↔ standardName conversion |
| **Seed script accuracy** | Wrong units/subtypes for 41 parameters | Extract directly from master_instrment_registry.json; automated verification |
| **Database isolation** | Org data leakage between labs | Clear constraints, indexes; test multi-org scenarios |
| **Parameter caching** | Stale data in UI after customization | Short cache TTL; invalidate on updates |
| **Dynamic fields complexity** | Breaking existing certificate structure | Implement thorough backward compatibility migration; extensive testing |
| **Expression evaluation** | Formula errors break data entry | Validate expression syntax; show errors in UI; test with sample formulas |
| **Data model changes** | Requires backend schema rewrite | Start with data model finalization; use migration layer |
| **Pre-filtering logic** | Edge cases in range matching | Build comprehensive test suite; manual QA with sample data |
| **PDF upload bug** | Blocks users from documenting masters | Parallel investigation; may need backend audit |
| **Performance** | Large parameter lists (41) + API calls | Cache locally; preload on app start; monitor query times |
| **PDF generation** | Dynamic table rendering breaks PDF layout | Template testing with various column counts; responsive sizing |
| **Backward compatibility** | Old certificates break | Version API; provide fallback rendering; test migration thoroughly |

---

## Testing Strategy

### Unit Tests
- [ ] `filterByCapability()` function with edge cases
- [ ] Date format utility functions
- [ ] Parameter validation with "Not Applicable" values
- [ ] Range overlap detection
- [ ] **NEW**: Parameter name mapping (customName ↔ standardName)
- [ ] **NEW**: Expression parser and evaluator (handles `{field1} * 0.001`)
- [ ] **NEW**: Field definition validation (required fields, type consistency)
- [ ] **NEW**: Error computation logic (`A-B` vs `B-A` formulas)
- [ ] **NEW**: Backward compatibility migration (old → new CalibrationResult)
- [ ] **NEW**: Precision enforcement for numeric fields based on least count

### Database Tests
- [ ] **NEW**: Seed script extracts 41 parameters correctly from master registry
- [ ] **NEW**: CalibrationParameterStandards populated with correct units/subtypes
- [ ] **NEW**: CalibrationParameters org isolation (multi-org data)
- [ ] **NEW**: Query performance with indexes
- [ ] **NEW**: Org initialization auto-creates parameters on first login

### API Tests
- [ ] **NEW**: GET /api/calibration-parameters returns org-specific parameters
- [ ] **NEW**: GET response includes customName + standardName correctly
- [ ] **NEW**: PUT /api/admin/calibration-parameters/:id updates custom name
- [ ] **NEW**: Active/Inactive toggle works
- [ ] **NEW**: Error handling for invalid parameter IDs
- [ ] **NEW**: Multi-org isolation (Org A doesn't see Org B customizations)

### Integration Tests
- [ ] Master selection → parameter filtering → results validation
- [ ] UUC "Not Applicable" paths in validation
- [ ] PDF date format rendering
- [ ] **NEW**: Parameter API load → UI display → master filtering (full flow)
- [ ] **NEW**: Seed script run → all orgs auto-get 41 parameters
- [ ] **NEW**: Lab admin customizes name → certificate uses custom name
- [ ] **NEW**: Master filtering uses standardName internally
- [ ] **NEW**: Column setup → results table rendering (various field combinations)
- [ ] **NEW**: Dynamic field modification (add/remove/reorder fields)
- [ ] **NEW**: Error computation with missing field references
- [ ] **NEW**: Expression field dependencies and circular reference detection

### E2E Tests
- [ ] Create certificate with filtered master (range check)
- [ ] Create certificate with "Not Applicable" operating range
- [ ] PDF generation with selected date format
- [ ] Admin page capability profile display
- [ ] **NEW**: Seed script deploys → Lab A gets 41 parameters
- [ ] **NEW**: Lab A admin customizes "RTD" to "Platinum RTD"
- [ ] **NEW**: Certificate form shows "Platinum RTD" in dropdown
- [ ] **NEW**: Master filtering works with custom name internally
- [ ] **NEW**: Lab B has different custom names (isolated)
- [ ] **NEW**: Configure dynamic fields for Pressure parameter
- [ ] **NEW**: Configure dynamic fields for Temperature parameter
- [ ] **NEW**: Enter measurement data with multiple fields and expressions
- [ ] **NEW**: Generate PDF with custom table names and dynamic columns
- [ ] **NEW**: Migrate old certificate to new field structure
- [ ] **NEW**: Edit existing certificate with dynamic fields

---

## Files to Modify (Summary)

**Database Schema**:
1. `CalibrationParameterStandards` table (standard parameter definitions from master registry)
2. `CalibrationParameters` table (org-specific custom names only)

**Backend**:
1. Database migrations (create parameter tables)
2. **NEW**: `scripts/seed-calibration-parameters.ts` (extract 41 params from master registry)
3. API endpoints:
   - `GET /api/calibration-parameters` (fetch org params)
   - `PUT /api/admin/calibration-parameters/:id` (customize name/units)
4. Org initialization: Auto-create CalibrationParameters on first login
5. PDF generation template (date formatting)

**Frontend**:
1. `MasterInstrumentSection.tsx` (major refactor)
2. `UUCSection.tsx` (load from API, use customName in UI, standardName internally)
3. `SummarySection.tsx` (add date format selector)
4. `ResultsSection.tsx` (MAJOR: dynamic field declarations, column setup UI, table rendering)
5. `lib/master-instruments.ts` (new interfaces)
6. `lib/stores/master-instrument-store.ts` (data loading)
7. `lib/stores/certificate-store.ts` (new fields for all features)
8. `app/admin/instruments/[id]/page.tsx` (complete redesign)
9. **NEW**: `lib/stores/parameter-store.ts` (fetch and cache org parameters)
10. **NEW**: `lib/parameter-mapping.ts` (convert customName ↔ standardName)
11. **NEW**: `lib/field-definitions.ts` (field type utilities, expression evaluation)
12. **NEW**: `lib/dynamic-fields-migration.ts` (backward compatibility mapping)
13. **NEW**: `app/admin/calibration-parameters/page.tsx` (customize parameter names only)

---

## Questions for Clarification

1. **Backward Compatibility**: Should old certificates still render correctly with new system?
   - **Answer**: Yes - migration layer maps old structure to new fieldDefinitions

2. **"Not Applicable" Scope**: Should other fields also support this (e.g., instrument make/model)?
   - **Current scope**: Only Serial #, Instrument ID, Operating Range

3. **Date Format Default**: What should be the default format per user/organization?
   - **Decision needed**: Lab preference? Customer preference? User setting?

4. **PDF Upload**: Is this the same as certificate PDF upload, or something different?
   - **Context**: Admin instruments page certificate management (Active/Archived)

5. **Master Subtype Selection**: Should users pick subtype, or auto-detect from selection?
   - **Current design**: User selects from available subtypes (Type K, Pt-100, etc.)

6. **Expression Field Complexity**: What level of expression support is needed?
   - **Current design**: Simple formula referencing other fields like `{field1} * 0.001`
   - **Constraints**: Read-only in table, computed on input

7. **Multiple Master Instruments**: Can a certificate use more than one master?
   - **Current design**: Yes - "Add Another Master" supported in selection UI

8. **Field Ordering**: Should fields be user-reorderable in the table?
   - **Current design**: Order defined by fieldDefinitions array, user can reorder via UI

9. **Field Deletion Impact**: If user deletes a field referenced in errorConfig, what happens?
   - **Current design**: Clear reference, show warning to reconfigure error formula

10. **Seed Script Accuracy**: How do we ensure all 41 parameters are extracted correctly?
    - **Current approach**: Extract directly from master_instrment_registry.json
    - **Verification**: Automated comparison script + manual spot-check

11. **Parameter Caching**: How long should org parameter list be cached on frontend?
    - **Decision needed**: Cache indefinitely? Time-based (5 min)? Invalidate on save?
    - **Current approach**: Cache with invalidation on customization updates

12. **Phase 2 Custom Parameters**: When/how will custom parameter workflow be added?
    - **Current**: Deferred to future phase
    - **TBD**: Request workflow, approval process, integration with master registry updates

