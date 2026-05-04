# Testing Infrastructure — Current State Reference

> Snapshot of the testing setup as of 2026-05-04.
> For the remediation plan, see [README.md](./README.md).

## Test Runner

**Vitest 2.1.0** — used across all packages. No Jest anywhere.

**Playwright** — E2E tests in `apps/web-hta/e2e/`.

## Workspace Configuration

**`vitest.workspace.ts`** (root):
```typescript
export default defineWorkspace([
  'apps/*/vitest.config.ts',
  'packages/*/vitest.config.ts',
])
```

## Turbo Tasks

From `turbo.json`:

| Task | Depends On | Inputs | Env Vars |
|------|-----------|--------|----------|
| `test` | `^build` | `src/**`, `tests/**` | — |
| `test:unit` | `^build` | `src/**`, `tests/unit/**` | — |
| `test:integration` | `^build` | `src/**`, `tests/integration/**` | `DATABASE_URL`, `REDIS_URL` |
| `test:e2e` | `build` | `src/**`, `e2e/**` | `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |

## Per-Package Test Scripts

### Apps

| Package | `test` | `test:unit` | `test:integration` | `test:e2e` |
|---------|--------|-------------|-------------------|------------|
| `@hta/api` | `vitest run` | `vitest run tests/unit` | `vitest run -c vitest.integration.config.ts` | — |
| `@hta/worker` | `echo 'No tests yet'` | `vitest run tests/unit` | `vitest run --config vitest.integration.config.ts` | — |
| `@hta/web` (web-hta) | `vitest run` | `vitest run tests/unit` | `vitest run --config vitest.integration.config.ts` | `playwright test` |

### Packages

| Package | `test` | `test:unit` |
|---------|--------|-------------|
| `@hta/database` | `echo 'No tests yet'` | `vitest run` |
| `@hta/shared` | `vitest run` | `vitest run` |
| `@hta/emails` | `echo 'No tests yet'` | `vitest run` |
| `@hta/ui` | `echo 'No tests yet'` | `vitest run` |
| `@hta/assets` | — | — |

### Not Tested

| Package | Notes |
|---------|-------|
| `apps/desktop` | No test scripts, no vitest config |
| `packages/assets` | Generation script only, no tests |

## Vitest Configs

### Unit Test Configs

| Config | Environment | setupFiles | Timeout | Coverage Thresholds |
|--------|------------|------------|---------|-------------------|
| `apps/api/vitest.config.ts` | node | `tests/setup.ts` | 10s | None |
| `apps/worker/vitest.config.ts` | node | `tests/setup.ts` | 10s | None |
| `apps/web-hta/vitest.config.ts` | jsdom | `tests/setup.ts` | default | 60/50/80/60 |
| `packages/database/vitest.config.ts` | node | — | default | None |
| `packages/shared/vitest.config.ts` | node | — | default | None |
| `packages/emails/vitest.config.ts` | node | — | default | None |

### Integration Test Configs

| Config | setupFiles | Sequential? | Timeout |
|--------|-----------|-------------|---------|
| `apps/api/vitest.integration.config.ts` | **None** | Yes (singleFork) | 30s |
| `apps/worker/vitest.integration.config.ts` | `vitest-setup.ts` | Yes (singleFork) | 30s |
| `apps/web-hta/vitest.integration.config.ts` | `postgres-setup.ts` | Yes (fileParallelism: false) | 30s |

## Test File Inventory

### Unit Tests (56 files)

```
apps/api/tests/unit/
  health.test.ts
  queue.test.ts
  subscription.test.ts

apps/worker/tests/unit/
  cleanup.test.ts
  email.test.ts
  notifications.test.ts

apps/web-hta/tests/unit/
  (52 files — React components, API utilities, hooks)

packages/database/tests/
  index.test.ts
  tenant-context.test.ts

packages/shared/tests/
  cache.test.ts, cors.test.ts, health.test.ts, metrics.test.ts,
  pagerduty.test.ts, rate-limiter.test.ts, secrets.test.ts,
  sentry.test.ts, storage.test.ts, totp.test.ts, webauthn.test.ts

packages/emails/tests/
  index.test.ts
  render.test.ts

packages/ui/tests/
  components.test.ts
  themes.test.ts
```

### Integration Tests (21 files)

```
apps/api/tests/integration/
  admin-authorization.test.ts
  auth.test.ts
  certificates.test.ts
  customer.test.ts
  instruments.test.ts
  notifications.test.ts
  queue-integration.test.ts
  service-communication.test.ts
  workflows.test.ts
  setup/ (test-db.ts, fixtures.ts)

apps/worker/tests/integration/
  cleanup-jobs.test.ts
  queue.test.ts
  setup/ (postgres-setup.ts, vitest-setup.ts, test-helpers.ts)

apps/web-hta/tests/integration/
  auth.test.ts
  certificates.test.ts
  customer-portal.test.ts
  database-queue.test.ts
  queue-jobs.test.ts
  service-smoke.test.ts
  setup/ (postgres-setup.ts, test-helpers.ts)
```

### E2E Tests (5 files)

```
apps/web-hta/e2e/
  auth.setup.ts                          — 4 role-based auth flows
  journeys/
    admin-authorization.spec.ts          — 11 tests
    certificate-flow.spec.ts             — 8 tests
    customer-flow.spec.ts                — 13 tests
    reviewer-flow.spec.ts                — 7 tests
  visual-regression.spec.ts              — 15 visual snapshots
  fixtures/
    test-data.ts                         — test users, cert data, status labels
    test-utils.ts                        — login helpers, page stabilization
  pages/                                 — empty (planned but not implemented)
  evals/                                 — empty
```

### Compliance Tests (2 files, orphaned)

```
tests/compliance/
  data-inventory.test.ts
  gdpr.test.ts
```

These are not referenced in any turbo task or package.json script.

## Playwright Config

**File:** `apps/web-hta/playwright.config.ts`

| Setting | Value |
|---------|-------|
| Base URL | `http://localhost:3000` |
| Test timeout | 30s |
| Assertion timeout | 5s |
| CI workers | 4 |
| CI retries | 1 |
| Trace | on-first-retry |
| Screenshots | only-on-failure |
| Video | on-first-retry (CI), off (local) |

**Projects (7):**

| Project | Role | Browser | Storage State |
|---------|------|---------|--------------|
| setup | — | chromium | Creates auth JSON files |
| engineer-tests | Engineer | chromium | `e2e/.auth/engineer.json` |
| reviewer-tests | Reviewer | chromium | `e2e/.auth/reviewer.json` |
| admin-tests | Admin | chromium | `e2e/.auth/admin.json` |
| customer-tests | Customer | chromium | `e2e/.auth/customer.json` |
| chromium (visual) | — | chromium | — |
| firefox (public) | — | firefox | — |

**Test Users (seeded by `prisma/seed.ts`):**

| Role | Email | Password |
|------|-------|----------|
| Engineer | `kiran@htaipl.com` | `engineer123` |
| Reviewer | `rajesh@htaipl.com` | `engineer123` |
| Admin | `admin@htaipl.com` | `admin123` |
| Customer | `customer@example.com` | `customer123` |

## CI Pipeline

**File:** `.github/workflows/ci.yml`

```
changes ─┐
         ├─ code-quality ─┬─ unit-tests ─────────────┐
         │                 │                           ├─ e2e-tests (3 shards)
         │                 ├─ integration-tests ───────┘
         │                 │
         └─ build ─────────┘
         
security-scan (parallel with code-quality)
```

| Job | Services | Key Command |
|-----|----------|-------------|
| code-quality | — | `pnpm turbo run lint` + `pnpm turbo run typecheck` |
| security-scan | — | `pnpm audit --audit-level=high` |
| unit-tests | — | `pnpm turbo run test:unit` |
| integration-tests | PostgreSQL 16, Redis 7 | `pnpm turbo run test:integration --concurrency=1` |
| build | — | Docker buildx dry-run (api, worker, web) |
| e2e-tests | PostgreSQL 16, Redis 7 | Playwright sharded across 3 runners |

## Docker Builds

| Dockerfile | Base | Build Order | Runner | Health Check |
|-----------|------|------------|--------|-------------|
| `apps/api/Dockerfile` | node:20-alpine | database → shared → emails → api | `htaapi:1001` | `wget /health` |
| `apps/worker/Dockerfile` | node:20-alpine | database → shared → emails → worker | `htaworker:1001` | None |
| `apps/web-hta/Dockerfile` | node:20-alpine | assets gen → database → shared → emails → web | `nextjs:1001` | None |
