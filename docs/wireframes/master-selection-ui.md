# Master Instrument Selection UI - Wireframe

## Full Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Master Instrument Selection                                          ✕     │
└─────────────────────────────────────────────────────────────────────────────┘

UUC PARAMETERS REFERENCE (Collapsible Summary)
┌─────────────────────────────────────────────────────────────────────────────┐
│  ▼ Selected UUC Parameters (this filters available masters)                │
│                                                                             │
│  Parameter 1: Pressure (Range: 0–100 bar ±0.5%)                           │
│  Parameter 2: Temperature (Range: 20–50°C ±1°C)                           │
│  Parameter 3: RTD (Subtype: Pt-100, Range: -50–200°C ±0.1°C)             │
│                                                                             │
│  [Eligible masters must cover ALL these parameters and ranges]             │
└─────────────────────────────────────────────────────────────────────────────┘


MASTER INSTRUMENTS AVAILABLE
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Filter Options:                                                           │
│  ┌─────────────────────┐  ┌──────────────────┐  ┌──────────────┐          │
│  │ Category      ▼     │  │ Usage        ▼   │  │ Status   ▼   │          │
│  │ [All Categories]    │  │ [All]            │  │ [Valid]      │          │
│  └─────────────────────┘  └──────────────────┘  └──────────────┘          │
│                                    [Clear Filters]                         │
│                                                                             │
│  Showing: 3 of 45 eligible instruments                                    │
│           (42 filtered out - don't cover required range/accuracy)          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


ELIGIBLE MASTERS LIST
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  [ ] Asset 1000 ─ Digital Pressure Gauge (Fluke TX 430-1)                 │
│      ✓ Pressure, ✓ Temperature, ✓ RTD                                     │
│      Status: VALID  |  Due: 2027-03-15  |  Category: Mechanical          │
│                                                                             │
│  [ ] Asset 1008 ─ Pressure Calibrator (Fluke 5650A)                       │
│      ✓ Pressure, ✓ Temperature, ✓ RTD                                     │
│      Status: VALID  |  Due: 2026-12-20  |  Category: Electro-Technical   │
│                                                                             │
│  [ ] Asset 1020 ─ Multi-Function Source (Fluke 5500A)                     │
│      ✓ Pressure, ✓ Temperature, ✓ RTD                                     │
│      Status: EXPIRING_SOON (45d)  |  Due: 2026-10-17                      │
│                                                                             │
│  [Load more...]                                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


SELECTED MASTER INSTRUMENT DETAILS
┌─────────────────────────────────────────────────────────────────────────────┐
│  [✓ Asset 1000] Digital Pressure Gauge (Fluke TX 430-1)                    │
│  ────────────────────────────────────────────────────────────────────────   │
│                                                                             │
│  Basic Info:                                                               │
│  ├─ Make/Model: Fluke / TX 430-1                                          │
│  ├─ Serial No.: NVE12502806                                               │
│  ├─ Asset No.: 1000 HTAIPL/L                                              │
│  ├─ Category: Mechanical                                                   │
│  ├─ Calibrated At: Mechanical Lab                                          │
│  ├─ Report No.: VILLP/24-25/T-0184                                         │
│  ├─ Next Due: 2027-03-15                                                   │
│  └─ Status: ✓ VALID                                                        │
│                                                                             │
│  ┌─ Capability Profiles ────────────────────────────────────────────────┐  │
│  │                                                                      │  │
│  │  ▼ Profile 1: PRESSURE (measuring)                                  │  │
│  │    Unit: bar  |  Range: 0–1000 bar                                  │  │
│  │    Role: Measuring                                                  │  │
│  │                                                                      │  │
│  │    ┌─ Range Buckets ──────────────────────────────────────────┐    │  │
│  │    │                                                           │    │  │
│  │    │ Bucket 1: 0–100 bar                                      │    │  │
│  │    │ ├─ Least Count: 0.01 bar                                │    │  │
│  │    │ └─ Accuracy: ±0.1%FS                                    │    │  │
│  │    │                                                           │    │  │
│  │    │ Bucket 2: 100–500 bar                                    │    │  │
│  │    │ ├─ Least Count: 0.05 bar                                │    │  │
│  │    │ └─ Accuracy: ±0.15%FS                                   │    │  │
│  │    │                                                           │    │  │
│  │    │ Bucket 3: 500–1000 bar                                   │    │  │
│  │    │ ├─ Least Count: 0.1 bar                                 │    │  │
│  │    │ └─ Accuracy: ±0.2%FS                                    │    │  │
│  │    │                                                           │    │  │
│  │    └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                      │  │
│  │  ▼ Profile 2: TEMPERATURE (measuring)                               │  │
│  │    Unit: °C  |  Range: -50–200°C                                    │  │
│  │    Role: Measuring                                                  │  │
│  │                                                                      │  │
│  │    ┌─ Range Buckets ──────────────────────────────────────────┐    │  │
│  │    │                                                           │    │  │
│  │    │ Bucket 1: -50–0°C                                        │    │  │
│  │    │ ├─ Least Count: 0.1°C                                   │    │  │
│  │    │ └─ Accuracy: ±0.3°C                                     │    │  │
│  │    │                                                           │    │  │
│  │    │ Bucket 2: 0–100°C                                        │    │  │
│  │    │ ├─ Least Count: 0.1°C                                   │    │  │
│  │    │ └─ Accuracy: ±0.2°C                                     │    │  │
│  │    │                                                           │    │  │
│  │    │ Bucket 3: 100–200°C                                      │    │  │
│  │    │ ├─ Least Count: 0.5°C                                   │    │  │
│  │    │ └─ Accuracy: ±0.5°C                                     │    │  │
│  │    │                                                           │    │  │
│  │    └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                      │  │
│  │  ▼ Profile 3: RTD (source)                                         │  │
│  │    Unit: °C  |  Subtypes: [Pt-100, Pt-46, Pt-200]                  │  │
│  │    Range: -200–500°C                                               │  │
│  │    Role: Source                                                    │  │
│  │                                                                      │  │
│  │    ┌─ Select Subtype ──────────────────┐                          │  │
│  │    │ Pt-100               ✓ (Selected) │                          │  │
│  │    │ Pt-46                            │                          │  │
│  │    │ Pt-200                           │                          │  │
│  │    └────────────────────────────────────┘                          │  │
│  │                                                                      │  │
│  │    ┌─ Range Buckets (Pt-100) ───────────────────────────────┐      │  │
│  │    │                                                         │      │  │
│  │    │ Bucket 1: -200–0°C                                      │      │  │
│  │    │ ├─ Least Count: 0.1°C                                 │      │  │
│  │    │ └─ Accuracy: ±0.1°C                                   │      │  │
│  │    │                                                         │      │  │
│  │    │ Bucket 2: 0–500°C                                       │      │  │
│  │    │ ├─ Least Count: 0.1°C                                 │      │  │
│  │    │ └─ Accuracy: ±0.15°C                                  │      │  │
│  │    │                                                         │      │  │
│  │    └─────────────────────────────────────────────────────────┘      │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  [Remove Master]  [Add Another Master]                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


ACTIONS
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                                      [Cancel]  [Save Selection]            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. UUC Parameters Reference (Collapsible)
```
┌─────────────────────────────────────────────────────┐
│ ▼ Selected UUC Parameters                           │
│                                                     │
│ This shows the filter criteria that masters must   │
│ meet to be eligible.                               │
│                                                     │
│ • Pressure (Range: 0–100 bar, Accuracy: ±0.5%)   │
│ • Temperature (Range: 20–50°C, Accuracy: ±1°C)   │
│ • RTD (Subtype: Pt-100, Range: -50–200°C)        │
│                                                     │
│ ✓ 3 masters are eligible for ALL parameters       │
│ ✗ 42 masters cannot meet these requirements       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Behavior**:
- Collapsed by default (to save space)
- Click to expand/collapse
- Shows eligibility stats
- Helps user understand filtering logic

---

### 2. Filter Bar
```
┌─────────────────────────────────────────────────────┐
│  Filter by:                                         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │Category▼ │  │Usage  ▼  │  │Status ▼  │         │
│  │All       │  │All       │  │Valid     │         │
│  └──────────┘  └──────────┘  └──────────┘         │
│                                                     │
│  [Search: Asset # or Model ____________]           │
│                                                     │
│  [Clear All Filters]                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Behavior**:
- Dropdowns filter the list below
- Search by asset number or model name
- "Clear All Filters" resets to show all eligible masters
- Always shows count: "3 of 45 eligible"

---

### 3. Eligible Masters List (Card View)
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│ [ ] Asset 1000                                      │
│     Digital Pressure Gauge (Fluke TX 430-1)        │
│     Serial: NVE12502806                            │
│                                                     │
│     ✓ Pressure, ✓ Temperature, ✓ RTD              │
│     (Shows which UUC parameters this master covers)│
│                                                     │
│     Status: VALID (45 days) | Due: 2027-03-15    │
│     Category: Mechanical                           │
│                                                     │
│ [ ] Asset 1008                                      │
│     Pressure Calibrator (Fluke 5650A)              │
│     ...                                             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Behavior**:
- Checkbox to select master
- Shows asset number, description, serial
- Shows which parameters are covered (✓/✗)
- Shows status badge + due date
- Click row to expand details below

---

### 4. Selected Master Details (Capability Profiles)

#### 4a. Basic Info Section
```
┌─────────────────────────────────────────────────────┐
│ [✓ Asset 1000] Digital Pressure Gauge               │
│ Fluke TX 430-1                                      │
│                                                     │
│ Make/Model:    Fluke / TX 430-1                    │
│ Serial No.:    NVE12502806                         │
│ Asset No.:     1000 HTAIPL/L                       │
│ Category:      Mechanical                          │
│ Calibrated:    Mechanical Lab                      │
│ Report No.:    VILLP/24-25/T-0184                  │
│ Next Due:      2027-03-15                          │
│ Status:        ✓ VALID                             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 4b. Capability Profiles (Expandable)
```
┌─────────────────────────────────────────────────────┐
│  CAPABILITY PROFILES                                │
│                                                     │
│  ▼ Profile 1: PRESSURE (measuring)                 │
│    └─ Unit: bar | Range: 0–1000 bar               │
│                                                     │
│    ┌─ Range Buckets ──────────────────────────┐   │
│    │                                           │   │
│    │ Bucket 1: 0–100 bar                       │   │
│    │ • Least Count: 0.01 bar                  │   │
│    │ • Accuracy: ±0.1%FS                      │   │
│    │                                           │   │
│    │ Bucket 2: 100–500 bar                     │   │
│    │ • Least Count: 0.05 bar                  │   │
│    │ • Accuracy: ±0.15%FS                     │   │
│    │                                           │   │
│    │ Bucket 3: 500–1000 bar                    │   │
│    │ • Least Count: 0.1 bar                   │   │
│    │ • Accuracy: ±0.2%FS                      │   │
│    │                                           │   │
│    └───────────────────────────────────────────┘   │
│                                                     │
│  ▶ Profile 2: TEMPERATURE (measuring) [collapsed] │
│  ▶ Profile 3: RTD (source) [collapsed]            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**For Thermocouple/RTD with Subtypes**:
```
┌─────────────────────────────────────────────────────┐
│  ▼ Profile 3: THERMOCOUPLE (source)                │
│    └─ Unit: °C | Range: -200–1372°C               │
│                                                     │
│    Select Subtype:                                  │
│    ┌─────────────────────────────────────────┐    │
│    │ Type K (Chromel-Alumel)           ✓     │    │
│    │ Type J (Iron-Constantan)               │    │
│    │ Type T (Copper-Constantan)             │    │
│    │ Type E (Chromel-Constantan)            │    │
│    │ Type R (Pt/13% Rh-Pt)                  │    │
│    └─────────────────────────────────────────┘    │
│    (Click to change subtype buckets below)         │
│                                                     │
│    ┌─ Range Buckets (Type K) ──────────────┐     │
│    │                                        │     │
│    │ Bucket 1: -200–0°C                    │     │
│    │ • Least Count: 1°C                   │     │
│    │ • Accuracy: ±0.47°C                  │     │
│    │                                        │     │
│    │ Bucket 2: 0–100°C                     │     │
│    │ • Least Count: 1°C                   │     │
│    │ • Accuracy: ±0.47°C                  │     │
│    │                                        │     │
│    │ ... (more buckets)                    │     │
│    │                                        │     │
│    └────────────────────────────────────────┘     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Interaction Flow

### User Journey: Select Master with Pre-filtering

```
1. User Opens Certificate Edit Page
   ↓
2. Sees UUC Parameters (already filled from earlier)
   ├─ Temperature: 20–50°C ±1°C
   ├─ Pressure: 0–100 bar ±0.5%
   └─ RTD (Pt-100): -50–200°C ±0.1°C
   ↓
3. System Pre-filters Masters
   └─ "Only show masters that can measure ALL of these"
   ↓
4. Master Selection UI Opens
   ├─ Shows: "3 of 45 masters are eligible"
   ├─ Lists: Asset 1000, Asset 1008, Asset 1020
   └─ Hides: 42 other masters (grayed out or not shown)
   ↓
5. User Clicks "Asset 1000"
   ├─ Checkbox becomes checked
   └─ Details panel expands below
   ↓
6. User Sees Capability Profiles
   ├─ Pressure profile: 3 buckets with least count/accuracy
   ├─ Temperature profile: 3 buckets
   └─ RTD profile: 4 buckets, can select Pt-100/Pt-46/Pt-200
   ↓
7. User Confirms Selection
   ├─ Clicks "Save Selection"
   ├─ Data stored in form
   └─ Can proceed to next section
   ↓
8. Results Section Uses This Data
   ├─ Shows least count for each parameter
   ├─ Shows accuracy for each parameter
   └─ Uses for data entry validation
```

---

## Responsive Behavior

### Desktop (1200px+)
- Full 3-column layout
- UUC reference on left, masters list center, details right
- All profiles visible

### Tablet (768px–1199px)
- 2-column layout
- Masters list full width, details below
- Profiles in accordion

### Mobile (< 768px)
- Single column, full width
- Masters as collapsible cards
- Profiles in accordion with tabs per profile

---

## Key Visual Elements

### Status Badges
```
✓ VALID          – Green checkmark, "calibration current"
⚠️ EXPIRING_SOON  – Orange clock, "X days remaining"
✗ EXPIRED        – Red X, "overdue recalibration"
🔧 UNDER_RECAL    – Gray wrench, "currently being recalibrated"
⚠️ SERVICE        – Orange triangle, "service request pending"
```

### Eligibility Indicators
```
✓ Parameter Name  – Master covers this parameter
✗ Parameter Name  – Master does NOT cover (grayed out)
```

### Parameter Icons (Optional)
```
🌡️  Temperature
📏  Pressure
⚡  Voltage/Current
🔌  Resistance/Frequency
```

---

## Validation & Feedback

### Pre-filtering Logic Display
```
Showing 3 of 45 eligible masters

Why only 3?
├─ Master must have Pressure capability
├─ Master must have Temperature capability
├─ Master must have RTD capability
├─ Pressure range: 0–1000 bar (to cover your 0–100)
├─ Accuracy: ±0.1%FS (to cover your ±0.5%)
├─ Temperature range: -50–200°C (to cover your 20–50°C)
└─ Accuracy: ±0.2°C (to cover your ±1°C)
```

### Ineligible Master (Grayed Out)
```
[ ] Asset 1050 ─ Temperature Probe (Fluke 1586A)
    ⚠️ Cannot measure: Pressure, RTD
    Status: EXPIRED
    
    → This master is ineligible because:
      1. Does not have Pressure capability
      2. Calibration expired (2025-12-31)
```

### Alert for Missing Coverage
```
⚠️ No masters cover your selected parameters!

Your UUC requires:
• Pressure: 0–1000 bar ±0.1%
• Frequency: 50–5000 Hz ±0.01%

Recommendation:
├─ Relax the range requirements (if possible)
├─ Accept lower accuracy (if applicable)
└─ Add new master instruments to the registry
```

---

## Accessibility

- **Keyboard Navigation**: Tab through masters, Enter to select, arrow keys to browse
- **Screen Reader**: "Asset 1000, Digital Pressure Gauge, Fluke TX 430-1, eligible, 3 of 45"
- **Color Contrast**: Ensure badges meet WCAG AA
- **Focus Indicators**: Clear focus ring on all interactive elements
- **Labels**: All inputs have associated labels

