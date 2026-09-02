# Admin Master Instrument Edit Page - Final Design (16:9) - FIXED

## Screen 1: Basic Info Tab with FIXED Info Banner

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Back    Edit Instrument #1000: Digital Pressure Gauge                 [Save] [✕] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ QUICK STATS BANNER (4 rows × 2 columns - CONSISTENT ACROSS ALL VIEWS)              │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐│
│ │                                                                                  ││
│ │  Asset #: 1000 HTAIPL/L              Status: ✓ VALID (365 days)                ││
│ │  Category: Mechanical                Calibrated At: Mechanical Lab              ││
│ │  Next Due: 03/15/2027                Last Updated: 02/26/2025 by Harshvardhan  ││
│ │  Model: Fluke TX 430-1               Serial: NVE12502806                       ││
│ │                                                                                  ││
│ └──────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│ [Basic Info] [Capabilities] [Certificates] [Metadata] [Audit Log]                 │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ INSTRUMENT IDENTIFICATION                                                           │
│                                                                                     │
│ Description                      │ Category                                         │
│ [Digital Pressure Gauge       ] │ [Mechanical ▼]                                   │
│                                 │                                                  │
│ Make / Manufacturer             │ Model                                             │
│ [Fluke                        ] │ [TX 430-1                                      ] │
│ ☐ Composite: Ind: [___] Sen: [___]                                               │
│                                 │                                                  │
│ Serial Number                   │ Asset Number                                      │
│ [NVE12502806                  ] │ [1000 HTAIPL/L] (Normalized: 1000)               │
│ ☐ Composite: Ind: [___] Sen: [___]                                               │
│                                                                                     │
│ OPERATIONAL DETAILS                                                                 │
│                                                                                     │
│ Usage / Environment             │ Calibrated At (Location)                         │
│ [For Lab                      ] │ [Mechanical Lab              ▼]                  │
│                                 │                                                  │
│ CALIBRATION TRACKING                                                                │
│                                                                                     │
│ Calibration Report No.     │ Date of Calib.      │ Next Due Date                   │
│ [VILLP/24-25/T-0184      ] │ [02/26/2025       ] │ [03/15/2027]                   │
│                                                                                     │
│ REMARKS / SPECIAL STATUS                                                            │
│ [                                                                                ] │
│ [  (Under Recalibration, Service Pending, etc.)                                  ] │
│ [                                                                                ] │
│                                                                                     │
│                                                        [Cancel]  [Save Changes]    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 2: Capabilities Tab with SAME Fixed Banner

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Back    Edit Instrument #1000: Digital Pressure Gauge                 [Save] [✕] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ QUICK STATS BANNER (4 rows × 2 columns - SAME AS ALL TABS)                         │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐│
│ │                                                                                  ││
│ │  Asset #: 1000 HTAIPL/L              Status: ✓ VALID (365 days)                ││
│ │  Category: Mechanical                Calibrated At: Mechanical Lab              ││
│ │  Next Due: 03/15/2027                Last Updated: 02/26/2025 by Harshvardhan  ││
│ │  Model: Fluke TX 430-1               Serial: NVE12502806                       ││
│ │                                                                                  ││
│ └──────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│ [Basic Info] [Capabilities] [Certificates] [Metadata] [Audit Log]                 │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ [+ Add Profile]  [Validate All]  [Collapse All]  [Expand All]                      │
│                                                                                     │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐│
│ │ ▼ CAPABILITY PROFILE 1: PRESSURE (measuring)                            [✎][✕]  ││
│ ├─────────────────────────────────────────────────────────────────────────────────┤│
│ │                                                                                 ││
│ │ Parameter: [Pressure ▼]  Role: [Measuring ▼]  Unit: [bar ▼]                   ││
│ │ Min: [0        ]  Max: [1000     ]  ☑ Min Inc. ☑ Max Inc.                      ││
│ │                                                                                 ││
│ │ RANGE BUCKETS:                                                                  ││
│ │                                                                                 ││
│ │ ┌────┬──────────────────┬──────────────┬─────────────────┬──────────────────┐  ││
│ │ │ ID │ Range            │ Least Count  │ Accuracy        │ Actions          │  ││
│ ├────┼──────────────────┼──────────────┼─────────────────┼──────────────────┤  ││
│ │ B1 │ 0 to 100 bar     │ 0.01 bar     │ ±0.1%FS         │ [✎ Edit] [✕ Del] │  ││
│ │ B2 │ 100 to 500 bar   │ 0.05 bar     │ ±0.15%FS        │ [✎ Edit] [✕ Del] │  ││
│ │ B3 │ 500 to 1000 bar  │ 0.1 bar      │ ±0.2%FS         │ [✎ Edit] [✕ Del] │  ││
│ └────┴──────────────────┴──────────────┴─────────────────┴──────────────────┘  ││
│ │                                                                                 ││
│ │ [+ Add Bucket]                                                                  ││
│ └─────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐│
│ │ ▼ CAPABILITY PROFILE 2: TEMPERATURE (measuring)                        [✎][✕]  ││
│ │  (3 range buckets)  [View]                                                      ││
│ └─────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐│
│ │ ▼ CAPABILITY PROFILE 3: RTD (source) - WITH SUBTYPES                  [✎][✕]  ││
│ │ Available Subtypes: ☑ Pt-100  ☑ Pt-46  ☑ Pt-200                                ││
│ │ ▼ Subtype: Pt-100 [3 buckets]  ▼ Subtype: Pt-46 [3 buckets]  ...              ││
│ └─────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│                                                        [Cancel]  [Save Changes]    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 3: Certificates Tab with SAME Fixed Banner + Active/Archived Sections

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Back    Edit Instrument #1000: Digital Pressure Gauge                 [Save] [✕] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ QUICK STATS BANNER (4 rows × 2 columns - SAME AS ALL TABS)                         │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐│
│ │                                                                                  ││
│ │  Asset #: 1000 HTAIPL/L              Status: ✓ VALID (365 days)                ││
│ │  Category: Mechanical                Calibrated At: Mechanical Lab              ││
│ │  Next Due: 03/15/2027                Last Updated: 02/26/2025 by Harshvardhan  ││
│ │  Model: Fluke TX 430-1               Serial: NVE12502806                       ││
│ │                                                                                  ││
│ └──────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│ [Basic Info] [Capabilities] [Certificates] [Metadata] [Audit Log]                 │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ 🖱️  Drag PDF files here or [Browse Files]                                         │
│                                                                                     │
│ ◀▶ ACTIVE CERTIFICATES (Current Calibration Valid)                                 │
│                                                                                     │
│ ┌──────────────────────────────────────────────────────┐  ┌──────────────────────┐│
│ │ ✓ 📄 VILLP_24-25_T-0184.pdf                          │  │ ✓ 📄 VILLP_24-25_C ││
│ │ Cert #: VILLP/24-25/T-0184                           │  │ Cert #: VILLP/24-25 ││
│ │ Uploaded: 02/26/2025 │ Size: 2.3 MB │ Pages: 4       │  │ Uploaded: 02/27/2025││
│ │ Least Count: 0.01 bar │ Accuracy: ±0.1%FS           │  │ Least Count: 0.05 bar││
│ │ Valid Until: 03/15/2027                              │  │ Valid Until: 03/20/27││
│ │ [View] [DL] [✎] [✕]                                │  │ [View] [DL] [✎] [✕]││
│ │                                                      │  │                      ││
│ └──────────────────────────────────────────────────────┘  └──────────────────────┘│
│                                                                                     │
│ ◀▶ ARCHIVED CERTIFICATES (Expired or Superseded)                                   │
│                                                                                     │
│ ┌──────────────────────────────────────────────────────┐                           │
│ │ ✗ 📄 VILLP_24-25_E-0186.pdf (EXPIRED)                │                           │
│ │ Cert #: VILLP/24-25/E-0186                           │                           │
│ │ Uploaded: 03/01/2025 │ Size: 2.1 MB │ Pages: 4       │                           │
│ │ Least Count: 0.01 bar │ Accuracy: ±0.1%FS           │                           │
│ │ Valid Until: 12/15/2024 (EXPIRED on 02/10/2025)     │                           │
│ │ [View] [DL] [✎] [Restore] [✕]                      │                           │
│ │                                                      │                           │
│ └──────────────────────────────────────────────────────┘                           │
│                                                                                     │
│                                                        [Cancel]  [Save Changes]    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4: PDF Viewer Mode with SAME Fixed Banner

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Back    Edit Instrument #1000: Digital Pressure Gauge                 [Save] [✕] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ QUICK STATS BANNER (4 rows × 2 columns - SAME AS ALL TABS)                         │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐│
│ │                                                                                  ││
│ │  Asset #: 1000 HTAIPL/L              Status: ✓ VALID (365 days)                ││
│ │  Category: Mechanical                Calibrated At: Mechanical Lab              ││
│ │  Next Due: 03/15/2027                Last Updated: 02/26/2025 by Harshvardhan  ││
│ │  Model: Fluke TX 430-1               Serial: NVE12502806                       ││
│ │                                                                                  ││
│ └──────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│ ◀ [Back to Details]  │  ✓ ACTIVE │ VILLP_24-25_T-0184.pdf  │  [p] < 2 of 4 > [n]  │ [x]│
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│                                                                                     │
│                        ┌─────────────────────────────────┐                         │
│                        │                                 │                         │
│                        │   CALIBRATION CERTIFICATE       │                         │
│                        │                                 │                         │
│                        │   Instrument:                  │                         │
│                        │   Digital Pressure Gauge       │                         │
│                        │   Model: TX 430-1              │                         │
│                        │                                 │                         │
│                        │   Least Count: 0.01 bar        │                         │
│                        │   Accuracy: ±0.1%FS            │                         │
│                        │                                 │                         │
│                        │   Calibration Date: 02/26/2025 │                         │
│                        │   Next Due: 03/15/2027         │                         │
│                        │                                 │                         │
│                        │   [PDF Page 2 of 4]            │                         │
│                        │                                 │                         │
│                        └─────────────────────────────────┘                         │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 5: Metadata Tab with SAME Fixed Banner

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Back    Edit Instrument #1000: Digital Pressure Gauge                 [Save] [✕] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ QUICK STATS BANNER (4 rows × 2 columns - SAME AS ALL TABS)                         │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐│
│ │                                                                                  ││
│ │  Asset #: 1000 HTAIPL/L              Status: ✓ VALID (365 days)                ││
│ │  Category: Mechanical                Calibrated At: Mechanical Lab              ││
│ │  Next Due: 03/15/2027                Last Updated: 02/26/2025 by Harshvardhan  ││
│ │  Model: Fluke TX 430-1               Serial: NVE12502806                       ││
│ │                                                                                  ││
│ └──────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│ [Basic Info] [Capabilities] [Certificates] [Metadata] [Audit Log]                 │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ DATA SOURCE & ORIGIN                        LIFECYCLE & TRACKING                   │
│                                                                                     │
│ Source: Master Registry JSON                Created: 2026-01-15 by System          │
│ Registry: master_list_converted.json        Last Updated: 02/26/2025               │
│ Asset Type: [Simple ▼]                      Version: 3                             │
│                                                                                     │
│ Data Completeness:                          Change History:                         │
│ ├─ ✓ Basic Info: 100%                       1. [02/26] Added cert VILLP_24-25     │
│ ├─ ✓ Capabilities: 100% (3 profiles)        2. [02/20] Updated Pressure buckets    │
│ ├─ ✓ Certificates: 100% (3 uploaded)        3. [01/15] Initial creation            │
│ └─ ⚠️  SOP Refs: 5 mapped (review)           [View Full Audit Trail]                │
│                                                                                     │
│ SOP REFERENCES & MAPPING                                                            │
│ ☑ NLAB/CAL/ML1/R01  │  ☑ NLAB/CAL/ML2/R01  │  ☑ NLAB/CAL/TH1/R01                │
│ ☑ NLAB/CAL/ET1/R01  │  ☑ NLAB/CAL/ET3/R01                                        │
│                                                                                     │
│ [Unlink] [Link Different SOP] [View Content]                                       │
│                                                                                     │
│                                                        [Cancel]  [Save Changes]    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 6: Audit Log Tab with SAME Fixed Banner

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ◀ Back    Edit Instrument #1000: Digital Pressure Gauge                 [Save] [✕] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ QUICK STATS BANNER (4 rows × 2 columns - SAME AS ALL TABS)                         │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐│
│ │                                                                                  ││
│ │  Asset #: 1000 HTAIPL/L              Status: ✓ VALID (365 days)                ││
│ │  Category: Mechanical                Calibrated At: Mechanical Lab              ││
│ │  Next Due: 03/15/2027                Last Updated: 02/26/2025 by Harshvardhan  ││
│ │  Model: Fluke TX 430-1               Serial: NVE12502806                       ││
│ │                                                                                  ││
│ └──────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                     │
│ [Basic Info] [Capabilities] [Certificates] [Metadata] [Audit Log]                 │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│ [Filter: All ▼] [Date Range: _____ to _____] [User: All ▼]                         │
│                                                                                     │
│ 2026-02-26 14:32:15  │  Harshvardhan Kumar                                          │
│ ──────────────────────────────────────────────────────────────────────────────────  │
│ Action: FILE_UPLOADED  │  File: VILLP_24-25_T-0184.pdf (2.3 MB, 4 pages)           │
│ Status: ✓ Archived  │  [View Details] [Revert]                                     │
│                                                                                     │
│ 2026-02-20 10:15:42  │  Harshvardhan Kumar                                          │
│ ──────────────────────────────────────────────────────────────────────────────────  │
│ Action: FIELD_UPDATED  │  Profile: Pressure (P1) → Bucket B2 → Least Count        │
│ Before: 0.05 bar → After: 0.05 bar (verified)  │  [View Details] [Revert]         │
│                                                                                     │
│ 2026-02-15 09:20:33  │  Harshvardhan Kumar                                          │
│ ──────────────────────────────────────────────────────────────────────────────────  │
│ Action: PROFILE_ADDED  │  New Profile: Temperature (measuring)                     │
│ 3 range buckets created  │  [View Details] [Revert]                                │
│                                                                                     │
│ 2026-01-15 09:00:00  │  System                                                     │
│ ──────────────────────────────────────────────────────────────────────────────────  │
│ Action: RECORD_CREATED  │  Asset #1000: Digital Pressure Gauge (Fluke TX 430-1)    │
│ 3 profiles initialized: Pressure, Temperature, RTD  │  [View Details]              │
│                                                                                     │
│                                                        [Cancel]  [Save Changes]    │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## FIXED Banner Layout - Always the Same

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 4 ROWS × 2 COLUMNS - CONSTANT ACROSS ALL VIEWS                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  LEFT COLUMN (50%)              │  RIGHT COLUMN (50%)                            │
│                                 │                                                │
│  Row 1:                         │  Row 1:                                        │
│  Asset #: 1000 HTAIPL/L         │  Status: ✓ VALID (365 days)                   │
│                                 │                                                │
│  Row 2:                         │  Row 2:                                        │
│  Category: Mechanical           │  Calibrated At: Mechanical Lab                 │
│                                 │                                                │
│  Row 3:                         │  Row 3:                                        │
│  Next Due: 03/15/2027           │  Last Updated: 02/26/2025 by [User]           │
│                                 │                                                │
│  Row 4:                         │  Row 4:                                        │
│  Model: Fluke TX 430-1          │  Serial: NVE12502806                           │
│                                 │                                                │
└──────────────────────────────────────────────────────────────────────────────────┘

ALWAYS SHOWS (Never Changes):
✓ Asset # (Normalized)
✓ Status + Days until expiry
✓ Category  
✓ Calibrated At (Location)
✓ Next Due Date
✓ Last Updated (Timestamp + User)
✓ Model
✓ Serial Number

Tab Content Changes Below → Banner Stays Constant
PDF View Replaces Tabs → Banner Stays Constant
```

---

## Certificates Tab Organization

**ACTIVE CERTIFICATES** (✓ symbol)
- Currently valid calibrations
- Displayed first in the list
- Show "Valid Until" date
- Standard actions: [View] [Download] [Edit] [Delete]

**ARCHIVED CERTIFICATES** (✗ symbol)
- Expired or superseded calibrations
- Displayed in separate collapsed/expandable section
- Show expiration date and when it expired
- Include [Restore] option to reactivate if needed

---

## PDF Viewer Status Indication

When viewing a PDF from either section:
- **ACTIVE**: Shows ✓ prefix in the control bar (e.g., "✓ ACTIVE │ VILLP_24-25_T-0184.pdf")
- **ARCHIVED**: Shows ✗ prefix in the control bar (e.g., "✗ ARCHIVED │ VILLP_24-25_E-0186.pdf")
- Control bar clearly indicates the certificate's status so user doesn't confuse active/expired certs
- [Back to Details] always returns to the same tab section they came from

---

## Why This Is Better

✅ **Stable Identity**: Banner always shows the same 6 critical fields
✅ **Perfect Compass**: No matter what view you're in, you know which instrument you're looking at
✅ **Clear Status**: Active vs. Archived is visually distinct in both card view and PDF viewer
✅ **No Confusion**: User immediately knows if they're viewing current or historical calibration
✅ **Consistent**: Same information density, same layout, predictable
✅ **Fast Context Switch**: Tab/PDF view changes but your orientation stays fixed
✅ **Professional**: Like a document header that doesn't change when you scroll
✅ **Easy to Scan**: Users learn the banner layout and can glance at it instantly

---

**Changes Made:**
1. ✅ Removed [View PDF ▼] button from tab row (redundant - click any cert card to view)
2. ✅ Split Certificates tab into ACTIVE and ARCHIVED sections
3. ✅ Added status indicator (✓/✗) in PDF viewer control bar
4. ✅ Added "Valid Until" and expiration tracking for each certificate

File updated: `docs/wireframes/admin-instrument-edit-final-fixed.md` 🎉