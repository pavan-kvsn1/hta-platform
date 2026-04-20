# Feature Spec: Review Assistant Agent

**Feature ID:** AI-004  
**Phase:** 2  
**Priority:** Medium  
**Status:** Planning

---

## Summary

An AI assistant that helps reviewers quickly validate certificates by automatically checking calculations, flagging anomalies, comparing with historical data, and suggesting revision comments.

---

## Problem Statement

Reviewers currently spend **20-30 minutes per certificate**:
- Manually verifying uncertainty calculations
- Cross-referencing instrument specs
- Checking for transcription errors
- Writing revision comments

**Result:** Bottleneck in approval workflow, delayed turnaround.

---

## Solution

When a reviewer opens a certificate, the AI pre-analyzes it:

```
┌─────────────────────────────────────────────────────────────────┐
│  CERTIFICATE REVIEW - HTA/CAL/2026/1234                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🤖 AI Review Summary                            [Hide]  │   │
│  │                                                         │   │
│  │ ✅ Overall: Ready for approval (2 minor suggestions)   │   │
│  │                                                         │   │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │   │
│  │                                                         │   │
│  │ ✅ Calculations Verified                                │   │
│  │    All 5 parameters, 25 data points checked            │   │
│  │                                                         │   │
│  │ ✅ Within Tolerance                                     │   │
│  │    All readings within instrument specifications       │   │
│  │                                                         │   │
│  │ ⚠️ Suggestions (2)                                     │   │
│  │                                                         │   │
│  │   1. DC Voltage @ 100V: Consider adding reading        │   │
│  │      uncertainty note (error close to limit)           │   │
│  │      [Add Note] [Dismiss]                              │   │
│  │                                                         │   │
│  │   2. Environmental conditions: Humidity not recorded    │   │
│  │      (optional but recommended)                        │   │
│  │      [Request from Engineer] [Not Required]            │   │
│  │                                                         │   │
│  │ 📊 Historical Context                                  │   │
│  │    This instrument was last calibrated 2025-01-15      │   │
│  │    Results are consistent with previous calibration    │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [✓ Approve] [↩ Request Revision] [💬 Add Comment]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### 4.1 Automatic Pre-Check

When certificate status changes to `PENDING_REVIEW`:

```typescript
interface ReviewAnalysis {
  overallStatus: 'APPROVE' | 'REVIEW_NEEDED' | 'REJECT'
  confidence: number
  
  checks: {
    calculations: CheckResult
    tolerances: CheckResult
    completeness: CheckResult
    consistency: CheckResult
  }
  
  suggestions: Suggestion[]
  historicalContext: HistoricalContext
}

// Triggered automatically
async function analyzeForReview(certificateId: string): Promise<ReviewAnalysis>
```

### 4.2 Smart Revision Comments

AI suggests specific, actionable revision comments:

```
┌─────────────────────────────────────────────────────────────────┐
│  REQUEST REVISION                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Select issues to include:                                      │
│                                                                 │
│  ☑ DC Voltage uncertainty calculation needs correction         │
│    "Please recalculate uncertainty at 100V point using         │
│     the formula U = k√(u_std² + u_res²). Current value         │
│     appears to use only standard uncertainty."                  │
│                                                                 │
│  ☑ Missing environmental humidity reading                       │
│    "Please add humidity reading for environmental               │
│     conditions section."                                        │
│                                                                 │
│  ☐ Master instrument certificate reference missing              │
│    "Add reference to calibrator certificate number."            │
│                                                                 │
│  Additional comments:                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Send Revision Request]                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Batch Review Mode

Review multiple certificates efficiently:

```
┌─────────────────────────────────────────────────────────────────┐
│  BATCH REVIEW (12 certificates pending)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🤖 AI Pre-Analysis Complete                                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Ready for Approval (8)                           [▾ Show] │ │
│  │ ✅ HTA/CAL/2026/1231 - Fluke 87V - Acme Corp             │ │
│  │ ✅ HTA/CAL/2026/1232 - Pressure Gauge - TechLab          │ │
│  │ ✅ HTA/CAL/2026/1233 - Temperature Probe - Acme          │ │
│  │ ... 5 more                                                │ │
│  │                                                           │ │
│  │ [Approve All 8] [Review Individually]                     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Needs Attention (4)                              [▾ Show] │ │
│  │ ⚠️ HTA/CAL/2026/1234 - DMM - QuickTest                   │ │
│  │    Issue: Calculation error at point 3                    │ │
│  │ ⚠️ HTA/CAL/2026/1235 - Calibrator - NewCo                │ │
│  │    Issue: Missing master instrument reference             │ │
│  │ ...                                                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Analysis Pipeline

```typescript
// apps/api/src/services/ai/review-assistant.ts

export async function analyzeCertificateForReview(
  certificateId: string
): Promise<ReviewAnalysis> {
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      parameters: { include: { results: true } },
      createdBy: true,
      masterInstruments: true
    }
  })
  
  const checks = await Promise.all([
    checkCalculations(cert),
    checkTolerances(cert),
    checkCompleteness(cert),
    checkConsistency(cert)
  ])
  
  const historical = await getHistoricalContext(cert)
  
  // Use LLM to synthesize findings
  const synthesis = await synthesizeReview(cert, checks, historical)
  
  return {
    overallStatus: synthesis.recommendation,
    confidence: synthesis.confidence,
    checks: {
      calculations: checks[0],
      tolerances: checks[1],
      completeness: checks[2],
      consistency: checks[3]
    },
    suggestions: synthesis.suggestions,
    historicalContext: historical
  }
}

async function checkCalculations(cert: Certificate): Promise<CheckResult> {
  const issues: Issue[] = []
  
  for (const param of cert.parameters) {
    for (const result of param.results) {
      // Verify uncertainty formula
      const expectedUncertainty = calculateExpectedUncertainty(
        param,
        result,
        cert.masterInstruments
      )
      
      if (Math.abs(result.uncertainty - expectedUncertainty) > 0.001) {
        issues.push({
          severity: 'ERROR',
          location: `${param.parameterName} - Point ${result.pointNumber}`,
          message: `Uncertainty mismatch: expected ${expectedUncertainty}, got ${result.uncertainty}`,
          suggestion: `Recalculate using U = k√(Σu²)`
        })
      }
      
      // Check error calculation
      const expectedError = parseFloat(result.uucReading) - parseFloat(result.standardReading)
      if (Math.abs(result.errorObserved - expectedError) > 0.0001) {
        issues.push({
          severity: 'ERROR',
          location: `${param.parameterName} - Point ${result.pointNumber}`,
          message: 'Error calculation incorrect',
          suggestion: 'Error = UUC Reading - Standard Reading'
        })
      }
    }
  }
  
  return {
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues
  }
}
```

---

## API Endpoints

```typescript
// Get AI review analysis
GET /api/ai/review/:certificateId/analysis

// Generate revision comment suggestions
POST /api/ai/review/:certificateId/suggest-comments
{
  "issues": ["calculation_error", "missing_humidity"]
}

// Batch analysis
POST /api/ai/review/batch-analyze
{
  "certificateIds": ["uuid1", "uuid2", ...]
}
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Review time per cert | 20 min | 5 min |
| Calculation errors caught | 70% | 98% |
| False positives | N/A | <5% |
| Reviewer satisfaction | N/A | >4/5 |
