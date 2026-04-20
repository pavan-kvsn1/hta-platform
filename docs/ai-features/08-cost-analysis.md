# AI Features Cost Analysis

**Version:** 1.0  
**Created:** 2026-04-17  
**Assumptions:** Single tenant (HTA), moderate usage

---

## Executive Summary

| Phase | Features | Monthly Cost | One-Time Setup |
|-------|----------|--------------|----------------|
| **Phase 1** | RAG + Certificate Intelligence | **$80-150** | $50 |
| **Phase 2** | Onboarding + Review Agents | **$100-200** | $100 |
| **Phase 3** | Customer Service + Anomaly | **$150-300** | $200 |
| **Phase 4** | Code Maintenance | **$20-50** | $0 |
| **Total** | All Features | **$350-700/mo** | $350 |

---

## Pricing Assumptions

### LLM Pricing (as of 2026)

| Model | Input | Output | Use Case |
|-------|-------|--------|----------|
| Claude Sonnet 4 | $3/1M tokens | $15/1M tokens | Complex reasoning, agents |
| Claude Haiku 4 | $0.25/1M tokens | $1.25/1M tokens | Simple tasks, classification |
| GPT-4o | $2.50/1M tokens | $10/1M tokens | Alternative to Sonnet |
| GPT-4o-mini | $0.15/1M tokens | $0.60/1M tokens | Simple tasks |
| text-embedding-3-small | $0.02/1M tokens | - | Embeddings |

### Token Estimates

| Task | Avg Input | Avg Output | Total Tokens |
|------|-----------|------------|--------------|
| RAG query | 2,000 | 500 | 2,500 |
| Certificate auto-fill | 3,000 | 1,000 | 4,000 |
| Agent conversation turn | 4,000 | 1,000 | 5,000 |
| Review analysis | 5,000 | 2,000 | 7,000 |
| Document embedding (per page) | 500 | - | 500 |

---

## Phase 1: RAG + Certificate Intelligence

### Features
- Knowledge base Q&A
- Certificate auto-fill suggestions
- Calculation verification

### Usage Assumptions (per month)

| Activity | Volume | Tokens/Activity | Total Tokens |
|----------|--------|-----------------|--------------|
| RAG queries | 500 | 2,500 | 1,250,000 |
| Auto-fill suggestions | 300 certs | 4,000 | 1,200,000 |
| Calculation checks | 300 certs | 3,000 | 900,000 |
| **Total** | | | **3,350,000** |

### Cost Breakdown

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| **Claude Sonnet** (RAG + complex) | 2M tokens × ($3 + $15)/1M | $36 |
| **Claude Haiku** (simple checks) | 1.35M tokens × ($0.25 + $1.25)/1M | $2 |
| **Embeddings** (queries) | 500 queries × 500 tokens × $0.02/1M | $0.01 |
| **pgvector** | Included in existing Postgres | $0 |
| **Buffer (20%)** | | $8 |
| **Total** | | **$46** |

### One-Time Setup Costs

| Item | Cost |
|------|------|
| Initial document embedding (1000 pages) | 500K tokens × $0.02/1M = $0.01 |
| Testing & tuning | ~$50 in API calls |
| **Total** | **~$50** |

### Monthly Range: **$40-80**

Lower if usage is light, higher with heavy RAG queries.

---

## Phase 2: Onboarding + Review Agents

### Features
- Lab onboarding agent (conversational)
- Review assistant agent
- Tool-use capabilities

### Usage Assumptions (per month)

| Activity | Volume | Tokens/Activity | Total Tokens |
|----------|--------|-----------------|--------------|
| Onboarding sessions | 5 new tenants | 50,000 (10 turns) | 250,000 |
| Review analysis | 400 certs | 7,000 | 2,800,000 |
| Revision suggestions | 100 certs | 3,000 | 300,000 |
| **Total** | | | **3,350,000** |

### Cost Breakdown

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| **Claude Sonnet** (agents) | 3.35M tokens × ($3 + $15)/1M | $60 |
| **Document parsing** (NABL certs) | 5 × 10 pages × $0.10 | $5 |
| **Buffer (20%)** | | $13 |
| **Total** | | **$78** |

### One-Time Setup Costs

| Item | Cost |
|------|------|
| Agent development & testing | ~$100 in API calls |
| Prompt engineering | Included above |
| **Total** | **~$100** |

### Monthly Range: **$60-120**

Scales with number of new tenants and certificates reviewed.

---

## Phase 3: Customer Service + Anomaly Detection

### Features
- Customer chat agent (web + WhatsApp)
- Anomaly detection ML
- Drift prediction

### Usage Assumptions (per month)

| Activity | Volume | Tokens/Activity | Total Tokens |
|----------|--------|-----------------|--------------|
| Customer chat sessions | 500 | 5,000 (5 turns) | 2,500,000 |
| Anomaly analysis | 1,500 readings | 1,000 | 1,500,000 |
| Drift reports | 50 instruments | 2,000 | 100,000 |
| **Total** | | | **4,100,000** |

### Cost Breakdown

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| **Claude Haiku** (chat, simple) | 3M tokens × ($0.25 + $1.25)/1M | $4.50 |
| **Claude Sonnet** (complex queries) | 1.1M tokens × ($3 + $15)/1M | $20 |
| **WhatsApp Business API** | 500 conversations × $0.05 | $25 |
| **Twilio (optional)** | Base + messages | $20-50 |
| **Buffer (20%)** | | $14 |
| **Total** | | **$83-113** |

### One-Time Setup Costs

| Item | Cost |
|------|------|
| WhatsApp Business verification | $0 (but takes time) |
| Twilio setup | $0 |
| Agent development & testing | ~$100 |
| ML model training (if custom) | ~$100 |
| **Total** | **~$200** |

### Monthly Range: **$80-150**

WhatsApp costs scale with conversation volume.

---

## Phase 4: Code Maintenance

### Features
- Dependabot (free)
- AI PR review
- Scheduled code health checks

### Usage Assumptions (per month)

| Activity | Volume | Tokens/Activity | Total Tokens |
|----------|--------|-----------------|--------------|
| PR reviews | 20 PRs | 10,000 | 200,000 |
| Code health scans | 4 (weekly) | 20,000 | 80,000 |
| **Total** | | | **280,000** |

### Cost Breakdown

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| **Dependabot** | Free (GitHub) | $0 |
| **Claude Sonnet** (PR review) | 280K tokens × $18/1M | $5 |
| **GitHub Actions** | Included in existing | $0 |
| **Buffer** | | $2 |
| **Total** | | **$7** |

### Monthly Range: **$5-20**

Very low cost since it's on-demand, not continuous.

---

## Infrastructure Costs

### Already Included (Existing Stack)

| Service | Current Cost | AI Impact |
|---------|--------------|-----------|
| Cloud SQL (Postgres) | ~$30/mo | pgvector adds ~5% CPU |
| GKE | ~$70/mo | AI service adds 1 small pod |
| Redis | ~$15/mo | Cache AI responses |
| **Additional** | | **+$10-20/mo** |

### New Services (Optional)

| Service | Purpose | Cost |
|---------|---------|------|
| Pinecone | Managed vector DB | $70/mo (if not using pgvector) |
| Unstructured.io | Document parsing | $0.10/page |
| LlamaParse | PDF extraction | $0.003/page |

**Recommendation:** Stick with pgvector (free) unless you hit scale issues.

---

## Cost by Tenant Tier

If offering AI features to paying tenants:

| Tier | AI Features | Est. Usage | Monthly AI Cost |
|------|-------------|------------|-----------------|
| **Starter** | Basic RAG only | 100 queries | $5-10 |
| **Growth** | RAG + Auto-fill | 300 queries, 100 certs | $20-40 |
| **Scale** | All features | 500+ queries, 200+ certs | $50-100 |
| **Internal** | Unlimited | Variable | $100-200 |

### Pricing Recommendation

| Tier | AI Add-on Price | Margin |
|------|-----------------|--------|
| Starter | ₹500/mo ($6) | 20-50% |
| Growth | Included | Built into price |
| Scale | Included | Built into price |

---

## Cost Optimization Strategies

### 1. Model Selection

```typescript
// Use Haiku for simple tasks, Sonnet for complex
async function selectModel(task: string): Promise<string> {
  const simpleTaskPatterns = [
    'status check',
    'download link',
    'yes/no classification'
  ]
  
  const isSimple = simpleTaskPatterns.some(p => task.includes(p))
  return isSimple ? 'claude-haiku-4' : 'claude-sonnet-4'
}
```

**Savings:** 70-80% on simple tasks

### 2. Response Caching

```typescript
// Cache common RAG queries
const cacheKey = `rag:${tenantId}:${hashQuery(query)}`
const cached = await redis.get(cacheKey)
if (cached) return JSON.parse(cached)

// Cache for 1 hour
await redis.setex(cacheKey, 3600, JSON.stringify(result))
```

**Savings:** 30-50% on repeated queries

### 3. Batch Processing

```typescript
// Batch certificate analysis instead of one-by-one
async function batchAnalyze(certIds: string[]) {
  const certs = await loadCertificates(certIds)
  const combined = formatForBatch(certs)
  
  // Single API call for multiple certs
  const result = await claude.analyze(combined)
  return parseResults(result, certIds)
}
```

**Savings:** 20-40% on batch operations

### 4. Prompt Optimization

| Before | After | Token Reduction |
|--------|-------|-----------------|
| Long system prompts | Cached system prompts | 50% input |
| Full document context | Relevant chunks only | 60% input |
| Verbose responses | Structured JSON | 40% output |

---

## Total Cost Summary

### Monthly Operating Costs

| Scenario | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Total |
|----------|---------|---------|---------|---------|-------|
| **Low usage** | $40 | $60 | $80 | $5 | **$185** |
| **Medium usage** | $60 | $90 | $115 | $10 | **$275** |
| **High usage** | $80 | $120 | $150 | $20 | **$370** |

### One-Time Setup Costs

| Phase | Setup Cost |
|-------|------------|
| Phase 1 | $50 |
| Phase 2 | $100 |
| Phase 3 | $200 |
| Phase 4 | $0 |
| **Total** | **$350** |

### Year 1 Total Cost

| Scenario | Monthly × 12 | Setup | Year 1 Total |
|----------|--------------|-------|--------------|
| Low | $185 × 12 | $350 | **$2,570** |
| Medium | $275 × 12 | $350 | **$3,650** |
| High | $370 × 12 | $350 | **$4,790** |

---

## ROI Analysis

### Time Savings (Conservative)

| Task | Current Time | With AI | Savings/Month |
|------|--------------|---------|---------------|
| Cert creation | 45 min × 300 | 20 min × 300 | 125 hours |
| Review | 20 min × 300 | 5 min × 300 | 75 hours |
| Customer support | 4 hrs/day | 1 hr/day | 60 hours |
| Onboarding | 4 hrs × 5 | 0.5 hrs × 5 | 17.5 hours |
| **Total** | | | **277.5 hours** |

### Value of Time Saved

| Role | Hourly Cost | Hours Saved | Value |
|------|-------------|-------------|-------|
| Engineer | ₹500/hr | 125 | ₹62,500 |
| Reviewer | ₹600/hr | 75 | ₹45,000 |
| Admin | ₹400/hr | 77.5 | ₹31,000 |
| **Total** | | | **₹138,500/mo** |

### ROI Calculation

```
Monthly AI Cost (medium): ₹22,000 (~$275)
Monthly Value Created: ₹138,500

ROI = (Value - Cost) / Cost × 100
ROI = (138,500 - 22,000) / 22,000 × 100
ROI = 530%
```

**Payback Period:** < 1 month

---

## Recommendations

1. **Start with Phase 1** - Lowest cost, immediate value
2. **Use Haiku for 70% of tasks** - Huge cost savings
3. **Implement caching early** - 30-50% reduction
4. **Monitor usage weekly** - Catch runaway costs
5. **Set spending alerts** - $100/day max initially

### Budget Allocation

```
Month 1-2: Phase 1 only ($50-80/mo)
Month 3-4: Add Phase 2 ($120-180/mo)
Month 5-6: Add Phase 3 ($200-300/mo)
Month 7+:  Optimize & scale
```
