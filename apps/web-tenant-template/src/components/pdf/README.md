# PDF Generation - Layout Rules & Architecture

This document outlines the layout rules and smart page distribution logic for generating calibration certificate PDFs.

---

## Table of Contents

1. [Section Groups](#section-groups)
2. [Layout Rules](#layout-rules)
3. [Spacing Strategy: Compress Then Break](#spacing-strategy-compress-then-break)
4. [Decision Flow](#decision-flow)
5. [Examples](#examples)
6. [Implementation Details](#implementation-details)
7. [Binned Parameters Display](#binned-parameters-display)
8. [Files in this Directory](#files-in-this-directory)

---

## Section Groups

The PDF content is organized into fixed groups:

| Group | Sections | Rules |
|-------|----------|-------|
| **Header** | Letterhead + Title + Page Number | Fixed on every page (repeats) |
| **Group A** | Customer Info + UUC Details | Always together, always first content |
| **Group B** | Environmental + Calibration Procedure Reference | Always together, follows Group A |
| **Group C** | Calibration Tables (per parameter) | Each parameter table is atomic (never split). Order within group is flexible |
| **Group D** | Master Instruments | Atomic block, position flexible |
| **Group E** | Conclusion + Validity + Signature | Always together, always last content, anchored above footer |
| **Footer** | Footer Notes | Fixed on every page (repeats) |

---

## Layout Rules

### Rule 1: Fixed Position Groups
- **Groups A, B** → Always first, always together on page 1
- **Group E** → Always last, always together, positioned above footer
- **Header/Footer** → Repeat on every page

### Rule 2: Flexible Groups (C, D)
- Groups C (Calibration Tables) and D (Master Instruments) have flexible ordering
- Within Group C, tables can be reordered by size (smallest first) to maximize fit

### Rule 3: Atomic Parameter Tables
- **Never split a single parameter's calibration table across pages**
- Each parameter table must stay on one page
- If a table doesn't fit, move the entire table to the next page

### Rule 4: Minimum Sections Per Page
- Each page must have **minimum 3 sections** (excluding header/footer)
- If a page would have fewer than 3 sections, rebalance using strategic breaks

### Rule 5: Signature Positioning
- Group E (Conclusion + Validity + Signature) is always positioned above the footer
- It never floats in the middle of a page with empty space below

---

## Spacing Strategy: Compress Then Break

We have two tools to optimize page layout:

| Tool | Effect | When to Use |
|------|--------|-------------|
| **Compression** | Reduce spacing by up to 15% | Content slightly exceeds page capacity |
| **Expansion** | Increase spacing by up to 50% | Content fits with room to spare |
| **Strategic Break** | Force page break earlier | Content significantly exceeds page, need to avoid orphans |

### Spacing Adjustment Range

```
COMPRESSION ◄─────────────────┼─────────────────► EXPANSION
   -15%          -10%    -5%  │  +5%   +10%   +50%
   0.85x         0.90x  0.95x │ 1.05x  1.10x  1.50x
                              │
                           NORMAL
                           (1.0x)
```

- **Minimum multiplier:** 0.85 (15% compression)
- **Maximum multiplier:** 1.50 (50% expansion)

### What Gets Adjusted

| Element | Adjustable | Base Value |
|---------|------------|------------|
| Section margins (between tables) | ✓ | 10-12px |
| Table row padding | ✓ | 3-4px |
| Info line spacing | ✓ | 5px |
| Header/Footer | ✗ | Fixed |
| Text font size | ✗ | Fixed |
| Table borders | ✗ | Fixed |

---

## Decision Flow

```
┌─────────────────────────────────────────────────────────────┐
│              STEP 1: CALCULATE TOTAL HEIGHT                  │
│         Sum heights of all sections                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 2: COMPARE TO PAGE CAPACITY                │
│         usableHeight = 550px (approx, after header/footer)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Does it fit on 1 page?
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
             YES                              NO
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│   EXPAND SPACING        │     │   Calculate overflow        │
│   Fill empty space      │     │   overflow = total - usable │
│   multiplier: 1.0-1.5x  │     └─────────────────────────────┘
└─────────────────────────┘                   │
                                              ▼
                              Can 15% compression fix it?
                              (overflow ≤ 15% of adjustable spacing)
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                             YES                              NO
                              │                               │
                              ▼                               ▼
                ┌─────────────────────────┐     ┌─────────────────────────┐
                │   COMPRESS SPACING      │     │   MULTI-PAGE STRATEGY   │
                │   Reduce by needed %    │     │   1. Apply 15% compress │
                │   multiplier: 0.85-0.99 │     │   2. Use strategic breaks│
                │   Everything fits!      │     │   3. Avoid orphans       │
                └─────────────────────────┘     └─────────────────────────┘
```

### Priority Order

| Priority | Strategy | Condition |
|----------|----------|-----------|
| 1st | **Expand** | Content fits with room to spare |
| 2nd | **Compress** | Overflow ≤ 15% of adjustable spacing |
| 3rd | **Break + Compress** | Overflow > 15%, need multiple pages |

---

## Examples

### Example 1: Content Fits with Room → EXPAND

**Input:**
```
Section Heights:
- Group A (Customer + UUC):     170px
- Group B (Env + SOP):           35px
- Calibration Table (5 points): 135px
- Master Instruments (1):        75px
- Group E (Conclusion + Sign):  100px
────────────────────────────────────
Total:                          515px
Usable per page:                550px
```

**Calculation:**
```
Overflow = 515 - 550 = -35px (negative = room to spare)
Extra space = 35px
Adjustable spacing = ~80px

Expansion multiplier = 1 + (35 / 80) = 1.44x
Capped at 1.50x → Use 1.44x
```

**Result:**
```
┌─────────────────────────────────┐
│ Header                          │
├─────────────────────────────────┤
│ Group A                         │
│ ↕ expanded spacing              │
│ Group B                         │
│ ↕ expanded spacing              │
│ Calibration Table               │
│ ↕ expanded spacing              │
│ Master Instruments              │
│ ↕ expanded spacing              │
│ Group E                         │
├─────────────────────────────────┤
│ Footer                          │
└─────────────────────────────────┘
Single page, spacing expanded to fill
```

---

### Example 2: Slight Overflow → COMPRESS

**Input:**
```
Section Heights:
- Group A (Customer + UUC):     170px
- Group B (Env + SOP):           35px
- Calibration Table (8 points): 180px
- Master Instruments (1):        75px
- Group E (Conclusion + Sign):  100px
────────────────────────────────────
Total:                          560px
Usable per page:                550px
```

**Calculation:**
```
Overflow = 560 - 550 = 10px
Adjustable spacing = ~80px

Compression needed = 10 / 80 = 12.5%
12.5% ≤ 15% → CAN compress!

Compression multiplier = 1 - 0.125 = 0.875x
```

**Result:**
```
┌─────────────────────────────────┐
│ Header                          │
├─────────────────────────────────┤
│ Group A                         │
│ ↕ compressed spacing (0.875x)   │
│ Group B                         │
│ ↕ compressed spacing            │
│ Calibration Table               │
│ ↕ compressed spacing            │
│ Master Instruments              │
│ ↕ compressed spacing            │
│ Group E                         │
├─────────────────────────────────┤
│ Footer                          │
└─────────────────────────────────┘
Single page, spacing compressed by 12.5%
```

---

### Example 3: Major Overflow → MULTI-PAGE (Bad Layout)

**Input:**
```
Section Heights:
- Group A (Customer + UUC):     170px
- Group B (Env + SOP):           35px
- Calibration Table (10 pts):   215px
- Master Instruments (2):       130px
- Group E (Conclusion + Sign):  120px
────────────────────────────────────
Total:                          670px
Usable per page:                550px
```

**Calculation:**
```
Overflow = 670 - 550 = 120px
Adjustable spacing = ~80px

Compression needed = 120 / 80 = 150%
150% > 15% → CANNOT fit with compression alone!
```

**Bad Result (without strategic breaks):**
```
Page 1:                              Page 2:
┌─────────────────────────┐          ┌─────────────────────────┐
│ Header                  │          │ Header                  │
├─────────────────────────┤          ├─────────────────────────┤
│ Group A                 │          │ Group E (only!)         │
│ Group B                 │          │                         │
│ Calibration Table       │          │                         │
│ Master Instruments      │          │   ← HUGE EMPTY SPACE    │
│                         │          │                         │
├─────────────────────────┤          ├─────────────────────────┤
│ Footer                  │          │ Footer                  │
└─────────────────────────┘          └─────────────────────────┘

❌ Page 2 has only 1 section (orphaned signature)
```

---

### Example 4: Major Overflow → MULTI-PAGE (Good Layout with Strategic Break)

**Same input as Example 3, but with strategic break:**

**Strategy:**
```
1. Detect: Group E would be orphaned on Page 2
2. Calculate: What sections should move to Page 2?
   - Group E (120px) alone = 1 section ❌
   - Master (130px) + Group E (120px) = 250px, 2 sections ❌
   - CalTable (215px) + Master (130px) + Group E (120px) = 465px, 3 sections ✓

   But 465px > 550px usable? Let's check with compression:
   - With 15% compression on spacing: Still too big

   Better approach:
   - Master (130px) + Group E (120px) = 250px
   - Apply expansion on Page 2 to fill space

3. Decision: Break BEFORE Master Instruments
```

**Good Result:**
```
Page 1:                              Page 2:
┌─────────────────────────┐          ┌─────────────────────────┐
│ Header                  │          │ Header                  │
├─────────────────────────┤          ├─────────────────────────┤
│ Group A                 │          │ Master Instruments      │
│ Group B                 │          │ ↕ expanded spacing      │
│ Calibration Table       │          │ Group E                 │
│ ↕ expanded spacing      │          │ ↕ expanded spacing      │
│   (to fill page)        │          │   (to fill page)        │
├─────────────────────────┤          ├─────────────────────────┤
│ Footer                  │          │ Footer                  │
└─────────────────────────┘          └─────────────────────────┘

✓ Page 1: 3 sections, nicely filled
✓ Page 2: 2 sections (acceptable when Group E is one of them)
```

---

### Example 5: Many Calibration Tables → Reorder by Size

**Input:**
```
Section Heights:
- Group A:                      170px
- Group B:                       35px
- Cal Table "Pressure" (3 pts):  90px
- Cal Table "Temp" (12 pts):    250px
- Cal Table "Humidity" (2 pts):  75px
- Master Instruments:            75px
- Group E:                      120px
────────────────────────────────────
Total:                          815px
```

**Without reordering:**
```
Page 1: A(170) + B(35) + Pressure(90) + Temp(250) = 545px
        [natural break - Temp barely fits]
Page 2: Humidity(75) + Master(75) + GroupE(120) = 270px ✓
```

**With reordering (smallest tables first):**
```
Reordered: Humidity(75) → Pressure(90) → Temp(250)

Page 1: A(170) + B(35) + Humidity(75) + Pressure(90) = 370px
        Temp(250) doesn't fit (370+250=620 > 550)
        [strategic break before Temp]
Page 2: Temp(250) + Master(75) + GroupE(120) = 445px ✓
```

**Result:** Better balanced pages with reordering.

---

## Implementation Details

### Layout Plan Structure

```typescript
interface LayoutPlan {
  pages: PageLayout[]
  totalPages: number
  strategy: 'expand' | 'compress' | 'multi-page'
  globalSpacingMultiplier: number  // 0.85 to 1.50
  breakBefore: Set<string>         // Section IDs to force page break before
}

interface PageLayout {
  pageNumber: number
  sections: Section[]
  totalHeight: number
  spacingMultiplier: number  // Per-page adjustment
}

interface Section {
  id: string
  type: SectionType
  group: 'A' | 'B' | 'C' | 'D' | 'E'
  estimatedHeight: number
  isFlexible: boolean        // Can be reordered
  parameterId?: string       // For calibration tables
}
```

### Spacing Multiplier Calculation

```typescript
function calculateSpacingMultiplier(
  totalHeight: number,
  usableHeight: number,
  adjustableSpacing: number
): { multiplier: number; strategy: string } {

  const overflow = totalHeight - usableHeight

  if (overflow <= 0) {
    // Content fits - EXPAND to fill
    const extraSpace = Math.abs(overflow)
    const multiplier = Math.min(1.5, 1 + (extraSpace / adjustableSpacing))
    return { multiplier, strategy: 'expand' }
  }

  // Content overflows - try to COMPRESS
  const compressionNeeded = overflow / adjustableSpacing

  if (compressionNeeded <= 0.15) {
    // Can fix with compression
    const multiplier = 1 - compressionNeeded
    return { multiplier, strategy: 'compress' }
  }

  // Need MULTI-PAGE with strategic breaks
  return { multiplier: 0.85, strategy: 'multi-page' }
}
```

### Strategic Break Detection

```typescript
function detectOrphanedSections(
  sections: Section[],
  usableHeight: number
): { needsBreak: boolean; breakBeforeId: string | null } {

  let currentPageHeight = 0
  let currentPageSections: Section[] = []
  let lastPageSections: Section[] = []

  for (const section of sections) {
    if (currentPageHeight + section.estimatedHeight > usableHeight) {
      // Would overflow - start new page
      lastPageSections = [section]
      currentPageHeight = section.estimatedHeight
    } else {
      currentPageSections.push(section)
      currentPageHeight += section.estimatedHeight
    }
  }

  // Check if last page has < 3 sections (orphan situation)
  if (lastPageSections.length < 3 && lastPageSections.length > 0) {
    // Find a flexible section to move to last page
    // Break should happen before that section
    return {
      needsBreak: true,
      breakBeforeId: findBreakPoint(currentPageSections, lastPageSections)
    }
  }

  return { needsBreak: false, breakBeforeId: null }
}
```

---

## Binned Parameters Display

For parameters with binned accuracy/least count, the UUC table displays ranges:

**Non-binned (single value):**
```
┌─────────────────┬────────────────────────┬───────────────┬─────────────────────┐
│  Least Count    │  0.1 °C                │  Accuracy     │  ± 0.5 °C           │
└─────────────────┴────────────────────────┴───────────────┴─────────────────────┘
```

**Binned (multi-line with range context):**
```
┌─────────────────┬────────────────────────┬───────────────┬─────────────────────┐
│  Least Count    │  -50 to 0 °C: 0.01 °C  │  Accuracy     │  -50 to 0 °C: ± 2.5 │
│                 │  0 to 50 °C: 0.1 °C    │               │  0 to 50 °C: ± 3.0  │
└─────────────────┴────────────────────────┴───────────────┴─────────────────────┘
```

Note: Uses "to" instead of "-" to avoid confusion with negative numbers.

---

## Files in this Directory

| File | Purpose |
|------|---------|
| `CalibrationCertificatePDF.tsx` | Main PDF component using @react-pdf/renderer |
| `pdf-layout.ts` | Layout planning, height estimation, spacing calculation |
| `pdf-utils.ts` | Helper functions, constants, formatting utilities |
| `logo-base64.ts` | Base64 encoded company logo |
| `PDFPreviewSection.tsx` | Preview component for the certificate form |
| `index.ts` | Barrel exports |
| `README.md` | This documentation |

---

## Summary

1. **Always try to fit on fewer pages** using compression (up to 15%)
2. **Expand spacing** when content fits with room to spare
3. **Use strategic breaks** only when compression isn't enough
4. **Never orphan the signature** - ensure Group E has company on its page
5. **Never split a parameter table** - each table is atomic
6. **Reorder flexible sections** (calibration tables) by size for better packing
