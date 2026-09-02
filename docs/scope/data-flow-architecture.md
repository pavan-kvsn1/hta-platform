# Master Specification Integration - Data Flow & Architecture

## High-Level Architecture

```
┌──────────────────────────────────────┐
│ Master Registry JSON                 │
│ (master_instrment_registry.json)     │
│ ├─ 204 Assets                        │
│ ├─ Capability Profiles               │
│ └─ Subtypes (Type K, Pt-100, etc.)   │
└──────────────────┬───────────────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
      ▼                         ▼
┌──────────────────┐   ┌──────────────────────┐
│ Seed Script      │   │ Master Instrument    │
│ (deployment)     │   │ Store                │
│ Extract 41 params│   │ (lib/stores/...)     │
└──────────┬───────┘   │ ├─ Load registry     │
           │           │ ├─ Parse profiles   │
           │           │ └─ Filter by range  │
           │           └──────┬──────────────┘
           │                  │
           ▼                  ▼
    ┌────────────────────────────────────┐
    │ Database Layer                     │
    ├─ CalibrationParameterStandards    │
    │  (41 standard parameters)          │
    └────────────────────────────────────┘
           │
           ▼
    ┌────────────────────────────────────┐
    │ Org Layer (Per Lab)                │
    ├─ CalibrationParameters            │
    │  (custom names + settings)         │
    └────────┬───────────────────────────┘
             │
    ┌────────┼────────┬──────────┐
    │        │        │          │
    ▼        ▼        ▼          ▼
 ┌─────┐ ┌──────┐ ┌───────┐ ┌────────┐
 │ UUC │ │Master│ │ Env.  │ │Results │
 │     │ │Inst. │ │       │ │ Fields │
 └─────┘ │Select│ └───────┘ └────────┘
         │ (FILT)│
         └──────┘
           │
           ▼
    ┌────────────────────┐
    │ Validation Layer   │
    │ ├─ UUC complete?   │
    │ ├─ Master covers?  │
    │ ├─ Results valid?  │
    │ └─ Constraints?    │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ PDF Generation     │
    │ ├─ Date format     │
    │ ├─ Dynamic columns │
    │ └─ Render cert     │
    └────────────────────┘
```

---

## Data Flow: Master Selection with Pre-filtering

```
User Opens Certificate Edit Page
         │
         ▼
┌─────────────────────────────────┐
│ 1. Load UUC Parameters          │
│    (parameterName, range,       │
│     accuracy, unit, subtype)    │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ 2. Filter Master Instruments    │
│    For Each Master:             │
│    ├─ Has this parameter?       │
│    ├─ Covers the range?         │
│    ├─ Accuracy sufficient?      │
│    └─ Subtype matches?          │
│                                 │
│    Result: Eligible Masters     │
│    "3 of 45 can measure this"   │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ 3. User Selects Master          │
│    ├─ Pick from eligible list   │
│    ├─ See: Asset #, Model,      │
│    │   Category                 │
│    └─ See: Capability Profile   │
│        • Parameter: Pressure    │
│        • Role: Measuring        │
│        • Unit: bar              │
│        • Range: 0–1000          │
│        • Least Count: 0.01      │
│        • Accuracy: ±0.1%FS      │
│        • (6 range buckets)      │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ 4. Store Selection              │
│    ├─ masterInstrumentId        │
│    ├─ capability_profiles       │
│    ├─ assetNumber               │
│    └─ description               │
└─────────────┬───────────────────┘
              │
              ▼
         Certificate Form Data
```

---

## Data Model Transformation

### Current (Old) Structure
```typescript
{
  id: 1,
  type: "Electro-Technical",
  instrument_desc: "Digital Pressure Gauge",
  make: "Fluke",
  model: "5500A",
  asset_no: "1000 HTAIPL/L",
  parameter_group: "Pressure",        // ← FLAT
  capabilities: ["Pressure"],          // ← FLAT
  range: [
    { parameter: "Pressure", min: "0", max: "700", unit: "bar" }
  ]
}
```

### New (Registry) Structure
```typescript
{
  asset_type: "simple",
  asset_no_normalized: "1000",
  instrument_desc: "Digital Pressure Gauge",
  make: "Fluke",
  model: "TX 430-1",
  category: "Mechanical",
  serial_no: "NVE12502806",
  capability_profiles: [
    {
      id: "P1",
      parameter: "Pressure",
      role: "measuring",              // ← ROLE EXPLICIT
      unit: "bar",
      min: 0,
      max: 700,
      min_inclusive: true,
      max_inclusive: true,
      buckets: [                       // ← RANGE BUCKETS
        {
          id: "B1",
          min: 0,
          max: 100,
          least_count: { value: 0.01, unit: "bar" },
          accuracy: { type: "symmetric", value: 0.1, unit: "%FS", polarity: "±" }
        },
        {
          id: "B2",
          min: 100,
          max: 500,
          least_count: { value: 0.05, unit: "bar" },
          accuracy: { type: "symmetric", value: 0.15, unit: "%FS", polarity: "±" }
        },
        // ... more buckets
      ]
    }
  ]
}
```

---

## Data Flow: Parameter Seeding & Initialization

```
Deployment Time (Once)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

master_instrment_registry.json (source of truth)
        │
        ├─ Extract 41 distinct parameters
        │  (RTD, Thermocouple, Pressure, Temperature, etc.)
        │
        └─→ scripts/seed-calibration-parameters.ts
            │
            ├─ standardName: "RTD"
            ├─ units: ["°C", "°F", "K", "Ω"]
            ├─ subtypes: ["Pt-100", "Pt-46", ...]
            ├─ category: "Temperature"
            └─ source: "seed:master_registry_v1.0"
            │
            └─→ Database Migration
                │
                └─→ INSERT CalibrationParameterStandards
                    (41 rows created, never changes)


First Org Login (Per Org, Once)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Organization: Lab A logs in
        │
        ├─ System detects: First login
        │
        └─→ Org Initialization Script
            │
            ├─ FOR EACH standard parameter:
            │  ├─ standardParameterId: UUID
            │  ├─ customName: "RTD" (default = standard)
            │  ├─ active: true
            │  └─ organizationId: lab-a-uuid
            │
            └─→ INSERT CalibrationParameters
                (41 rows per org)

Lab A now has:
├─ RTD (custom name = "RTD")
├─ Thermocouple (custom name = "Thermocouple")
├─ Pressure (custom name = "Pressure")
└─ ... (41 total)

Lab B logs in → Same 41 parameters
(Isolated per org)
```

---

## Data Flow: Parameter Loading & Mapping

```
User Opens Certificate Form
       │
       ▼
┌──────────────────────────────────────┐
│ 1. Fetch Org Parameters              │
│    GET /api/calibration-parameters   │
│    Response:                          │
│    {                                 │
│      id: "uuid-123",                │
│      standardName: "RTD",            │
│      customName: "Platinum RTD",     │ ← Lab customized!
│      units: ["°C", "°F", "K", "Ω"],│
│      category: "Temperature"         │
│    }[]                              │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 2. Store in Parameter Store          │
│    lib/stores/parameter-store.ts     │
│    ├─ Cache locally                 │
│    ├─ Map: standardName → custom    │
│    └─ Ready for UI                  │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 3. UUC Section Display               │
│    Show Parameter Dropdown:          │
│    ├─ "Platinum RTD" ← customName   │
│    ├─ "Thermocouple (Type K)"       │
│    ├─ "Pressure"                    │
│    └─ ... (all 41)                  │
└──────────┬───────────────────────────┘
           │
User selects: "Platinum RTD"
           │
           ▼
┌──────────────────────────────────────┐
│ 4. Internal Mapping                  │
│    mapCustomToStandardName(          │
│      customName: "Platinum RTD"      │
│    ) → "RTD"                         │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 5. Master Filtering                  │
│    filterByCapability(               │
│      standardName: "RTD",            │
│      range: -50 to 200,              │
│      accuracy: ±0.1°C                │
│    )                                 │
│    → Filters master instruments     │
│      with RTD capability            │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 6. Store in Certificate Form         │
│    parameter: {                      │
│      name: "Platinum RTD",           │
│      standardName: "RTD",            │
│      unit: "°C",                     │
│      range: [-50, 200]               │
│    }                                 │
└──────────────────────────────────────┘
```

---

## Component Interaction: Parameter Store

```
┌─────────────────────────────────┐
│   Parameter Store               │
│  (lib/stores/parameter-store.ts)│
│  ├─ fetch()                     │
│  ├─ mapCustomToStandard()       │
│  ├─ mapStandardToCustom()       │
│  └─ cache (local)               │
└──────────┬──────────────────────┘
           │
    ┌──────┼──────┬────────────┐
    │      │      │            │
    ▼      ▼      ▼            ▼
┌──────┐┌──────┐┌───────┐  ┌─────────┐
│ UUC  ││Master││Results│  │Cert Form│
│Sec.  ││Filt. ││Validat│  │ Store   │
│      ││      ││ion    │  │         │
└──────┘└──────┘└───────┘  └─────────┘
   │       │       │          │
   └───────┼───────┼──────────┘
           │       │
         Uses customName for display
         Uses standardName internally
         for filtering/validation
```

**Data Flow Through Components**:

1. **Parameter Store** → Fetches from API
   - Caches: `{ standardName, customName, units, ... }`

2. **UUC Section** → Displays for user selection
   - Shows: `customName` (e.g., "Platinum RTD")
   - Stores: `{ name, standardName }`

3. **Master Filtering** → Uses standard names
   - Input: `standardName: "RTD"`
   - Filters masters with RTD capability

4. **Certificate Store** → Keeps both
   - Stores: `{ parameterName, standardName }`
   - Allows display + filtering

---

## Component Interaction: Master Selection

```
┌─────────────────────────────────────────┐
│   MasterInstrumentSection               │
│  (Master Instrument selection + display)│
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
┌─────────────┐  ┌────────────────┐
│ Selection   │  │ Display Card   │
│ Dropdown    │  │ (with filters) │
└──────┬──────┘  └────────┬───────┘
       │                  │
       ▼                  ▼
  Master      →  Capability Profiles
  Instrument      ├─ Parameter
  Store           ├─ Role
                  ├─ Unit
                  ├─ Range
                  ├─ Least Count
                  └─ Accuracy (per bucket)
```

**Component Props Flow**:
```
MasterInstrumentSection
  │
  ├─ parameters: Parameter[]    ← From UUC section
  │  └─ Used for: filtering eligible masters
  │
  ├─ selectedMasters: SelectedMasterInstrument[]
  │  └─ masterInstrumentId, category, description, etc.
  │
  └─ capability_profiles: CapabilityProfile[]
     └─ For display card
```

---

## Validation Flow: Operating Range "Not Applicable"

```
UUC Section: Operating Range
       │
       ▼
   ┌───────────────┐
   │ Set: "N/A"?   │
   └───┬───────┬───┘
       │       │
   YES│       │NO
       ▼       ▼
   Hide     Show
   Inputs   Inputs
       │       │
       │       └─── operatingMin, operatingMax REQUIRED
       │
       └─── operatingRangeNotApplicable = true
            (operatingMin, operatingMax ignored)
                    │
                    ▼
              Results Section
              ├─ Validation:
              │  "At least ONE data point
              │   must be within measurement
              │   range [min–max]"
              │
              └─ Example:
                 Range: [10–50]
                 Results:
                 ├─ 15.2  ✓ (in range)
                 ├─ 25.1  ✓ (in range)
                 └─ 88.5  ✗ (out of range)
                 
                 Status: ✓ VALID
                 (has at least 1 point in range)
```

---

## Parameter Type Expansion: Before & After

### Before (22 types)
```
Temperature, Humidity, Pressure, Voltage DC, Voltage AC,
Current DC, Current AC, Resistance, Frequency, Time,
Mass, Force, Torque, Length, Flow, Speed, Sound Level,
Vibration, Conductivity, Lux, pH, Capacitance, Inductance
```

### After (30+ types)
```
Temperature
├─ RTD (with subtypes: Pt-100, Pt-46, Pt-200, Cu-53, Ni-100, Ni-120)
├─ Thermocouple (with subtypes: Type K/J/T/E/N/R/S/B/L/U)
├─ [exists]

Pressure
├─ Pressure [exists]
├─ Differential Pressure [NEW]
├─ Vacuum [NEW]

Electrical
├─ AC/DC Voltage [merged]
├─ AC/DC Current [merged]
├─ [Resistance, Frequency, etc. exist]
├─ Power [NEW]

Mechanical
├─ Speed (Contact) [NEW]
├─ Speed (Non-Contact) [NEW]
├─ Air Velocity [NEW]
├─ [exists: Force, Torque, etc.]

Other
├─ Relative Humidity [rename: Humidity → Relative Humidity]
├─ Particle Count [NEW]
├─ [exists: others]
```

---

## Date Format Selection: UX Flow

```
Summary Section: Calibration Due Date
          │
          ▼
    ┌──────────────┐
    │ Date Input   │
    │ [02/09/2026] │
    └──────┬───────┘
           │
           ▼
    ┌──────────────────────────┐
    │ Format Dropdown (NEW)     │
    │ ┌──────────────────────┐  │
    │ │ DD/MM/YYYY        ✓ │  │  ← Selected
    │ │ DD-MM-YYYY          │  │
    │ │ MM/DD/YYYY          │  │
    │ │ DD MonthName YYYY   │  │
    │ │ MonthName DD, YYYY  │  │
    │ │ YYYY-MM-DD          │  │
    │ │ MM/YYYY             │  │
    │ └──────────────────────┘  │
    └────────┬─────────────────┘
             │
             ▼
    Preview: "02 September 2026"
             │
             ▼
    PDF Rendering
    ├─ Get: calibrationDueDateFormat
    ├─ Get: calibrationDueDate value
    ├─ Call: formatDateForCertificate(date, format)
    └─ Render in PDF: "02 September 2026"
```

**Format Utility**:
```typescript
function formatDateForCertificate(
  date: Date,
  format: string
): string {
  switch(format) {
    case 'DD/MM/YYYY':
      return format(date, 'dd/MM/yyyy')
    case 'DD-MM-YYYY':
      return format(date, 'dd-MM-yyyy')
    case 'MonthName DD, YYYY':
      return format(date, 'MMMM dd, yyyy')  // "September 02, 2026"
    // ... etc
  }
}
```

---

## Admin Page: Capability Profile Display

### Current View (Flat)
```
Range Data:
├─ Parameter: Pressure, Min: 0, Max: 700, Unit: bar
├─ Parameter: Pressure, Min: 0, Max: 100, Unit: bar
└─ ...
```

### New View (Hierarchical)
```
┌─ Capability Profile 1: Pressure (measuring)
│  ├─ Parameter: Pressure
│  ├─ Role: Measuring
│  ├─ Unit: bar
│  ├─ Overall Range: 0–1000 bar
│  │
│  └─ Range Buckets:
│     ├─ Bucket B1: 0–100 bar
│     │  ├─ Least Count: 0.01 bar
│     │  └─ Accuracy: ±0.1%FS
│     │
│     ├─ Bucket B2: 100–500 bar
│     │  ├─ Least Count: 0.05 bar
│     │  └─ Accuracy: ±0.15%FS
│     │
│     └─ Bucket B3: 500–1000 bar
│        ├─ Least Count: 0.1 bar
│        └─ Accuracy: ±0.2%FS
│
└─ Capability Profile 2: Thermocouple (source)
   ├─ Parameter: Thermocouple
   ├─ Subtype: Type K
   ├─ Role: Source
   ├─ Unit: °C
   ├─ Overall Range: -200 to 1372°C
   │
   └─ Range Buckets:
      ├─ Bucket B1: -200 to 0°C
      │  ├─ Least Count: 1°C
      │  └─ Accuracy: ±0.47°C
      │
      └─ Bucket B2: 0 to 1372°C
         ├─ Least Count: 1°C
         └─ Accuracy: ±0.3°C
```

---

## Implementation Dependency Graph (Simplified Timeline)

```
┌─────────────────────────────────┐
│ Phase 1: Section 05 Dynamic     │
│ Fields (Weeks 1–4)              │
│ ├─ Data model (FieldDef, etc.)  │
│ ├─ Column setup UI              │
│ ├─ Results table rendering      │
│ └─ Expression evaluation        │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Phase 2: Master Integration     │
│ (Weeks 3–4, parallel)           │
│ ├─ New registry interfaces      │
│ ├─ Master instrument store      │
│ └─ Capability profile display   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Phase 3: Parameter System (DB)  │
│ (Weeks 5–6)                     │
│ ├─ Database schema              │
│ ├─ Seed script (41 params)      │
│ ├─ API endpoints                │
│ ├─ Parameter store + mapping    │
│ └─ Admin customization UI       │
└────────┬────────────────────────┘
         │
    ┌────┴────────────────────┐
    │                         │
    ▼                         ▼
Phase 4A:            Phase 4B:
UUC Enhancements    Master Pre-filtering
(Weeks 7–8)         (Weeks 7–8)
├─ "Not Appl." support
├─ Subtype selection
└─ Date format selector
    │                       │
    └───────────┬───────────┘
                │
                ▼
    ┌────────────────────────────────┐
    │ Phase 5: Admin Page Overhaul   │
    │ (Weeks 9–10)                   │
    │ ├─ 6-tab redesign              │
    │ ├─ Fixed banner                │
    │ ├─ Cert Active/Archived        │
    │ ├─ PDF viewer mode             │
    │ ├─ PDF upload bug fix          │
    │ └─ Backend DB migration        │
    └────────┬─────────────────────┘
             │
             ▼
    ┌────────────────────────────────┐
    │ Phase 6: PDF Generation        │
    │ (Week 11)                      │
    │ ├─ Dynamic field rendering     │
    │ ├─ Custom table names          │
    │ ├─ Date format in PDF          │
    │ └─ Expression computation      │
    └────────────────────────────────┘

Total Timeline: 11 weeks (was 13 weeks with approval workflow)
```

**Critical Path**:
```
Phase 1 (Section 05) → Phase 2 (Master) → Phase 3 (Parameters)
                                                        ↓
                                    Phases 4A + 4B (parallel)
                                                        ↓
                                          Phase 5 (Admin Page)
                                                        ↓
                                           Phase 6 (PDF Gen)
```

**Key Simplifications**:
- ❌ Removed: Parameter approval workflow (was 4 weeks)
- ❌ Removed: Request dashboard, engineering review, notifications
- ✅ Added: Direct seed script approach (41 params, once per deploy)
- ✅ Result: 2 weeks saved, no bottleneck on engineering

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| **Seed script accuracy** | Extract from master registry JSON programmatically; automated verification |
| **Parameter name mapping** | Thorough testing of customName ↔ standardName conversion paths |
| **Org isolation** | Database constraints + multi-org integration tests |
| **Parameter caching staleness** | Cache invalidation on customization updates; short TTL fallback |
| **Dynamic fields complexity** | Extensive backward compatibility migration tests |
| **Pre-filtering edge cases** | Comprehensive unit tests; test matrix by parameter |
| **Performance** | Lazy load registry; pagination on dropdown; parameter caching |
| **Backward compatibility** | Version API endpoints; maintain fallback rendering |
| **PDF upload bug** | Parallel investigation; mock-test file upload flow |
| **Validation conflicts** | Clear priority: constraint > optional > "Not Applicable" |
| **Expression evaluation** | Expression syntax validation; error feedback in UI |
| **PDF generation** | Template testing with various column counts; responsive sizing |

---

## Integration Points: Parameters + Master Filtering + Validation

```
Certificate Creation Flow with Parameters
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. UUC Section
   │
   ├─ Load parameters from API
   │  └─ Shows: customName (e.g., "Platinum RTD")
   │
   ├─ User selects parameter
   │  └─ Stores: { name, standardName, range, accuracy }
   │
   └─→ Next: Master Selection

2. Master Instrument Section
   │
   ├─ Get: UUC parameter (standardName)
   │
   ├─ Pre-filter masters
   │  └─ Filter where: capability_profiles.parameter == standardName
   │  └─ Check: range coverage
   │  └─ Check: accuracy sufficient
   │
   ├─ Show: "3 of 45 masters eligible"
   │
   ├─ User selects master
   │  └─ Stores: { masterInstrumentId, capability_profiles }
   │
   └─→ Next: Section 05 Results

3. Results Section
   │
   ├─ Load: Dynamic field schema (from master's capability profile)
   │  ├─ Master fields: least count, accuracy
   │  └─ UUC fields: from parameter
   │
   ├─ User enters measurements
   │  ├─ Numeric validation (precision based on least count)
   │  ├─ Error computation (A-B or B-A)
   │  └─ Accuracy check (error vs accuracy limit)
   │
   └─→ Next: Validation + PDF

4. Validation Layer
   │
   ├─ Check: Operating range constraint
   │  ├─ If "N/A": At least 1 point in [min–max]
   │  └─ If specified: All points in [operating_min–operating_max]
   │
   ├─ Check: Results complete
   │
   └─→ Next: PDF Generation

5. PDF Generation
   │
   ├─ Use: Custom table name (from parameter config)
   │
   ├─ Render: Dynamic columns
   │  ├─ Master fields (with least count)
   │  ├─ UUC fields
   │  └─ Error computed column
   │
   ├─ Format: Date using selected format
   │
   └─→ Output: Certificate PDF
```

**Parameter Usage Summary**:

| Component | What It Uses | Why |
|-----------|--------------|-----|
| **UUC Section** | customName | User-friendly display |
| **Master Filtering** | standardName | Map to master capabilities |
| **Field Definitions** | standardName + units | Dynamic column schema |
| **Results Table** | least_count, accuracy | Data validation |
| **Certificate PDF** | tableName, columns | Custom certificate format |

---

## Phase 2 (Deferred) - Custom Parameters Workflow

**Currently Out of Scope** — To be implemented in future phase:

```
Future Features:
├─ Allow labs to request new parameters
├─ Request → Review → Approval workflow
├─ Engineering team manages additions
├─ Integration with master registry updates
└─ Custom parameter validation
```

**Reason for Deferral**: 
- Ship with all 41 standard parameters pre-loaded
- Validate that covers 90%+ of use cases
- Add custom workflow only if needed based on real usage

