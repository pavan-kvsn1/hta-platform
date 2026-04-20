# Performance Baselines

**Last Updated:** 2026-04-16
**Status:** Initial baselines to be measured

This document tracks performance targets and measured baselines for the HTA Platform.

## API Performance Targets

| Metric | Target | Critical Threshold | Current Measured |
|--------|--------|-------------------|------------------|
| API p50 latency | 70ms | 150ms | TBD |
| API p95 latency | 120ms | 300ms | TBD |
| API p99 latency | 200ms | 500ms | TBD |
| Error rate | < 0.1% | < 1% | TBD |

## Frontend Performance Targets

| Metric | Target | Critical Threshold | Current Measured |
|--------|--------|-------------------|------------------|
| TTFB (Time to First Byte) | 150ms | 400ms | TBD |
| LCP (Largest Contentful Paint) | 1.8s | 2.5s | TBD |
| FID (First Input Delay) | 40ms | 100ms | TBD |
| CLS (Cumulative Layout Shift) | < 0.1 | < 0.25 | TBD |

## Database Performance Targets

| Metric | Target | Critical Threshold | Current Measured |
|--------|--------|-------------------|------------------|
| Query p50 latency | 30ms | 80ms | TBD |
| Query p95 latency | 40ms | 100ms | TBD |
| Connection pool usage | < 60% | < 80% | TBD |

## Worker Performance Targets

| Metric | Target | Critical Threshold | Current Measured |
|--------|--------|-------------------|------------------|
| Job processing p95 | 1.5s | 5s | TBD |
| Queue depth (sustained) | < 50 | < 100 | TBD |
| Email delivery p95 | 3s | 10s | TBD |

## Endpoint-Specific Targets

### Certificate APIs

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| `GET /api/certificates` (list) | 50ms | 100ms | 150ms |
| `GET /api/certificates/:id` | 30ms | 60ms | 100ms |
| `POST /api/certificates` | 100ms | 200ms | 300ms |
| `PATCH /api/certificates/:id` | 80ms | 150ms | 250ms |

### Dashboard APIs

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| `GET /api/dashboard/stats` | 100ms | 200ms | 300ms |
| `GET /api/dashboard/recent` | 50ms | 100ms | 150ms |

### Auth APIs

| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| `POST /api/auth/login` | 150ms | 250ms | 400ms |
| `POST /api/auth/logout` | 30ms | 50ms | 100ms |
| `GET /api/auth/session` | 20ms | 40ms | 80ms |

## Load Testing Scenarios

### Normal Load
- **Rate:** 50 requests/second
- **Duration:** 5 minutes
- **VUs:** 20-50
- **Success Criteria:** p95 < 200ms, error rate < 1%

### Spike Test
- **Peak Rate:** 200 requests/second
- **Spike Duration:** 2 minutes
- **Recovery Time:** < 30 seconds
- **Success Criteria:** p95 < 500ms during spike, error rate < 5%

### Soak Test
- **Rate:** 30 requests/second
- **Duration:** 1 hour
- **Success Criteria:** No memory leaks, consistent latency, p95 < 200ms

## Running Load Tests

```bash
# Install k6
# See: https://k6.io/docs/getting-started/installation/

# Run normal load test
k6 run tests/load/scenarios/api-baseline.ts

# Run spike test
k6 run tests/load/scenarios/spike-test.ts

# Run soak test (1 hour)
k6 run tests/load/scenarios/soak-test.ts

# With custom API URL and auth token
API_URL=https://api-staging.example.com AUTH_TOKEN=xxx k6 run tests/load/scenarios/api-baseline.ts
```

## Automated Testing

Load tests run automatically via GitHub Actions:
- **Nightly:** Normal load test at 2 AM UTC
- **Manual:** Can be triggered with scenario selection
- **Failure Alerts:** Email via Resend (uses existing infrastructure)

See `.github/workflows/performance.yml` for configuration.

**Required Secrets:**
- `RESEND_API_KEY` - Already configured for worker email
- `ALERT_EMAIL` - Recipient for failure alerts

## Caching Strategy

### Cache TTL Configuration

| Data Type | TTL | SWR | Invalidation |
|-----------|-----|-----|--------------|
| Static reference data | 1 hour | 24 hours | On update |
| User data | 5 minutes | 10 minutes | On user action |
| Dashboard stats | 1 minute | 5 minutes | On certificate change |
| List data | 1 minute | 2 minutes | On create/update/delete |
| Session data | 30 seconds | 1 minute | On logout |

### Cache Keys

See `packages/shared/src/cache/strategy.ts` for cache key patterns.

## Monitoring

- **Error Tracking:** Sentry
- **Performance Monitoring:** Sentry APM
- **Custom Metrics:** Sentry Metrics API
- **Dashboards:** GCP Cloud Monitoring (Terraform-managed)

## Alerting Thresholds

| Alert | Threshold | Duration | Action |
|-------|-----------|----------|--------|
| High Error Rate | > 5% | 5 minutes | Page on-call |
| High Latency (API) | p95 > 500ms | 5 minutes | Page on-call |
| High Latency (DB) | p95 > 100ms | 5 minutes | Notify team |
| Queue Backlog | depth > 100 | 10 minutes | Notify team |

## Performance Improvement History

| Date | Change | Impact |
|------|--------|--------|
| 2026-04-16 | Initial baseline setup | - |

---

## Measurement Process

1. **Baseline Measurement**
   - Run load tests against staging environment
   - Record results in this document
   - Update "Current Measured" columns

2. **Regression Detection**
   - Compare nightly test results with baselines
   - Alert if metrics degrade by > 20%

3. **Continuous Improvement**
   - After optimizations, re-measure and update baselines
   - Document changes in history table
