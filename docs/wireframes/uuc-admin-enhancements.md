# UUC Details & Admin Page - Wireframes

## UUC Section - "Not Applicable" Enhancements

### Before (Current)
```
┌─────────────────────────────────────────────────────┐
│ UUC INSTRUMENT DETAILS                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Description: [___________________________]          │
│ Make:        [___________________________]          │
│ Model:       [___________________________]          │
│ Serial Number: [___________________________]  (req) │
│ Instrument ID: [___________________________]  (req) │
│                                                     │
│ Location:    [___________________________]          │
│ Machine Name: [___________________________]          │
│                                                     │
│ Operating Range:                                    │
│ Min: [______] Max: [______] Unit: [______]         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### After (Enhanced with "Not Applicable")
```
┌─────────────────────────────────────────────────────┐
│ UUC INSTRUMENT DETAILS                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Description: [___________________________]          │
│ Make:        [___________________________]          │
│ Model:       [___________________________]          │
│                                                     │
│ Serial Number:                                      │
│ ┌──────────────────────────────────────────┐       │
│ │ [___________________________]             │       │
│ │ ☐ Not Applicable                         │       │
│ │   When checked: Serial # not required    │       │
│ └──────────────────────────────────────────┘       │
│                                                     │
│ Instrument ID:                                      │
│ ┌──────────────────────────────────────────┐       │
│ │ [___________________________]             │       │
│ │ ☐ Not Applicable                         │       │
│ │   When checked: Instrument ID not req    │       │
│ └──────────────────────────────────────────┘       │
│                                                     │
│ Location:    [___________________________]          │
│ Machine Name: [___________________________]          │
│                                                     │
│ Operating Range:                                    │
│ ┌──────────────────────────────────────────┐       │
│ │ Min: [______] Max: [______] Unit: [___] │       │
│ │ ☐ Not Applicable                         │       │
│ │                                           │       │
│ │ ℹ️  When "N/A" checked:                   │       │
│ │   At least ONE calibration point in      │       │
│ │   [measurement range] is required        │       │
│ └──────────────────────────────────────────┘       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## UUC Parameter Selection - Expanded Types

### Before (22 types)
```
┌──────────────────────────────┐
│ Parameter Type ▼             │
│ ┌──────────────────────────┐ │
│ │ Temperature              │ │
│ │ Humidity                 │ │
│ │ Pressure                 │ │
│ │ Voltage DC               │ │
│ │ Voltage AC               │ │
│ │ Current DC               │ │
│ │ Current AC               │ │
│ │ Resistance               │ │
│ │ Frequency                │ │
│ │ ... (13 more)            │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### After (30+ types with subtypes)
```
┌────────────────────────────────────┐
│ Parameter Type ▼                   │
│ ┌────────────────────────────────┐ │
│ │ Temperature                    │ │
│ │                                │ │
│ │ ├─ RTD                        │ │
│ │ │  └─ Subtype: Pt-100 / Pt-46 │ │
│ │ │     / Pt-200 / Cu-53 / ...  │ │
│ │ │                              │ │
│ │ ├─ Thermocouple              │ │
│ │ │  └─ Subtype: Type K/J/T/... │ │
│ │ │                              │ │
│ │ └─ [Standard Temperature]      │ │
│ │                                │ │
│ │ Pressure                       │ │
│ │ ├─ Pressure (Standard)         │ │
│ │ ├─ Differential Pressure       │ │
│ │ └─ Vacuum                      │ │
│ │                                │ │
│ │ Electrical                     │ │
│ │ ├─ AC/DC Voltage               │ │
│ │ ├─ AC/DC Current               │ │
│ │ ├─ Frequency                   │ │
│ │ ├─ Resistance                  │ │
│ │ ├─ Capacitance                 │ │
│ │ ├─ Inductance                  │ │
│ │ └─ Power                       │ │
│ │                                │ │
│ │ Mechanical                     │ │
│ │ ├─ Pressure (Standard)         │ │
│ │ ├─ Speed (Contact)             │ │
│ │ ├─ Speed (Non-Contact)         │ │
│ │ ├─ Air Velocity                │ │
│ │ ├─ Force / Torque              │ │
│ │ └─ Mass                        │ │
│ │                                │ │
│ │ Other                          │ │
│ │ ├─ Relative Humidity           │ │
│ │ ├─ Flow                        │ │
│ │ ├─ Particle Count              │ │
│ │ ├─ Sound Level                 │ │
│ │ └─ ... (more)                  │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

### Subtype Selection (When Applicable)
```
┌────────────────────────────────────┐
│ Parameter: RTD                      │
│                                    │
│ Subtype: [Pt-100 ▼]               │
│ ┌────────────────────────────────┐ │
│ │ Pt-100 ✓ (platinum, 100Ω@0°C) │ │
│ │ Pt-46 (platinum, 46Ω@0°C)     │ │
│ │ Pt-200 (platinum, 200Ω@0°C)   │ │
│ │ Cu-53 (copper, 53Ω@0°C)       │ │
│ │ Ni-100 (nickel, 100Ω@0°C)     │ │
│ │ Ni-120 (nickel, 120Ω@0°C)     │ │
│ └────────────────────────────────┘ │
│                                    │
│ Unit: [°C ▼]                      │
│ Available units for RTD:           │
│ • °C (Celsius)                     │
│ • °F (Fahrenheit)                  │
│ • K (Kelvin)                       │
│ • Ω (Ohms)                         │
│                                    │
│ Range:                             │
│ Min: [-200    ] Max: [1000]       │
│ Unit: [°C     ]                   │
│                                    │
└────────────────────────────────────┘
```

---

## Section 01 - Calibration Due Date Format Selection

### Current
```
┌─────────────────────────────────┐
│ Recommended Calibration Due Date│
│                                 │
│ [02/09/2026] (date input)       │
│                                 │
└─────────────────────────────────┘
```

### Enhanced with Format Selection
```
┌──────────────────────────────────────────┐
│ Recommended Calibration Due Date         │
│                                          │
│ Date: [02/09/2026] (date input)         │
│                                          │
│ PDF Format (how it appears on certificate):│
│ ┌──────────────────────────────────────┐ │
│ │ ○ DD/MM/YYYY (02/09/2026) ✓         │ │
│ │ ○ DD-MM-YYYY (02-09-2026)           │ │
│ │ ○ MM/DD/YYYY (09/02/2026)           │ │
│ │ ○ DD MonthName YYYY (02 Sept 2026) │ │
│ │ ○ MonthName DD, YYYY (Sept 02, 2026)│ │
│ │ ○ YYYY-MM-DD (2026-09-02)           │ │
│ │ ○ MM/YYYY (09/2026)                  │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Preview in PDF: "02 September 2026"     │
│                                          │
│ ℹ️  This format will be used when       │
│   generating the calibration certificate │
│   PDF. Different formats are preferred   │
│   by different regions/customers.        │
│                                          │
└──────────────────────────────────────────┘
```

---

## Admin Instruments Page - Capability Profiles Display

### Current State
```
┌──────────────────────────────────────────────────┐
│ Instrument #1000: Digital Pressure Gauge         │
├──────────────────────────────────────────────────┤
│                                                  │
│ Basic Info:                                      │
│ • Make: Fluke                                    │
│ • Model: TX 430-1                                │
│ • Serial: NVE12502806                           │
│ • Asset #: 1000 HTAIPL/L                        │
│                                                  │
│ Range Data:                                      │
│ • Pressure, 0–700 bar                           │
│ • Pressure, 0–100 bar                           │
│ • Pressure, 100–500 bar                         │
│ • Pressure, 500–700 bar                         │
│ • Temperature, -50–200°C                        │
│ • Temperature, -50–0°C                          │
│ • Temperature, 0–100°C                          │
│ • Temperature, 100–200°C                        │
│ • RTD, -200–500°C                               │
│                                                  │
│ Parameter Capabilities: [Pressure, Temp, RTD]  │
│ Parameter Roles: [measuring, source]            │
│                                                  │
└──────────────────────────────────────────────────┘
```

### New State (Hierarchical)
```
┌──────────────────────────────────────────────────┐
│ Instrument #1000: Digital Pressure Gauge         │
├──────────────────────────────────────────────────┤
│                                                  │
│ BASIC INFO                                       │
│ ┌──────────────────────────────────────────────┐│
│ │ • Make: Fluke                               ││
│ │ • Model: TX 430-1                           ││
│ │ • Serial: NVE12502806                       ││
│ │ • Asset #: 1000 HTAIPL/L                    ││
│ │ • Category: Mechanical                      ││
│ │ • Calibrated At: Mechanical Lab             ││
│ │ • Report #: VILLP/24-25/T-0184              ││
│ │ • Next Due: 2027-03-15                      ││
│ │ • Status: ✓ VALID (365 days)                ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ CAPABILITY PROFILES (Hierarchical)              │
│ ┌──────────────────────────────────────────────┐│
│ │                                              ││
│ │ ▼ Capability Profile 1: PRESSURE            ││
│ │   ├─ Parameter: Pressure                    ││
│ │   ├─ Role: Measuring                        ││
│ │   ├─ Unit: bar                              ││
│ │   ├─ Overall Range: 0–1000 bar              ││
│ │   ├─ Range Inclusive: [true–true]           ││
│ │   │                                          ││
│ │   └─ Range Buckets:                         ││
│ │      │                                       ││
│ │      ├─ [▼] Bucket B1: 0–100 bar           ││
│ │      │     • Least Count: 0.01 bar         ││
│ │      │     • Accuracy: ±0.1%FS             ││
│ │      │                                      ││
│ │      ├─ [▼] Bucket B2: 100–500 bar         ││
│ │      │     • Least Count: 0.05 bar         ││
│ │      │     • Accuracy: ±0.15%FS            ││
│ │      │                                      ││
│ │      └─ [▼] Bucket B3: 500–1000 bar        ││
│ │            • Least Count: 0.1 bar          ││
│ │            • Accuracy: ±0.2%FS             ││
│ │                                             ││
│ │ ▼ Capability Profile 2: TEMPERATURE        ││
│ │   ├─ Parameter: Temperature                ││
│ │   ├─ Role: Measuring                       ││
│ │   ├─ Unit: °C                              ││
│ │   ├─ Overall Range: -50–200°C              ││
│ │   │                                         ││
│ │   └─ Range Buckets:                        ││
│ │      │                                      ││
│ │      ├─ [▼] Bucket B1: -50–0°C            ││
│ │      │     • Least Count: 0.1°C           ││
│ │      │     • Accuracy: ±0.3°C             ││
│ │      │                                     ││
│ │      ├─ [▼] Bucket B2: 0–100°C            ││
│ │      │     • Least Count: 0.1°C           ││
│ │      │     • Accuracy: ±0.2°C             ││
│ │      │                                     ││
│ │      └─ [▼] Bucket B3: 100–200°C          ││
│ │            • Least Count: 0.5°C           ││
│ │            • Accuracy: ±0.5°C             ││
│ │                                            ││
│ │ ▼ Capability Profile 3: RTD (source)       ││
│ │   ├─ Parameter: RTD                        ││
│ │   ├─ Role: Source                          ││
│ │   ├─ Unit: °C                              ││
│ │   ├─ Overall Range: -200–500°C             ││
│ │   ├─ Subtypes Available: [Pt-100, Pt-46]  ││
│ │   │                                         ││
│ │   └─ Range Buckets (Pt-100):               ││
│ │      │                                      ││
│ │      ├─ [▼] Bucket B1: -200–0°C           ││
│ │      │     • Least Count: 0.1°C           ││
│ │      │     • Accuracy: ±0.1°C             ││
│ │      │                                     ││
│ │      └─ [▼] Bucket B2: 0–500°C            ││
│ │            • Least Count: 0.1°C           ││
│ │            • Accuracy: ±0.15°C            ││
│ │                                            ││
│ │   Alternative Subtype:                    ││
│ │   [View Pt-46 buckets]                    ││
│ │                                            ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ CERTIFICATE PDFs                               │
│ ┌──────────────────────────────────────────────┐│
│ │ Uploaded Certificates:                      ││
│ │                                              ││
│ │ ┌──────────────────────────────────────┐   ││
│ │ │ 📄 VILLP_24-25_T-0184.pdf            │   ││
│ │ │    Uploaded: 2026-02-26               │   ││
│ │ │    Size: 2.3 MB                       │   ││
│ │ │    [View] [Download] [Delete]         │   ││
│ │ └──────────────────────────────────────┘   ││
│ │                                              ││
│ │ [+ Upload New Certificate]                  ││
│ │                                              ││
│ └──────────────────────────────────────────────┘│
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## Results Section - Operating Range "Not Applicable" Hint

### Before
```
┌──────────────────────────────────────────────────┐
│ PARAMETER 1: Pressure                            │
│ Range: 0–100 bar                                 │
│ Operating Range: 20–80 bar                       │
│                                                  │
│ Measurement Data:                                │
│ ┌──────────┬──────────┬──────────┬────────────┐ │
│ │ Point # │ Trail No │ Master   │ UUC  │ Err  │ │
│ ├──────────┼──────────┼──────────┼──────┼──────┤ │
│ │ 01       │ T-1      │ 25.0     │ 25.1 │ 0.1  │ │
│ │ 02       │ T-1      │ 50.0     │ 49.9 │ 0.1  │ │
│ │ 03       │ T-2      │ 75.0     │ 75.2 │ 0.2  │ │
│ └──────────┴──────────┴──────────┴──────┴──────┘ │
│                                                  │
└──────────────────────────────────────────────────┘
```

### After (with Validation Hint)
```
┌──────────────────────────────────────────────────┐
│ PARAMETER 1: Pressure                            │
│ Range: 0–100 bar                                 │
│ Operating Range: 20–80 bar ✓                     │
│                                                  │
│ Measurement Data:                                │
│ ┌──────────┬──────────┬──────────┬────────────┐ │
│ │ Point # │ Trail No │ Master   │ UUC  │ Err  │ │
│ ├──────────┼──────────┼──────────┼──────┼──────┤ │
│ │ 01       │ T-1      │ 25.0     │ 25.1 │ 0.1  │ │ ✓ in range
│ │ 02       │ T-1      │ 50.0     │ 49.9 │ 0.1  │ │ ✓ in range
│ │ 03       │ T-2      │ 75.0     │ 75.2 │ 0.2  │ │ ✓ in range
│ └──────────┴──────────┴──────────┴──────┴──────┘ │
│                                                  │
│ Status: ✓ VALID                                  │
│ (All 3 points within operating range 20–80 bar) │
│                                                  │
└──────────────────────────────────────────────────┘
```

### With "Not Applicable" Operating Range
```
┌──────────────────────────────────────────────────┐
│ PARAMETER 1: Pressure                            │
│ Range: 0–100 bar                                 │
│ Operating Range: Not Applicable ⚠️               │
│                                                  │
│ ℹ️  Constraint: At least ONE data point must be  │
│   within measurement range [0–100 bar]           │
│                                                  │
│ Measurement Data:                                │
│ ┌──────────┬──────────┬──────────┬────────────┐ │
│ │ Point # │ Trail No │ Master   │ UUC  │ Err  │ │
│ ├──────────┼──────────┼──────────┼──────┼──────┤ │
│ │ 01       │ T-1      │ 25.0     │ 25.1 │ 0.1  │ │ ✓ in range
│ │ 02       │ T-1      │ 150.0    │ 150.2│ 0.2  │ │ ✗ OUT OF RANGE
│ │ 03       │ T-2      │ 200.0    │ 200.1│ 0.1  │ │ ✗ OUT OF RANGE
│ └──────────┴──────────┴──────────┴──────┴──────┘ │
│                                                  │
│ Status: ✓ VALID                                  │
│ (At least 1 point [25.0] is in range 0–100 bar) │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Failed Constraint (All Points Out of Range)
```
┌──────────────────────────────────────────────────┐
│ PARAMETER 1: Pressure                            │
│ Range: 0–100 bar                                 │
│ Operating Range: Not Applicable ⚠️               │
│                                                  │
│ ❌ VALIDATION FAILED                             │
│                                                  │
│ ℹ️  Constraint: At least ONE data point must be  │
│   within measurement range [0–100 bar]           │
│   Currently: ZERO points in range               │
│                                                  │
│ Measurement Data:                                │
│ ┌──────────┬──────────┬──────────┬────────────┐ │
│ │ Point # │ Trail No │ Master   │ UUC  │ Err  │ │
│ ├──────────┼──────────┼──────────┼──────┼──────┤ │
│ │ 01       │ T-1      │ 150.0    │ 150.2│ 0.2  │ │ ✗ OUT
│ │ 02       │ T-1      │ 200.0    │ 199.9│ 0.1  │ │ ✗ OUT
│ │ 03       │ T-2      │ 250.0    │ 250.1│ 0.1  │ │ ✗ OUT
│ └──────────┴──────────┴──────────┴──────┴──────┘ │
│                                                  │
│ 🔧 How to Fix:                                   │
│   • Add at least one measurement point in the   │
│     range [0–100 bar]                           │
│   • OR change "Operating Range" from            │
│     "Not Applicable" to specify actual range    │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## Design Notes

### Color Coding
- **Green (✓)**: Valid, eligible, in range
- **Orange (⚠️)**: Warning, constraint, limited eligibility
- **Red (✗)**: Error, invalid, out of range, expired
- **Gray**: Ineligible, disabled, not applicable

### Icons
- `✓` = Valid/Covered
- `✗` = Invalid/Not covered
- `⚠️` = Warning/Constraint
- `ℹ️` = Information/Hint
- `❌` = Error/Failed validation
- `🔧` = Action/Fix suggestion
- `▼/▶` = Expandable/Collapsible
- `📄` = Document/File

### Spacing & Layout
- Card-based design for capability profiles
- Indentation (2–4 levels) for hierarchy
- Bullet points for lists
- Tables for structured data (buckets)

### Responsive Considerations
- Desktop: Full hierarchy visible, collapsible buckets
- Tablet: Some profiles collapsed by default
- Mobile: All collapsed, tabs per parameter type

