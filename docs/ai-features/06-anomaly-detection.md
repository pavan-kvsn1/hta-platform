# Feature Spec: Anomaly Detection

**Feature ID:** AI-006  
**Phase:** 3  
**Priority:** Medium  
**Status:** Planning

---

## Summary

ML-powered detection of anomalies in calibration data - identifying outliers, drift patterns, and potential issues before they become problems.

---

## Use Cases

### 6.1 Measurement Outlier Detection

Flag readings that deviate significantly from expected values:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ ANOMALY ALERT                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Certificate: HTA/CAL/2026/1234                                │
│  Parameter: DC Voltage @ 100V                                  │
│                                                                 │
│  Current reading: +0.45V error                                 │
│  Expected range: -0.15V to +0.15V                              │
│  Historical average: +0.08V                                    │
│                                                                 │
│  📊 Confidence: 94% anomaly                                    │
│                                                                 │
│  Possible causes:                                               │
│  • Instrument drift (most likely)                              │
│  • Measurement error                                           │
│  • Environmental factor                                        │
│                                                                 │
│  [Investigate] [Mark as Expected] [Flag for Review]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Instrument Drift Prediction

Predict when instruments will go out of tolerance:

```
┌─────────────────────────────────────────────────────────────────┐
│  📈 DRIFT ANALYSIS - Fluke 5520A (Asset #CAL-001)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DC Voltage Output - 10V Range                                 │
│                                                                 │
│  Error (ppm)                                                    │
│   +50 │                                              ┌─ Limit   │
│   +40 │                                         ●────┤          │
│   +30 │                                    ●         │ Predicted│
│   +20 │                              ●                          │
│   +10 │                       ●                                 │
│     0 │──●────●────●────●                                       │
│       └────┬────┬────┬────┬────┬────┬────┬────                  │
│          2024 2024 2025 2025 2026 2026 2027                     │
│                                                                 │
│  🔮 Prediction:                                                 │
│  • Current drift rate: +8 ppm/year                             │
│  • Estimated out-of-tolerance: October 2026                    │
│  • Recommended recalibration: August 2026 (2 months early)     │
│                                                                 │
│  [Schedule Early Calibration] [Set Reminder] [Dismiss]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Process Anomaly Detection

Identify unusual patterns in workflow:

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 PROCESS ANOMALY DETECTED                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Pattern: High revision rate for engineer "Amit S."            │
│                                                                 │
│  This week:                                                     │
│  • 8 of 12 certificates required revision (67%)                │
│  • Team average: 15%                                           │
│  • Amit's historical average: 20%                              │
│                                                                 │
│  Most common revision reasons:                                  │
│  1. Uncertainty calculation errors (5)                         │
│  2. Missing environmental data (2)                             │
│  3. Incorrect instrument reference (1)                         │
│                                                                 │
│  Recommendation:                                                │
│  • May benefit from uncertainty calculation refresher          │
│  • Consider peer review before submission                      │
│                                                                 │
│  [Send Training Resources] [Schedule 1:1] [Dismiss]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANOMALY DETECTION PIPELINE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                                │
│  │ New Result  │                                                │
│  │   Created   │                                                │
│  └──────┬──────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ FEATURE EXTRACTION                                      │   │
│  │ • Normalize reading to instrument spec                  │   │
│  │ • Calculate deviation from historical mean              │   │
│  │ • Extract environmental factors                         │   │
│  │ • Compute time since last calibration                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ANOMALY MODELS                                          │   │
│  │                                                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │  Z-Score     │  │  Isolation   │  │   LSTM       │  │   │
│  │  │  (simple)    │  │   Forest     │  │  (sequence)  │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ENSEMBLE DECISION                                       │   │
│  │ • Combine model outputs                                 │   │
│  │ • Apply confidence threshold                            │   │
│  │ • Generate alert if anomaly                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ALERT GENERATION                                        │   │
│  │ • Create notification                                   │   │
│  │ • Log for analysis                                      │   │
│  │ • Update instrument risk score                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Simple Z-Score Detection

```typescript
// packages/shared/src/ai/anomaly/z-score.ts

interface AnomalyResult {
  isAnomaly: boolean
  score: number
  threshold: number
  message: string
}

export async function detectAnomaly(
  tenantId: string,
  instrumentId: string,
  parameter: string,
  testPoint: number,
  currentReading: number
): Promise<AnomalyResult> {
  // Get historical readings for same instrument/parameter/point
  const history = await prisma.calibrationResult.findMany({
    where: {
      parameter: {
        certificate: { tenantId },
        parameterName: parameter
      },
      standardReading: testPoint.toString()
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  })
  
  if (history.length < 5) {
    return { isAnomaly: false, score: 0, threshold: 3, message: 'Insufficient history' }
  }
  
  // Calculate statistics
  const readings = history.map(h => parseFloat(h.errorObserved || '0'))
  const mean = readings.reduce((a, b) => a + b) / readings.length
  const stdDev = Math.sqrt(
    readings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / readings.length
  )
  
  // Z-score
  const zScore = Math.abs((currentReading - mean) / stdDev)
  const threshold = 3 // 3-sigma rule
  
  return {
    isAnomaly: zScore > threshold,
    score: zScore,
    threshold,
    message: zScore > threshold 
      ? `Reading is ${zScore.toFixed(1)} standard deviations from mean`
      : 'Reading is within normal range'
  }
}
```

### Drift Prediction

```typescript
// packages/shared/src/ai/anomaly/drift.ts

interface DriftPrediction {
  currentDriftRate: number  // units per year
  predictedOutOfTolerance: Date | null
  recommendedCalibration: Date
  confidence: number
}

export async function predictDrift(
  instrumentId: string,
  parameter: string,
  toleranceLimit: number
): Promise<DriftPrediction> {
  // Get all historical calibrations
  const history = await getInstrumentHistory(instrumentId, parameter)
  
  if (history.length < 3) {
    return {
      currentDriftRate: 0,
      predictedOutOfTolerance: null,
      recommendedCalibration: addMonths(new Date(), 12),
      confidence: 0.3
    }
  }
  
  // Linear regression on error vs time
  const regression = linearRegression(
    history.map(h => h.timestamp.getTime()),
    history.map(h => h.error)
  )
  
  const driftRatePerYear = regression.slope * (365 * 24 * 60 * 60 * 1000)
  
  // Predict when it will hit tolerance limit
  const currentError = history[0].error
  const remaining = toleranceLimit - Math.abs(currentError)
  const daysUntilLimit = remaining / (Math.abs(driftRatePerYear) / 365)
  
  const outOfToleranceDate = daysUntilLimit > 0 
    ? addDays(new Date(), daysUntilLimit)
    : null
  
  // Recommend calibration 2 months before predicted failure
  const recommendedDate = outOfToleranceDate
    ? addMonths(outOfToleranceDate, -2)
    : addMonths(new Date(), 12)
  
  return {
    currentDriftRate: driftRatePerYear,
    predictedOutOfTolerance: outOfToleranceDate,
    recommendedCalibration: recommendedDate,
    confidence: regression.r2
  }
}
```

---

## API Endpoints

```typescript
// Check single reading for anomaly
POST /api/ai/anomaly/check
{
  "instrumentId": "uuid",
  "parameter": "DC Voltage",
  "testPoint": 100,
  "reading": 0.45
}

// Get drift analysis for instrument
GET /api/ai/anomaly/drift/:instrumentId

// Get all active anomaly alerts
GET /api/ai/anomaly/alerts?status=active

// Dismiss/acknowledge alert
PATCH /api/ai/anomaly/alerts/:id
{ "status": "dismissed", "reason": "Expected behavior" }
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| True positive rate | >90% |
| False positive rate | <10% |
| Early drift detection | 2+ months before failure |
| Prevented OOT shipments | Track count |
