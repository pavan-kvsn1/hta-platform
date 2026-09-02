# Section 05 — Dynamic Field Declarations Revamp

**Problem:** Currently each parameter in Section 05 (Calibration Results) has a rigid table structure — one `standardReading` (Master), one `beforeAdjustment` (UUC), and an optional `afterAdjustment`. Real calibration certificates require variable column structures per parameter: multiple fields per instrument, different units, mixed types (numeric/expression/text), and user-defined error computation.

**Current files:**
- `apps/web-hta/src/components/forms/ResultsSection.tsx` — current fixed-column `ResultsTable`
- `apps/web-hta/src/lib/stores/certificate-store.ts` — `Parameter`, `CalibrationResult` types

---

## Requirements

1. **Multiple fields per instrument** — Master Instrument and UUC can each carry 1 or more fields
2. **Field types** — each field is one of: `numeric` (with unit), `expression` (formula referencing other fields), or `text` (free-form)
3. **Custom table name** — each parameter's table gets a user-defined heading (shown on the certificate PDF)
4. **Error computation** — user selects which one Master numeric field and which one UUC numeric field to use, plus the formula (A−B or B−A)
5. **Progressive declaration** — users configure the field schema per parameter before entering data

---

## UI Design

### Per-Parameter Card Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PARAMETER 1: Pressure  ·  2 to 17 kg/cm²                                │
│  Accuracy: ±0.02 kg/cm²  |  ABSOLUTE  |  Least Count: 0.01               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Table Name  ┌──────────────────────────────────────────────────┐          │
│              │ Calibration of Pressure Gauge                    │          │
│              └──────────────────────────────────────────────────┘          │
│                                                                            │
│  ┌─ Column Setup ─────────────────────────────────── [▾ Collapse] ──────┐ │
│  │                                                                       │ │
│  │  MASTER INSTRUMENT FIELDS         UUC FIELDS                          │ │
│  │  ┌─────────────────────────┐      ┌─────────────────────────┐         │ │
│  │  │ ① Std Meter Reading (Y) │      │ ① UUC Status            │         │ │
│  │  │ Type: [Numeric     ▾]   │      │ Type: [Text         ▾]  │         │ │
│  │  │ Unit: [kg/cm²      ]    │      │                    [×]  │         │ │
│  │  │                    [×]  │      └─────────────────────────┘         │ │
│  │  └─────────────────────────┘      ┌─────────────────────────┐         │ │
│  │                                   │ ② UUC Reading (x)       │         │ │
│  │                                   │ Type: [Numeric     ▾]   │         │ │
│  │                                   │ Unit: [kg/cm²      ]    │         │ │
│  │                                   │                    [×]  │         │ │
│  │                                   └─────────────────────────┘         │ │
│  │  [+ Add Master Field]             [+ Add UUC Field]                   │ │
│  │                                                                       │ │
│  │  ── ERROR COMPUTATION ──────────────────────────────────────────      │ │
│  │  Field A: [Std Meter Reading (Y)  ▾]  ← Master numeric fields only  │ │
│  │  Field B: [UUC Reading (x)        ▾]  ← UUC numeric fields only     │ │
│  │  Formula: [A − B ▾]    Error Unit: [kg/cm²]                          │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  Points: [6 ▾]                                                             │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │        │           │  Master      │         UUC          │          │  │
│  │        │           ├──────────────┼──────────┬───────────┤ Error    │  │
│  │  Sl.   │ Trail No  │ Std Meter    │  UUC     │ UUC       │ Observed │  │
│  │        │           │ Reading (Y)  │  Status  │ Rdg (x)   │   (±)    │  │
│  │        │           │  kg/cm²      │          │  kg/cm²   │  kg/cm²  │  │
│  ├────────┼───────────┼──────────────┼──────────┼───────────┼──────────┤  │
│  │  01    │ Trail-1   │ [ 6.02    ]  │ [ON   ]  │ [ 6     ] │  0.02    │  │
│  │  02    │ Trail-1   │ [ 5.99    ]  │ [OFF  ]  │ [ 6     ] │  0.01    │  │
│  │  03    │ Trail-2   │ [ 6.03    ]  │ [ON   ]  │ [ 6     ] │  0.03    │  │
│  │  04    │ Trail-2   │ [ 5.98    ]  │ [OFF  ]  │ [ 6     ] │  0.02    │  │
│  │  05    │ Trail-3   │ [ 6.03    ]  │ [ON   ]  │ [ 6     ] │  0.03    │  │
│  │  06    │ Trail-3   │ [ 5.98    ]  │ [OFF  ]  │ [ 6     ] │  0.02    │  │
│  ├────────┴───────────┴──────────────┴──────────┴───────────┴──────────┤  │
│  │                      [+ Add measurement row]                        │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │  ✓ All 6 points within accuracy limits          Accuracy: ABSOLUTE  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Collapsed Column Setup (summary mode)

When collapsed, the config panel shows a one-line summary so users can see what's configured at a glance:

```
┌─ Column Setup ─────────────────────────────────── [▸ Expand] ───────────┐
│  Master: Std Meter Reading (numeric, kg/cm²)                             │
│  UUC: UUC Status (text), UUC Reading (numeric, kg/cm²)                   │
│  Error: Std Meter Reading − UUC Reading                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Multi-Parameter Example (Temperature)

Shows how a different parameter has a completely different column layout:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PARAMETER 2: Temperature  ·  30 to 200 °C                               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Table Name: [ Calibration of Temperature Sensor ]                         │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │        │  Master         │          UUC              │              │  │
│  │        ├─────────────────┼─────────────┬─────────────┤  Error       │  │
│  │  Sl.   │ Ref Thermo Rdg  │ UUC Display │  Sensor mV  │  Observed   │  │
│  │        │      °C         │     °C      │     mV      │    °C       │  │
│  ├────────┼─────────────────┼─────────────┼─────────────┼─────────────┤  │
│  │  01    │ [  30.0      ]  │ [  30.2  ]  │ [ 12.1   ]  │   0.2       │  │
│  │  02    │ [  80.0      ]  │ [  80.5  ]  │ [ 33.4   ]  │   0.5       │  │
│  │  03    │ [ 120.0      ]  │ [ 121.0  ]  │ [ 50.2   ]  │   1.0       │  │
│  │  04    │ [ 160.0      ]  │ [ 160.8  ]  │ [ 66.8   ]  │   0.8       │  │
│  │  05    │ [ 200.0      ]  │ [ 201.2  ]  │ [ 83.5   ]  │   1.2       │  │
│  ├────────┴─────────────────┴─────────────┴─────────────┴─────────────┤  │
│  │                      [+ Add measurement row]                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### New types

```typescript
interface FieldDefinition {
  id: string
  name: string                              // e.g. "Standard Meter Reading (Y)"
  group: 'master' | 'uuc'                  // Which instrument side
  type: 'numeric' | 'expression' | 'text'  // Field type
  unit: string                              // e.g. "kg/cm²" (empty for text)
  expression?: string                       // Formula if type=expression (references other field IDs)
  order: number                             // Display order within group
}

interface ErrorConfig {
  masterFieldId: string   // Which master field to use for error calc
  uucFieldId: string      // Which UUC field to use for error calc
  formula: 'A-B' | 'B-A'  // A = selected master field, B = selected UUC field
  unit: string             // Unit for the error column
}
```

### Updated Parameter

```typescript
interface Parameter {
  // ...existing fields (parameterName, parameterUnit, range, accuracy, etc.)...
  tableName: string                       // Custom table heading for certificate PDF
  fieldDefinitions: FieldDefinition[]     // Column schema for this parameter
  errorConfig: ErrorConfig                // Which fields compute error
  results: CalibrationResultRow[]         // Dynamic rows
  // DEPRECATED: showAfterAdjustment (replaced by fieldDefinitions)
}
```

### Updated CalibrationResult → CalibrationResultRow

```typescript
interface CalibrationResultRow {
  id: string
  pointNumber: number
  values: Record<string, string>    // fieldDefinition.id → entered value
  errorObserved: number | null      // Computed from errorConfig
  isOutOfLimit: boolean             // Computed from error vs accuracy
}
```

---

## Behavior Details

### Column Setup

- **Default state:** When a parameter is first created, `fieldDefinitions` is pre-populated with one Master numeric field and one UUC numeric field, both using `parameterUnit` as their unit. `errorConfig` auto-selects these two fields.
- **Adding a field:** "Add Master Field" / "Add UUC Field" appends a new `FieldDefinition` with empty name, type `numeric`, and empty unit.
- **Removing a field:** If the removed field is referenced by `errorConfig`, clear that reference and show a warning to re-select.
- **Expression fields:** When type is `expression`, show a formula input that can reference other field IDs (e.g., `{field1} * 0.001`). Expression fields are read-only in the data table and computed on input.

### Error Computation

- **Field A dropdown** only shows Master fields where `type === 'numeric'`
- **Field B dropdown** only shows UUC fields where `type === 'numeric'`
- Error is computed as: `formula === 'A-B' ? valueA - valueB : valueB - valueA`
- Error is compared against accuracy limits (existing logic) using `errorConfig.unit`

### Table Rendering

- **Grouped headers:** Master fields grouped under "Master Instrument", UUC fields grouped under "UUC"
- **Sub-headers:** Field name row, then unit row beneath
- **Cell rendering by type:**
  - `numeric` → number input with precision enforcement (existing least count logic)
  - `text` → plain text input
  - `expression` → read-only computed cell
- **Fixed columns:** Sl. No (always first), Error Observed (always after all instrument fields)
- **Trail No column:** Present if the parameter uses trails (existing behavior)

### Migration / Backward Compatibility

- Existing certificates with old `CalibrationResult` shape need migration
- Map `standardReading` → a Master numeric field, `beforeAdjustment` → a UUC numeric field, `afterAdjustment` → a second UUC numeric field (if `showAfterAdjustment` was true)
- Migration can happen on load (in the `mapApiToForm` function in the edit page)

---

## Open Items

<!-- Add additional requirements, edge cases, or decisions needed below -->

