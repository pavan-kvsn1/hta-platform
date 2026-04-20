# Feature Spec: Certificate Intelligence

**Feature ID:** AI-002  
**Phase:** 1  
**Priority:** High  
**Status:** Planning

---

## Summary

Use AI to auto-fill certificate fields, validate calculations, and flag anomalies by learning from historical calibration data.

---

## Problem Statement

Engineers spend significant time on repetitive data entry:
- Looking up instrument specs from manuals
- Copying environmental conditions
- Re-entering customer details
- Calculating uncertainties manually
- Cross-referencing with previous calibrations

**Current pain points:**
- 45 min average to create a certificate
- 15% error rate on first submission
- Repetitive data entry for same instruments

---

## Features

### 2.1 Smart Auto-Fill

When engineer starts a new certificate, AI suggests values based on:

```
┌─────────────────────────────────────────────────────────────────┐
│  NEW CERTIFICATE                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Customer: [Acme Industries Pvt Ltd     ▾] ← Recent customers  │
│  Contact:  [Rajesh Kumar               ] ← Auto from customer  │
│  Address:  [123 Industrial Area, Pune  ] ← Auto from customer  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  UUC (Unit Under Calibration)                                   │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Description: [Digital Multimeter        ]                      │
│  Make:        [Fluke                   ▾] ← AI suggestion      │
│  Model:       [87V                     ▾] ← Based on make      │
│  Serial:      [12345678                 ]                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💡 AI Suggestion                                        │   │
│  │                                                         │   │
│  │ Found 12 previous calibrations for Fluke 87V            │   │
│  │ • Last calibration: 2026-01-15 by Ravi S.              │   │
│  │ • Typical parameters: DC V, AC V, Resistance, Current   │   │
│  │                                                         │   │
│  │ [Apply Template from History] [Dismiss]                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Parameter Suggestions

Based on instrument type and historical data:

```
┌─────────────────────────────────────────────────────────────────┐
│  CALIBRATION PARAMETERS                              [+ Add]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💡 Suggested parameters for Fluke 87V:                  │   │
│  │                                                         │   │
│  │ ☑ DC Voltage (0-1000V)    ☑ AC Voltage (0-750V)        │   │
│  │ ☑ Resistance (0-50MΩ)     ☑ DC Current (0-10A)         │   │
│  │ ☐ Frequency (optional)    ☐ Capacitance (optional)     │   │
│  │                                                         │   │
│  │ [Apply Selected] [Customize]                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Parameter 1: DC Voltage                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Range: [0      ] to [1000   ] [V    ▾]                  │   │
│  │ Points: 5   [Auto-generate typical points]              │   │
│  │                                                         │   │
│  │ 💡 Typical test points for this range:                  │   │
│  │    0V, 100mV, 1V, 10V, 100V, 1000V                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Calculation Verification

AI checks uncertainty calculations and flags errors:

```
┌─────────────────────────────────────────────────────────────────┐
│  CALIBRATION RESULTS - DC Voltage                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  │ Point │ Standard │ UUC Reading │ Error   │ Uncertainty │    │
│  ├───────┼──────────┼─────────────┼─────────┼─────────────┤    │
│  │ 1     │ 0.000 V  │ 0.001 V     │ +0.001V │ ±0.002 V    │    │
│  │ 2     │ 0.100 V  │ 0.100 V     │ 0.000V  │ ±0.002 V    │    │
│  │ 3     │ 1.000 V  │ 1.002 V     │ +0.002V │ ±0.003 V    │    │
│  │ 4     │ 10.00 V  │ 10.03 V     │ +0.03V  │ ±0.02 V ⚠️  │    │
│  │ 5     │ 100.0 V  │ 100.5 V     │ +0.5V   │ ±0.2 V      │    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⚠️ AI Verification Alerts                               │   │
│  │                                                         │   │
│  │ 1. Point 4: Error (+0.03V) exceeds uncertainty (±0.02V) │   │
│  │    → Instrument may be OUT OF TOLERANCE                 │   │
│  │    → Previous calibration showed +0.01V at this point   │   │
│  │                                                         │   │
│  │ 2. Uncertainty calculation at 100V appears low          │   │
│  │    → Expected: ±0.25V based on Fluke 87V specs          │   │
│  │    → Entered: ±0.2V                                     │   │
│  │    → [Recalculate] [Ignore]                             │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Historical Comparison

Compare current results with instrument history:

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Historical Comparison - Fluke 87V S/N: 12345678            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DC Voltage @ 10V test point                                    │
│                                                                 │
│  Error (mV)                                                     │
│  40 │                                              ● Current    │
│  30 │              ●                                            │
│  20 │    ●                                                      │
│  10 │         ●         ●         ●                             │
│   0 ├────┬────┬────┬────┬────┬────┬────┬────                    │
│     2023 2023 2024 2024 2025 2025 2026                          │
│     -01  -07  -01  -07  -01  -07  -04                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔍 Drift Analysis                                       │   │
│  │                                                         │   │
│  │ • Current error: +30mV (higher than historical avg)     │   │
│  │ • Historical average: +12mV                             │   │
│  │ • Trend: Increasing drift (+3mV/year)                   │   │
│  │                                                         │   │
│  │ ⚠️ Recommendation: Flag for customer - may need         │   │
│  │    adjustment or reduced calibration interval           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Data Model Additions

```prisma
// Track AI suggestions and their acceptance
model AISuggestion {
  id              String   @id @default(uuid())
  certificateId   String
  certificate     Certificate @relation(fields: [certificateId], references: [id])
  
  type            SuggestionType  // AUTOFILL, PARAMETER, CALCULATION, ANOMALY
  field           String          // Which field was suggested
  suggestedValue  String
  confidence      Float           // 0-1
  
  status          SuggestionStatus @default(PENDING)
  acceptedValue   String?         // What user actually used
  
  createdAt       DateTime @default(now())
  respondedAt     DateTime?
  
  @@index([certificateId])
}

enum SuggestionType {
  AUTOFILL
  PARAMETER
  CALCULATION
  ANOMALY
}

enum SuggestionStatus {
  PENDING
  ACCEPTED
  MODIFIED
  REJECTED
}
```

### Auto-Fill Service

```typescript
// apps/api/src/services/ai/certificate-intelligence.ts

interface AutoFillSuggestions {
  customer?: {
    name: string
    contact: string
    address: string
    confidence: number
  }
  uuc?: {
    make: string
    model: string
    parameters: ParameterSuggestion[]
    confidence: number
  }
  environment?: {
    temperature: string
    humidity: string
    confidence: number
  }
}

export async function getAutoFillSuggestions(
  tenantId: string,
  partialData: Partial<CertificateInput>
): Promise<AutoFillSuggestions> {
  const suggestions: AutoFillSuggestions = {}
  
  // 1. Customer suggestions from recent certs
  if (partialData.customerName) {
    const recentCustomer = await prisma.certificate.findFirst({
      where: {
        tenantId,
        customerName: { contains: partialData.customerName, mode: 'insensitive' }
      },
      orderBy: { createdAt: 'desc' },
      select: { customerName: true, customerAddress: true, customerContact: true }
    })
    
    if (recentCustomer) {
      suggestions.customer = {
        name: recentCustomer.customerName,
        contact: recentCustomer.customerContact || '',
        address: recentCustomer.customerAddress,
        confidence: 0.95
      }
    }
  }
  
  // 2. UUC suggestions from instrument history
  if (partialData.uucMake || partialData.uucModel) {
    const historicalCerts = await prisma.certificate.findMany({
      where: {
        tenantId,
        uucMake: partialData.uucMake,
        uucModel: partialData.uucModel,
      },
      include: { parameters: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
    
    if (historicalCerts.length > 0) {
      // Aggregate common parameters
      const paramCounts = new Map<string, number>()
      historicalCerts.forEach(cert => {
        cert.parameters.forEach(p => {
          const key = `${p.parameterName}|${p.parameterUnit}`
          paramCounts.set(key, (paramCounts.get(key) || 0) + 1)
        })
      })
      
      // Suggest parameters that appear in >50% of certs
      const threshold = historicalCerts.length * 0.5
      const suggestedParams = [...paramCounts.entries()]
        .filter(([_, count]) => count >= threshold)
        .map(([key, count]) => {
          const [name, unit] = key.split('|')
          return {
            name,
            unit,
            confidence: count / historicalCerts.length
          }
        })
      
      suggestions.uuc = {
        make: partialData.uucMake || historicalCerts[0].uucMake,
        model: partialData.uucModel || historicalCerts[0].uucModel,
        parameters: suggestedParams,
        confidence: 0.85
      }
    }
  }
  
  // 3. Environmental conditions from recent certs (same day/location)
  const recentCert = await prisma.certificate.findFirst({
    where: {
      tenantId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    orderBy: { createdAt: 'desc' },
    select: { environmentTemp: true, environmentHumidity: true }
  })
  
  if (recentCert?.environmentTemp) {
    suggestions.environment = {
      temperature: recentCert.environmentTemp,
      humidity: recentCert.environmentHumidity || '',
      confidence: 0.90
    }
  }
  
  return suggestions
}
```

### Calculation Verification

```typescript
// apps/api/src/services/ai/calculation-verifier.ts

interface VerificationResult {
  isValid: boolean
  alerts: VerificationAlert[]
}

interface VerificationAlert {
  type: 'ERROR' | 'WARNING' | 'INFO'
  field: string
  message: string
  expected?: string
  actual?: string
  suggestion?: string
}

export async function verifyCertificateCalculations(
  certificateId: string
): Promise<VerificationResult> {
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      parameters: {
        include: { results: true }
      }
    }
  })
  
  const alerts: VerificationAlert[] = []
  
  for (const param of cert.parameters) {
    for (const result of param.results) {
      // Check 1: Error within uncertainty
      if (result.errorObserved && result.uncertainty) {
        const error = Math.abs(parseFloat(result.errorObserved))
        const uncertainty = parseFloat(result.uncertainty)
        
        if (error > uncertainty) {
          alerts.push({
            type: 'WARNING',
            field: `${param.parameterName} - Point ${result.pointNumber}`,
            message: 'Error exceeds uncertainty - instrument may be out of tolerance',
            expected: `Error ≤ ${uncertainty}`,
            actual: `Error = ${error}`,
            suggestion: 'Verify reading or mark as OUT OF TOLERANCE'
          })
        }
      }
      
      // Check 2: Compare with historical data
      const historical = await getHistoricalResults(
        cert.tenantId,
        cert.uucMake,
        cert.uucModel,
        cert.uucSerialNumber,
        param.parameterName,
        result.standardReading
      )
      
      if (historical.length > 0) {
        const avgError = historical.reduce((sum, h) => sum + h.error, 0) / historical.length
        const currentError = parseFloat(result.errorObserved || '0')
        const deviation = Math.abs(currentError - avgError)
        const stdDev = calculateStdDev(historical.map(h => h.error))
        
        if (deviation > 3 * stdDev) {
          alerts.push({
            type: 'WARNING',
            field: `${param.parameterName} - Point ${result.pointNumber}`,
            message: 'Result significantly different from historical average',
            expected: `Typical error: ${avgError.toFixed(3)}`,
            actual: `Current error: ${currentError.toFixed(3)}`,
            suggestion: 'Verify measurement or investigate instrument drift'
          })
        }
      }
    }
  }
  
  return {
    isValid: alerts.filter(a => a.type === 'ERROR').length === 0,
    alerts
  }
}
```

---

## API Endpoints

```typescript
// Get auto-fill suggestions
POST /api/ai/certificates/autofill
{
  "customerName": "Acme",
  "uucMake": "Fluke",
  "uucModel": "87V"
}

// Verify calculations
POST /api/ai/certificates/:id/verify
Response:
{
  "isValid": false,
  "alerts": [
    {
      "type": "WARNING",
      "field": "DC Voltage - Point 4",
      "message": "Error exceeds uncertainty",
      "expected": "Error ≤ 0.02V",
      "actual": "Error = 0.03V"
    }
  ]
}

// Get historical comparison
GET /api/ai/certificates/:id/history
Response:
{
  "instrumentId": "fluke-87v-12345678",
  "calibrationCount": 12,
  "driftAnalysis": {
    "trend": "increasing",
    "rate": "+3mV/year",
    "recommendation": "Consider reduced calibration interval"
  },
  "history": [
    { "date": "2025-01-15", "parameter": "DC Voltage @ 10V", "error": 0.012 },
    ...
  ]
}
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Cert creation time | 45 min | 20 min |
| Fields auto-filled | 0% | 60% |
| First-pass approval | 60% | 80% |
| Calculation errors caught | Manual | 95% auto-detected |
