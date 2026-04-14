# Phase 9B: API Separation - Detailed Implementation Plan

**Document Version:** 3.0
**Created:** 2026-04-13
**Last Updated:** 2026-04-14 (Full implementation audit)
**Status:** Implementation In Progress

---

## Implementation Status Summary

> **Last Audited:** 2026-04-14

| Phase | Section | Status | Completion | Notes |
|-------|---------|--------|------------|-------|
| **Phase 1** | Monorepo Setup | ✅ Complete | 100% | Turborepo + pnpm workspace |
| **Phase 2** | Shared Packages | ✅ Complete | 95% | database, shared, ui, emails |
| **Phase 3** | API Extraction | ✅ Complete | 95% | 6,881 lines Fastify routes |
| **Phase 4** | Worker Service | ✅ Complete | 90% | 417 lines BullMQ jobs |
| **Phase 5** | Load Balancer | ✅ Complete | 100% | GKE Gateway API manifests |
| **Phase 6** | Deployment | ✅ Complete | 100% | Argo CD + Rollouts + GitHub Actions |
| **Phase 14** | Docker | ✅ Complete | 100% | All Dockerfiles + compose files |
| **Phase 15** | CI/CD | ✅ Complete | 100% | 23,363 lines GitHub Actions |
| **Phase 16** | Testing | 🟡 Partial | 57% | 490 tests / 865 in hta-calibration |

### Code vs Test Coverage

```
┌─────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION STATUS                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Feature Code:  ████████████████████████████████████  95%   │
│  Infrastructure: ████████████████████████████████████  100%  │
│  Test Coverage:  ███████████████████░░░░░░░░░░░░░░░░  57%   │
│                                                              │
│  ⚠️  Test migration in progress: 490/865 tests (57%)        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Test Migration Progress (2026-04-14)

| Package | Tests | Status |
|---------|-------|--------|
| @hta/web (unit tests) | 174 | ✅ Certificate store, status, number, TAT, feedback |
| @hta/web (component tests) | 79 | ✅ StatusBadge, TATBadge, Button, queue |
| @hta/web (e2e) | 50 | ✅ Journey tests + Chromatic visual regression |
| @hta/shared | 126 | ✅ Cache, rate-limiter, CORS, secrets, storage |
| @hta/api | 5 | ✅ Health endpoint |
| @hta/worker | 6 | ✅ Email job tests |
| **Total** | **~490** | **57% coverage** |

### Next Steps

1. **P1 - Component Tests:** Migrate more component tests (~50 remaining)
2. **P1 - E2E Tests:** Migrate remaining journey tests (~50 remaining)
3. **P2 - Utils/Hooks Tests:** Migrate hooks and utility tests (~80 tests)
4. **P3 - Eval Tests:** Migrate accessibility tests (~100 tests)

> **Architecture Decision (2026-04-14):** Changed from Cloud Run to **GKE Standard** for better control over networking, traffic management, and cost predictability. Traffic splitting uses **GKE Gateway API** (not Istio) for simplicity and zero sidecar overhead. Deployments via **Argo CD** (GitOps) with **Argo Rollouts** for automated canary releases. Argo CD protected by **IAP** (Google login) at `argocd.hta-calibration.com`.
**Estimated Effort:** 3-4 weeks
**Risk Level:** High

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Decision Framework](#2-decision-framework)
3. [Migration Approach: New Repository](#3-migration-approach-new-repository)
4. [Current Architecture](#4-current-architecture)
5. [Target Architecture](#5-target-architecture)
6. [Monorepo Structure](#6-monorepo-structure)
7. [Migration Strategy](#7-migration-strategy)
8. [Phase 1: Monorepo Setup](#8-phase-1-monorepo-setup)
9. [Phase 2: Shared Packages](#9-phase-2-shared-packages)
10. [Phase 3: API Extraction](#10-phase-3-api-extraction)
11. [Phase 4: Worker Service](#11-phase-4-worker-service)
12. [Phase 5: Load Balancer & Routing](#12-phase-5-load-balancer--routing)
13. [Phase 6: Deployment & Cutover](#13-phase-6-deployment--cutover)
14. [Docker Configuration](#14-docker-configuration)
15. [GitHub Actions CI/CD](#15-github-actions-cicd)
16. [Testing Strategy](#16-testing-strategy)
17. [Monitoring Implementation](#17-monitoring-implementation)
18. [Security Enhancements](#18-security-enhancements)
19. [Disaster Recovery](#19-disaster-recovery)
20. [Secrets Infrastructure](#20-secrets-infrastructure)
21. [Performance Management](#21-performance-management)
22. [Compliance Management](#22-compliance-management)
23. [Rollback Plan](#23-rollback-plan)
24. [Post-Migration Checklist](#24-post-migration-checklist)

---

## 1. Executive Summary

### Why Separate?

| Benefit | Description |
|---------|-------------|
| **Independent Scaling** | Scale API separately from frontend based on load |
| **Resource Optimization** | Allocate more memory/CPU to API, less to frontend |
| **Deployment Isolation** | Deploy API without redeploying frontend |
| **Team Scalability** | Multiple teams can work independently |
| **Cost Efficiency** | Right-size resources for each service |

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| Repository | Single Next.js app | Turborepo monorepo |
| Frontend | Next.js (pages + API) | Next.js (pages only) |
| API | Next.js API routes | Standalone Fastify API service |
| Background Jobs | In-process | Separate BullMQ worker service |
| Database | Direct connection | Cloud SQL (private IP) |
| Deployment | Single Cloud Run | GKE Standard (3 deployments) |
| Traffic Management | N/A | GKE Gateway API |
| WAF | N/A | Cloud Armor |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking changes | Medium | High | Feature flags, gradual rollout |
| Increased complexity | High | Medium | Good documentation, monitoring |
| Deployment failures | Medium | High | Blue-green deployment, rollback plan |
| Performance regression | Low | Medium | Load testing before cutover |
| Data inconsistency | Low | High | Transaction handling, idempotency |

---

## 2. Decision Framework

### When to Proceed

Proceed with separation when ANY of these thresholds are met:

| Metric | Current | Threshold | Status |
|--------|---------|-----------|--------|
| API latency p95 | ~150ms | > 300ms consistently | ⏳ Not met |
| Pod replicas needed | 1-2 | > 5 concurrent | ⏳ Not met |
| Monthly API requests | ~100K | > 1M | ⏳ Not met |
| Team size | 1-2 | > 4 developers | ⏳ Not met |
| Deploy frequency | Weekly | > Daily | ⏳ Not met |
| API vs Frontend changes | Mixed | 80%+ API only | ⏳ Not met |

### Prerequisites

Before starting separation:

- [x] CORS configuration ready (`src/lib/security/cors.ts`)
- [x] Rate limiting ready (`src/lib/security/rate-limiter.ts`)
- [x] Prisma Accelerate ready (`src/lib/prisma.ts`)
- [x] Structured logging (`src/lib/logger.ts`)
- [x] Error tracking (Sentry)
- [ ] Load testing baseline established
- [ ] Monitoring dashboards in place
- [ ] Team aligned on timeline

### Existing Features Requiring Migration

The current monolith has these features that must be properly migrated to the monorepo structure:

| Feature Category | Current Location | Target Location | Migration Complexity |
|-----------------|------------------|-----------------|---------------------|
| **Security Hardening** | | | |
| Password change UI | `src/app/(auth)/` | `apps/web/` | Low |
| Forgot password flow | `src/app/api/auth/` | `apps/api/routes/auth/` | Medium |
| Rate limiting | `src/lib/security/` | `packages/shared/security/` | Medium |
| Auth audit logging | `src/lib/audit.ts` | `packages/shared/audit/` | Low |
| Session management | `src/lib/auth.ts` | `apps/api/` + `apps/web/` | High |
| **Email Notifications** | | | |
| Email templates | `src/emails/` | `packages/shared/emails/` | Low |
| Notification service | `src/lib/notifications/` | `apps/worker/` | High |
| Workflow triggers | API routes | `apps/api/` → queue → `apps/worker/` | High |
| **Customer Access** | | | |
| DownloadToken model | `prisma/schema.prisma` | `packages/database/` | Low |
| Download link API | `src/app/api/admin/` | `apps/api/routes/admin/` | Medium |
| Customer download page | `src/app/customer/` | `apps/web/` | Low |
| **Caching** | | | |
| Cache providers | `src/lib/cache/` | `packages/shared/cache/` | Medium |
| Cache utilities | `src/lib/cache/index.ts` | `packages/shared/cache/` | Low |
| Invalidation hooks | Throughout codebase | Service-specific | High |
| **Security Headers** | | | |
| CSP, HSTS, etc. | `next.config.ts` | `apps/web/next.config.ts` | Low |
| CORS | `src/lib/security/cors.ts` | `apps/api/middleware/` | Medium |
| Account lockout | `src/lib/security/` | `packages/shared/security/` | Medium |

---

## 3. Migration Approach: New Repository

### Why a New Repository?

Given the drastic architectural change (single Next.js monolith → Turborepo with 3 services), we recommend creating a **new repository** rather than migrating in-place.

| Factor | In-Place Migration | New Repository |
|--------|-------------------|----------------|
| Git history | ✅ Preserved | ❌ Lost |
| Production risk | ⚠️ Higher (same codebase) | ✅ Lower (isolated) |
| Complexity | ⚠️ High (branching strategy) | ✅ Simpler (clean start) |
| Parallel development | ⚠️ Difficult | ✅ Easy |
| CI/CD migration | ⚠️ Complex (same repo) | ✅ Fresh setup |
| Team coordination | ⚠️ Same repo conflicts | ✅ Clear separation |
| Rollback path | ✅ Git revert | ✅ Switch repos |

### Decision: New Repository

**Rationale:**
1. **Drastic structural change**: `src/app/api/*` → `apps/api/`, `src/lib/*` → `packages/shared/` is a complete restructuring
2. **3 separate deployment targets**: web, api, worker - each with their own Dockerfile, CI pipeline, Cloud Run service
3. **Clean Turborepo setup**: Avoids legacy file structure baggage
4. **Multi-tenancy ready**: Structure supports multiple branded web apps from day one
5. **Natural cutover point**: When new repo is stable in dev, promote to prod

### Environment Strategy

**Current State:** Old repo is deployed only in dev. No production deployment yet.

| Phase | Dev Environment | Prod Environment |
|-------|-----------------|------------------|
| **Current** | Old repo deployed | None |
| **Migration** | Destroy → Deploy new repo | None |
| **Stabilization** | Test & iterate in cloud | None |
| **Launch** | Keep as staging | Promote from dev |

**Key points:**
- No local testing required during migration - dev environment is the test bed
- Dev instance can be destroyed and rebuilt freely
- Once stable in dev, promote directly to prod
- After launch, dev becomes the permanent staging environment

```
┌─────────────────────────────────────────────────────────────┐
│                    MIGRATION FLOW                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  OLD REPO (dev)          NEW REPO                           │
│  ┌──────────┐            ┌──────────┐                       │
│  │ Monolith │  DESTROY   │ Turborepo│                       │
│  │ Next.js  │ ────────── │ Monorepo │                       │
│  └──────────┘     │      └──────────┘                       │
│                   │            │                             │
│                   ▼            ▼                             │
│              ┌─────────────────────┐                        │
│              │    DEV ENVIRONMENT   │                        │
│              │   (GCP Dev Project)  │                        │
│              └──────────┬──────────┘                        │
│                         │                                    │
│                         │ Stabilize & Test                   │
│                         │                                    │
│                         ▼                                    │
│              ┌─────────────────────┐                        │
│              │   PROD ENVIRONMENT   │                        │
│              │  (GCP Prod Project)  │                        │
│              └─────────────────────┘                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### New Repository Setup

```bash
# Create new repository
gh repo create pavan-kvsn1/hta-platform --private

# Initialize with Turborepo
npx create-turbo@latest hta-platform
cd hta-platform

# Set up workspace structure
mkdir -p apps/{web,api,worker}/src
mkdir -p packages/{database,shared,emails,ui}/src
```

### Migration Timeline

```
Week 1-2: New Repo Setup + Dev Destruction
├── Create github.com/pavan-kvsn1/hta-platform
├── Initialize Turborepo structure (multi-tenant ready)
├── Set up apps/web-hta, apps/api, apps/worker, packages/*
├── Configure CI/CD pipelines
├── DESTROY old dev instance in GCP
└── Deploy new repo skeleton to dev

Week 3-4: Code Migration (Dev Environment)
├── Migrate packages/database (schema + tenant_id)
├── Migrate packages/shared (auth, cache, security, emails)
├── Migrate apps/api routes
├── Migrate apps/web-hta pages
└── Test directly in dev environment (no local)

Week 5: Stabilization (Dev Environment)
├── Fix bugs found in dev testing
├── Load testing in dev
├── Security audit
└── Iterate until stable

Week 6: Production Launch
├── Create prod GCP project (if not exists)
├── Deploy to prod from stable dev
├── DNS setup for prod
├── Dev becomes staging environment
└── Archive old repo
```

### Old Repository Handling

```bash
# After successful prod launch
# Archive the old repository
gh repo edit pavan-kvsn1/hta_calibrates --archived

# Keep for reference:
# - Git history (blame, bisect for old bugs)
# - Reference implementation
# - Do NOT maintain or deploy
```

### GitHub Project Settings (New Repo)

| Setting | Action |
|---------|--------|
| Branch protection | Configure for `main` |
| Secrets | Set up fresh (don't copy - clean start) |
| Variables | Configure per environment |
| Environments | `dev`, `prod` |
| Actions | Set up Workload Identity Federation |
| Webhooks | Configure for new repo |

### GCP Project Structure

```
GCP Organization
├── hta-calibration-dev          # Development/Staging
│   ├── GKE Standard (web, api, worker pods)
│   ├── Cloud SQL (dev database)
│   ├── Memorystore Redis (dev)
│   ├── GCS Buckets (dev)
│   └── Secret Manager (dev secrets)
│
└── hta-calibration-prod         # Production
    ├── GKE Standard (web, api, worker pods)
    ├── Cloud SQL (prod database + HA)
    ├── Memorystore Redis (prod, HA)
    ├── GCS Buckets (prod, multi-region)
    ├── Cloud Armor WAF
    └── Secret Manager (prod secrets)
```

---

## 4. Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloud Run (Single Service)               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Next.js Application                   │  │
│  │                                                        │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │    Pages     │  │  API Routes  │  │   Workers   │  │  │
│  │  │              │  │              │  │             │  │  │
│  │  │ /dashboard   │  │ /api/auth/*  │  │ Email Jobs  │  │  │
│  │  │ /customer/*  │  │ /api/cert/*  │  │ Cleanup     │  │  │
│  │  │ /admin/*     │  │ /api/admin/* │  │ Notifs      │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘  │  │
│  │                          │                             │  │
│  │                          ▼                             │  │
│  │                 ┌──────────────────┐                   │  │
│  │                 │  Prisma Client   │                   │  │
│  │                 └────────┬─────────┘                   │  │
│  └──────────────────────────┼────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │
                     ┌────────▼────────┐
                     │    Cloud SQL    │
                     │   PostgreSQL    │
                     └─────────────────┘
```

### Current File Structure

```
hta-calibration/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes (to be extracted)
│   │   │   ├── auth/
│   │   │   ├── admin/
│   │   │   ├── customer/
│   │   │   └── certificates/
│   │   ├── (dashboard)/       # Staff pages
│   │   ├── admin/             # Admin pages
│   │   └── customer/          # Customer pages
│   ├── components/            # React components
│   ├── lib/                   # Shared utilities
│   │   ├── auth.ts
│   │   ├── prisma.ts
│   │   ├── logger.ts
│   │   └── services/
│   └── emails/               # Email templates
├── prisma/
│   └── schema.prisma
└── package.json
```

### Pain Points

1. **Resource contention**: API and SSR compete for same CPU/memory
2. **Deployment coupling**: Frontend change requires full redeploy
3. **Scaling inefficiency**: Can't scale API independently
4. **Background job reliability**: Jobs run in request context

---

## 5. Target Architecture

> **Decision:** GKE Standard over Cloud Run for better networking control, predictable costs, and native K8s tooling.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GKE Gateway API (HTTPRoute)                       │
│         ┌─────────────────────────────────────────────┐             │
│         │        Cloud Load Balancer (HTTPS)          │             │
│         │        + Cloud Armor WAF                    │             │
│         │        + Managed SSL Certificate            │             │
│         └─────────────────────┬───────────────────────┘             │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │ app.hta.com/*        │ app.hta.com/api/*    │
         │                      │ api.hta.com/*        │
         ▼                      ▼                      
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│    hta-web       │  │    hta-api       │  │   hta-worker     │
│   (GKE Pod)      │  │   (GKE Pod)      │  │   (GKE Pod)      │
│                  │  │                  │  │                  │
│  - Next.js SSR   │  │  - Fastify API   │  │  - BullMQ jobs   │
│  - Static pages  │  │  - Auth logic    │  │  - Email jobs    │
│  - React SPA     │  │  - Business ops  │  │  - Cleanup jobs  │
│                  │  │  - CORS enabled  │  │  - Notifications │
│                  │  │                  │  │                  │
│  Memory: 512MB   │  │  Memory: 1GB     │  │  Memory: 512MB   │
│  CPU: 500m       │  │  CPU: 1000m      │  │  CPU: 500m       │
│  Replicas: 2-6   │  │  Replicas: 2-10  │  │  Replicas: 1-3   │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         │        Workload Identity                  │
         │        (GCP Service Accounts)             │
         └─────────────────────┼─────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
   ┌──────────────────┐ ┌─────────────┐ ┌─────────────────┐
   │    Cloud SQL     │ │ Memorystore │ │  GCS Buckets    │
   │   PostgreSQL     │ │   Redis     │ │  (uploads)      │
   │   (Private IP)   │ │ (BullMQ)    │ │                 │
   └──────────────────┘ └─────────────┘ └─────────────────┘
```

### Why GKE Standard over Cloud Run?

| Factor | Cloud Run | GKE Standard | Decision |
|--------|-----------|--------------|----------|
| Traffic splitting | Revision-based only | Gateway API (flexible) | GKE ✓ |
| Networking | Limited VPC control | Full VPC, private IPs | GKE ✓ |
| Cost at scale | Per-request billing | Predictable node cost | GKE ✓ |
| Cold starts | Yes (scale to zero) | No (min replicas) | GKE ✓ |
| K8s ecosystem | Limited | Full (HPA, PDB, etc.) | GKE ✓ |
| Complexity | Lower | Higher | Cloud Run ✓ |

### Why GKE Gateway API over Istio?

| Factor | Istio | Gateway API | Decision |
|--------|-------|-------------|----------|
| Shadow/mirror mode | ✅ Yes | ❌ No | Istio ✓ |
| Traffic splitting | ✅ Yes | ✅ Yes | Tie |
| Memory overhead | +100-150MB/pod | 0 | Gateway ✓ |
| Setup complexity | High | Low | Gateway ✓ |
| Extra cost/month | ~$50-80 | $0 | Gateway ✓ |

**Decision:** Gateway API. Shadow mode testing is nice-to-have, but the overhead of Istio isn't justified for our scale. We'll use canary deployments with traffic splitting instead.

### Service Responsibilities

| Service | Responsibilities | Scaling Triggers |
|---------|------------------|------------------|
| **hta-web** | SSR, static pages, client routing | CPU > 70%, Memory > 80% |
| **hta-api** | Auth, CRUD, business logic, validation | CPU > 70%, Memory > 80% |
| **hta-worker** | Email, notifications, cleanup, reports | Queue depth (manual) |

---

## 6. Monorepo Structure

### Directory Layout (Multi-Tenant Ready)

```
hta-platform/                          # New repository name
├── apps/
│   ├── web-hta/                      # HTA Calibr8s branded app
│   │   ├── src/
│   │   │   ├── app/                 # Pages only (no /api)
│   │   │   │   ├── (dashboard)/
│   │   │   │   ├── admin/
│   │   │   │   ├── customer/
│   │   │   │   └── (public)/
│   │   │   ├── components/          # HTA-specific components
│   │   │   ├── config/              # HTA branding, features
│   │   │   └── styles/              # HTA theme
│   │   ├── tests/                   # 👈 Unit + integration tests
│   │   │   ├── unit/
│   │   │   └── integration/
│   │   ├── e2e/                     # 👈 Playwright E2E tests
│   │   │   ├── .auth/               # Stored auth sessions
│   │   │   ├── journeys/            # User workflow tests
│   │   │   ├── pages/               # Page-specific tests
│   │   │   ├── evals/               # Accessibility, visual
│   │   │   └── auth.setup.ts
│   │   ├── public/                  # HTA assets (logo, favicon)
│   │   ├── vitest.config.ts
│   │   ├── playwright.config.ts
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── web-tenant-template/          # Template for new tenants
│   │   └── ...                      # Copy this to create new tenant app
│   │
│   ├── api/                          # Shared multi-tenant API
│   │   ├── src/
│   │   │   ├── routes/              # API route handlers
│   │   │   │   ├── auth/
│   │   │   │   ├── certificates/
│   │   │   │   ├── admin/
│   │   │   │   └── customer/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── cors.ts
│   │   │   │   ├── tenant.ts        # 👈 Tenant identification
│   │   │   │   ├── rate-limit.ts
│   │   │   │   └── error-handler.ts
│   │   │   ├── services/            # Business logic (tenant-aware)
│   │   │   └── server.ts
│   │   ├── tests/                   # 👈 API tests
│   │   │   ├── unit/                # Handler tests
│   │   │   └── integration/         # Endpoint tests (real DB)
│   │   ├── vitest.config.ts
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── worker/                       # Shared multi-tenant Worker
│       ├── src/
│       │   ├── jobs/
│       │   │   ├── email.ts         # Tenant-aware email sending
│       │   │   ├── cleanup.ts
│       │   │   └── notifications.ts
│       │   ├── scheduler/
│       │   └── index.ts
│       ├── tests/                   # 👈 Worker tests
│       │   ├── unit/
│       │   └── integration/
│       ├── vitest.config.ts
│       ├── package.json
│       └── Dockerfile
│
├── packages/
│   ├── database/                     # Prisma client & types
│   │   ├── prisma/
│   │   │   └── schema.prisma        # 👈 All tables have tenant_id
│   │   ├── src/
│   │   │   ├── client.ts            # Tenant-scoped client
│   │   │   ├── tenant-context.ts    # Tenant isolation helpers
│   │   │   └── index.ts
│   │   ├── tests/                   # 👈 Prisma query tests
│   │   ├── vitest.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── shared/                       # Shared utilities
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── logger/
│   │   │   ├── cache/
│   │   │   ├── security/
│   │   │   ├── tenant/              # 👈 Tenant utilities
│   │   │   │   ├── context.ts
│   │   │   │   ├── config.ts
│   │   │   │   └── types.ts
│   │   │   ├── types/
│   │   │   └── utils/
│   │   ├── tests/                   # 👈 Utility tests
│   │   ├── vitest.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── emails/                       # Email templates
│   │   ├── src/
│   │   │   └── templates/           # Tenant-aware templates
│   │   ├── tests/                   # 👈 Email rendering tests
│   │   ├── vitest.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ui/                           # Shared UI components
│       ├── src/
│       │   ├── components/          # Base components (themeable)
│       │   └── themes/              # 👈 Per-tenant theme tokens
│       ├── tests/                   # 👈 Component tests
│       ├── vitest.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── tests/                            # 👈 Cross-service tests (root)
│   ├── contracts/                    # API contract tests (Pact)
│   └── load/                         # Load tests (k6)
│
├── tenants/                          # 👈 Tenant configuration
│   ├── hta/
│   │   ├── config.json              # HTA-specific settings
│   │   ├── theme.json               # HTA branding
│   │   └── features.json            # Enabled features
│   └── _template/                   # Template for new tenants
│       └── ...
│
├── terraform/
│   └── modules/
│       ├── services/
│       └── tenant/                  # 👈 Per-tenant infrastructure
│
├── vitest.workspace.ts               # 👈 Test workspace config
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json               # Base TypeScript config
```

### Package Dependencies

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   apps/web  │     │   apps/api  │     │ apps/worker │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────┐
│                   packages/shared                     │
│  (auth, logger, cache, security, types, utils)       │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   packages/database    │
              │   (prisma client)      │
              └────────────────────────┘
```

### Multi-Tenancy Strategy

The monorepo is designed for multi-tenancy from day one, allowing different companies to use the platform with their own branding.

#### Tenant Isolation Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     MULTI-TENANCY ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LAYER 1: WEB APPS (Separate per tenant)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  web-hta    │  │ web-companyB│  │ web-companyC│             │
│  │  (branded)  │  │  (branded)  │  │  (branded)  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│  LAYER 2: API (Shared, tenant-aware)                            │
│                          ▼                                       │
│              ┌─────────────────────┐                            │
│              │    Shared API       │                            │
│              │  ┌───────────────┐  │                            │
│              │  │Tenant Middleware│ │ ◄── Extracts tenant from  │
│              │  │ (subdomain)    │ │     request subdomain      │
│              │  └───────────────┘  │                            │
│              └──────────┬──────────┘                            │
│                         │                                        │
│  LAYER 3: DATABASE (Row-level isolation)                        │
│                         ▼                                        │
│              ┌─────────────────────┐                            │
│              │   PostgreSQL        │                            │
│              │  ┌───────────────┐  │                            │
│              │  │ tenant_id on  │  │ ◄── Every table has       │
│              │  │ every table   │  │     tenant_id column       │
│              │  └───────────────┘  │                            │
│              └─────────────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Database Schema (Tenant-Aware)

```prisma
// packages/database/prisma/schema.prisma

model Tenant {
  id          String   @id @default(uuid())
  slug        String   @unique  // "hta", "company-b"
  name        String             // "HTA Calibr8s"
  domain      String?            // "hta.calibr8s.com"
  settings    Json?              // Tenant-specific settings
  features    String[]           // Enabled feature flags
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  
  // Relations
  users        User[]
  certificates Certificate[]
  // ... all tenant-owned models
}

model User {
  id        String   @id @default(uuid())
  tenantId  String   // 👈 Required on every table
  email     String
  // ... other fields
  
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  
  @@unique([tenantId, email])  // Email unique per tenant
  @@index([tenantId])
}

model Certificate {
  id        String   @id @default(uuid())
  tenantId  String   // 👈 Required on every table
  // ... other fields
  
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  
  @@index([tenantId])
  @@index([tenantId, status])
}
```

#### Tenant Middleware (API)

```typescript
// apps/api/src/middleware/tenant.ts
import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@hta/database'

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Extract tenant from subdomain: hta.calibr8s.com → "hta"
  const host = request.headers.host || ''
  const subdomain = host.split('.')[0]
  
  // Lookup tenant
  const tenant = await prisma.tenant.findUnique({
    where: { slug: subdomain, isActive: true },
    select: { id: true, slug: true, features: true, settings: true }
  })
  
  if (!tenant) {
    return reply.status(404).send({ error: 'Tenant not found' })
  }
  
  // Attach to request context
  request.tenant = tenant
  request.tenantId = tenant.id
}

// Type augmentation
declare module 'fastify' {
  interface FastifyRequest {
    tenant: { id: string; slug: string; features: string[]; settings: any }
    tenantId: string
  }
}
```

#### Tenant-Scoped Queries

```typescript
// packages/database/src/tenant-context.ts
import { prisma } from './client'
import { Prisma } from '@prisma/client'

// Create a tenant-scoped Prisma client
export function getTenantClient(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async findMany({ args, query }) {
          args.where = { ...args.where, tenantId }
          return query(args)
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, tenantId }
          return query(args)
        },
        async create({ args, query }) {
          args.data = { ...args.data, tenantId }
          return query(args)
        },
        async update({ args, query }) {
          args.where = { ...args.where, tenantId }
          return query(args)
        },
        async delete({ args, query }) {
          args.where = { ...args.where, tenantId }
          return query(args)
        },
      },
    },
  })
}

// Usage in API routes
export async function getCertificates(tenantId: string) {
  const db = getTenantClient(tenantId)
  
  // Automatically scoped to tenant - no need to add tenantId manually
  return db.certificate.findMany({
    where: { status: 'APPROVED' }  // tenantId auto-added
  })
}
```

#### Per-Tenant Configuration

```typescript
// packages/shared/src/tenant/config.ts
import { Tenant } from '@hta/database'

export interface TenantConfig {
  branding: {
    logo: string
    primaryColor: string
    companyName: string
  }
  features: {
    customerPortal: boolean
    downloadTokens: boolean
    emailNotifications: boolean
    twoFactorAuth: boolean
  }
  settings: {
    certificatePrefix: string      // "HTA-" or "COMPB-"
    defaultCalibrationTenure: number
    maxFileUploadSize: number
  }
}

// Load from database or config files
export async function getTenantConfig(tenant: Tenant): Promise<TenantConfig> {
  return {
    branding: tenant.settings?.branding || defaultBranding,
    features: {
      customerPortal: tenant.features.includes('customer_portal'),
      downloadTokens: tenant.features.includes('download_tokens'),
      emailNotifications: tenant.features.includes('email_notifications'),
      twoFactorAuth: tenant.features.includes('2fa'),
    },
    settings: tenant.settings?.settings || defaultSettings,
  }
}
```

#### Adding a New Tenant

```bash
# 1. Create tenant config
cp -r tenants/_template tenants/company-b
# Edit tenants/company-b/config.json

# 2. Create web app
cp -r apps/web-tenant-template apps/web-company-b
# Update branding, config

# 3. Add to database
pnpm db:seed:tenant --slug=company-b --name="Company B Calibrations"

# 4. Deploy
pnpm turbo run build --filter=web-company-b
# Deploy to GKE with subdomain: company-b.calibr8s.com
```

#### Deployment Model

| Component | Deployment | Tenant Isolation |
|-----------|------------|------------------|
| **Web Apps** | Separate GKE Deployment per tenant | Full isolation |
| **API** | Single shared GKE Deployment | Middleware-based |
| **Worker** | Single shared GKE Deployment | Job includes tenantId |
| **Database** | Single Cloud SQL | Row-level (tenant_id) |
| **Storage** | Single GCS bucket | Path prefix per tenant |
| **Secrets** | Shared + per-tenant overrides | Secret Manager |

```
DNS → GKE Gateway API (HTTPRoute)
├── app.hta.calibr8s.com      → GKE: hta-web deployment
├── app.companyb.calibr8s.com → GKE: web-company-b deployment
├── api.calibr8s.com          → GKE: hta-api deployment (shared)
└── *.calibr8s.com/api/*      → GKE: hta-api deployment (path-based)
```

---

## 7. Migration Strategy

### Approach: Strangler Fig Pattern

Gradually extract functionality from monolith to services while maintaining backward compatibility.

```
Phase 1: Setup monorepo structure
    │
    ▼
Phase 2: Extract shared packages
    │
    ▼
Phase 3: Create API service (shadow mode)
    │
    ▼
Phase 4: Create worker service
    │
    ▼
Phase 5: Configure load balancer routing
    │
    ▼
Phase 6: Gradual traffic shift (10% → 50% → 100%)
    │
    ▼
Phase 7: Remove old API routes from frontend
```

### Timeline

| Phase | Duration | Dependencies | Risk |
|-------|----------|--------------|------|
| 1. Monorepo Setup | 2 days | None | Low |
| 2. Shared Packages | 3 days | Phase 1 | Low |
| 3. API Extraction | 5 days | Phase 2 | Medium |
| 4. Worker Service | 3 days | Phase 2 | Low |
| 5. Load Balancer | 2 days | Phase 3 | Medium |
| 6. Cutover | 3 days | All | High |

**Total: ~3 weeks**

---

## 8. Phase 1: Monorepo Setup

> **Status:** ✅ COMPLETE (100%)
> 
> | Component | Status | Evidence |
> |-----------|--------|----------|
> | turbo.json | ✅ | 1,051 bytes, full pipeline config |
> | pnpm-workspace.yaml | ✅ | Configured for apps/* and packages/* |
> | Root package.json | ✅ | Scripts for build, dev, lint, test, docker |
> | apps/ directory | ✅ | 4 apps: api, web-hta, web-tenant-template, worker |
> | packages/ directory | ✅ | 4 packages: database, emails, shared, ui |

### Step 1.1: Initialize Turborepo

```bash
# Install turbo globally
npm install -g turbo

# Create turbo.json
cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false
    },
    "db:push": {
      "cache": false
    }
  }
}
EOF
```

### Step 1.2: Create Workspace Config

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Step 1.3: Update Root package.json

```json
{
  "name": "hta-calibration",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "db:generate": "turbo run db:generate",
    "db:push": "turbo run db:push"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "packageManager": "pnpm@8.0.0"
}
```

### Step 1.4: Create Directory Structure

```bash
mkdir -p apps/{web,api,worker}/src
mkdir -p packages/{database,shared,emails,ui}/src
```

---

## 9. Phase 2: Shared Packages

> **Status:** ✅ COMPLETE (95%)
> 
> | Package | Status | Lines | Contents |
> |---------|--------|-------|----------|
> | @hta/database | ✅ | 881 lines schema | Prisma schema, client.ts, tenant-context.ts |
> | @hta/shared | ✅ | 1,982 lines | auth, cache, audit, logger, notifications, security (CORS, rate-limiter), tenant, types, utils |
> | @hta/ui | ✅ | 168 lines | components/index.ts, themes/index.ts |
> | @hta/emails | ✅ | exists | Email templates package |
> 
> **Remaining:** UI components could be expanded; currently re-exports from web-hta

### Step 2.1: Create packages/database

```typescript
// packages/database/src/client.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export * from '@prisma/client'
```

```json
// packages/database/package.json
{
  "name": "@hta/database",
  "version": "0.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "db:generate": "prisma generate",
    "db:push": "prisma db push"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Step 2.2: Create packages/shared

#### Migration Inventory

The following modules from `src/lib/` must be migrated to `packages/shared/`:

```
packages/shared/
├── src/
│   ├── auth/
│   │   ├── index.ts              # Re-export all
│   │   ├── session.ts            # From src/lib/auth.ts (session logic)
│   │   ├── password.ts           # Password hashing, validation
│   │   └── tokens.ts             # JWT, reset tokens
│   │
│   ├── security/
│   │   ├── index.ts
│   │   ├── rate-limiter.ts       # From src/lib/security/rate-limiter.ts
│   │   ├── account-lockout.ts    # From src/lib/security/rate-limiter.ts
│   │   ├── cors.ts               # From src/lib/security/cors.ts
│   │   └── headers.ts            # Security headers config
│   │
│   ├── cache/
│   │   ├── index.ts              # From src/lib/cache/index.ts
│   │   ├── memory-provider.ts    # From src/lib/cache/memory-provider.ts
│   │   ├── redis-provider.ts     # From src/lib/cache/redis-provider.ts
│   │   └── types.ts
│   │
│   ├── audit/
│   │   ├── index.ts              # From src/lib/audit.ts
│   │   └── types.ts              # Audit event types
│   │
│   ├── logger/
│   │   ├── index.ts              # From src/lib/logger.ts
│   │   └── formatters.ts
│   │
│   └── notifications/
│       ├── index.ts              # From src/lib/notifications/
│       ├── types.ts              # 26 notification types
│       └── triggers.ts           # Event triggers (used by API, consumed by Worker)
```

#### Migration Steps

**Step 2.2.1: Security Module**

```bash
# Create directory structure
mkdir -p packages/shared/src/security

# Copy and adapt files
cp src/lib/security/rate-limiter.ts packages/shared/src/security/
cp src/lib/security/cors.ts packages/shared/src/security/
```

```typescript
// packages/shared/src/security/rate-limiter.ts
// Adapt imports to use @hta/shared/cache instead of relative
import { cache } from '@hta/shared/cache'

export const RateLimitConfig = {
  LOGIN: { limit: 5, windowSeconds: 15 * 60, keyPrefix: 'ratelimit:login:' },
  REGISTRATION: { limit: 3, windowSeconds: 60 * 60, keyPrefix: 'ratelimit:register:' },
  FORGOT_PASSWORD: { limit: 3, windowSeconds: 60 * 60, keyPrefix: 'ratelimit:forgot:' },
  PASSWORD_RESET: { limit: 3, windowSeconds: 60 * 60, keyPrefix: 'ratelimit:reset:' },
}

export const AccountLockoutConfig = {
  maxFailedAttempts: 5,
  lockoutDurationSeconds: 15 * 60, // 15 minutes
}

// ... rest of implementation
```

**Step 2.2.2: Cache Module**

```typescript
// packages/shared/src/cache/index.ts
// Migrate from src/lib/cache/index.ts
// Update to work across services

import { CacheProvider, CacheConfig } from './types'
import { MemoryProvider } from './memory-provider'
import { RedisProvider } from './redis-provider'

let cacheInstance: CacheProvider | null = null

export function getCache(): CacheProvider {
  if (!cacheInstance) {
    const redisUrl = process.env.REDIS_URL
    cacheInstance = redisUrl 
      ? new RedisProvider(redisUrl)
      : new MemoryProvider()
  }
  return cacheInstance
}

export const cache = getCache()

// Export utilities
export { cached, cachedSWR } from './utilities'
```

**Step 2.2.3: Audit Module**

```typescript
// packages/shared/src/audit/index.ts
// Migrate from src/lib/audit.ts
import { prisma } from '@hta/database'
import { createLogger } from '@hta/shared/logger'

const logger = createLogger('audit')

export type AuditAction = 
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_COMPLETE'
  | 'ACCOUNT_LOCKED'
  | 'SESSION_INVALIDATED'
  // ... all auth events

export interface AuditEvent {
  action: AuditAction
  userId?: string
  email?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  logger.info({ audit: true, ...event }, `Audit: ${event.action}`)
  
  await prisma.auditLog.create({
    data: {
      action: event.action,
      userId: event.userId,
      email: event.email,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
    },
  })
}
```

**Step 2.2.4: Notifications Module**

```typescript
// packages/shared/src/notifications/types.ts
// Migrate 26 notification types from src/lib/notifications/

export type NotificationType =
  // Certificate lifecycle
  | 'CERTIFICATE_CREATED'
  | 'CERTIFICATE_SUBMITTED'
  | 'CERTIFICATE_APPROVED'
  | 'CERTIFICATE_REJECTED'
  | 'CERTIFICATE_REVISION_REQUESTED'
  | 'CERTIFICATE_AUTHORIZED'
  // Customer notifications
  | 'CUSTOMER_REVIEW_READY'
  | 'CUSTOMER_APPROVED'
  | 'CUSTOMER_REJECTED'
  | 'CUSTOMER_DOWNLOAD_LINK'
  // Staff notifications
  | 'STAFF_ACTIVATION'
  | 'STAFF_PASSWORD_RESET'
  // ... all 26 types

export interface NotificationPayload {
  type: NotificationType
  recipientEmail: string
  recipientName?: string
  data: Record<string, unknown>
  priority?: 'high' | 'normal' | 'low'
}
```

```typescript
// packages/shared/src/notifications/triggers.ts
// API calls these, Worker processes them

import { cache } from '@hta/shared/cache'
import { NotificationPayload, NotificationType } from './types'

const NOTIFICATION_QUEUE_KEY = 'notifications:queue'

export async function queueNotification(payload: NotificationPayload): Promise<void> {
  // Add to Redis list for Worker to process
  await cache.rpush(NOTIFICATION_QUEUE_KEY, JSON.stringify({
    ...payload,
    queuedAt: new Date().toISOString(),
  }))
}

// Convenience methods for common notifications
export async function notifyCertificateSubmitted(certId: string, engineerEmail: string) {
  await queueNotification({
    type: 'CERTIFICATE_SUBMITTED',
    recipientEmail: engineerEmail,
    data: { certificateId: certId },
  })
}

// ... other convenience methods
```

```json
// packages/shared/package.json
{
  "name": "@hta/shared",
  "version": "0.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    "./auth": "./dist/auth/index.js",
    "./logger": "./dist/logger/index.js",
    "./cache": "./dist/cache/index.js",
    "./security": "./dist/security/index.js",
    "./audit": "./dist/audit/index.js",
    "./notifications": "./dist/notifications/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hta/database": "workspace:*",
    "ioredis": "^5.0.0",
    "pino": "^8.0.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "@types/bcryptjs": "^2.4.0"
  }
}
```

### Step 2.3: Create packages/emails

```bash
# Create email templates package
mkdir -p packages/emails/src/templates
```

```
packages/emails/
├── src/
│   ├── templates/
│   │   ├── certificate-submitted.tsx    # From src/emails/
│   │   ├── certificate-approved.tsx
│   │   ├── certificate-rejected.tsx
│   │   ├── customer-review-ready.tsx
│   │   ├── customer-download-link.tsx
│   │   ├── staff-activation.tsx
│   │   ├── password-reset.tsx
│   │   └── password-changed.tsx
│   │
│   ├── render.ts                        # Email rendering utility
│   └── index.ts
├── package.json
└── tsconfig.json
```

```typescript
// packages/emails/src/render.ts
import { render } from '@react-email/render'
import * as templates from './templates'

export async function renderEmail(
  template: keyof typeof templates,
  props: Record<string, unknown>
): Promise<{ html: string; text: string }> {
  const Template = templates[template]
  const html = render(Template(props))
  const text = render(Template(props), { plainText: true })
  return { html, text }
}
```

```json
// packages/emails/package.json
{
  "name": "@hta/emails",
  "version": "0.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "email dev --dir src/templates"
  },
  "dependencies": {
    "@react-email/components": "^0.0.14",
    "@react-email/render": "^0.0.12",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "react-email": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Step 2.4: Update Import Paths

```typescript
// Before (in apps/web or apps/api)
import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'

// After
import { prisma } from '@hta/database'
import { createLogger } from '@hta/shared/logger'
```

---

## 10. Phase 3: API Extraction

> **Status:** ✅ COMPLETE (95%)
> 
> | Component | Status | Lines | Description |
> |-----------|--------|-------|-------------|
> | server.ts | ✅ | 155 | Fastify server with CORS, routes, error handling |
> | routes/certificates | ✅ | 1,765 | Full CRUD, revisions, PDF generation |
> | routes/admin | ✅ | 1,872 | User management, settings, audit logs |
> | routes/customer | ✅ | 1,539 | Customer portal, downloads, profile |
> | routes/auth | ✅ | 640 | Login, tokens, session management |
> | routes/chat | ✅ | 358 | AI chat integration |
> | routes/users | ✅ | 158 | User CRUD |
> | routes/instruments | ✅ | 123 | Master instruments |
> | routes/notifications | ✅ | 126 | Notification endpoints |
> | routes/internal-requests | ✅ | 136 | Internal request handling |
> | routes/customers | ✅ | 115 | Customer accounts |
> | routes/health | ✅ | 49 | Health check endpoint |
> | middleware/auth | ✅ | exists | JWT validation, role checks |
> | middleware/tenant | ✅ | exists | Multi-tenant context |
> | middleware/error-handler | ✅ | exists | Centralized error handling |
> | services/ | ✅ | exists | chat.ts, refresh-token.ts |
> | lib/storage | ✅ | exists | GCS storage adapter |
> | **TOTAL** | ✅ | **~6,881** | Full API implementation |
> 
> **Remaining:** Integration tests for API routes

### Step 3.1: Choose API Framework

Options:
1. **Next.js Standalone** - Keep Next.js, just API routes
2. **Fastify** - Fast, schema validation, plugins
3. **Hono** - Ultra-light, edge-ready
4. **Express** - Mature, well-known

**Recommendation:** Next.js Standalone for minimal changes, or Fastify for better performance.

### Step 3.2: API Server Structure (Fastify Example)

```typescript
// apps/api/src/server.ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { authRoutes } from './routes/auth'
import { certificateRoutes } from './routes/certificates'
import { adminRoutes } from './routes/admin'
import { customerRoutes } from './routes/customer'
import { errorHandler } from './middleware/error-handler'
import { createLogger } from '@hta/shared/logger'

const logger = createLogger('api')

const app = Fastify({
  logger: true,
})

// Middleware
await app.register(cors, {
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
})

// Routes
app.register(authRoutes, { prefix: '/api/auth' })
app.register(certificateRoutes, { prefix: '/api/certificates' })
app.register(adminRoutes, { prefix: '/api/admin' })
app.register(customerRoutes, { prefix: '/api/customer' })

// Error handling
app.setErrorHandler(errorHandler)

// Health check
app.get('/health', async () => ({ status: 'ok' }))

// Start
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8080')
    await app.listen({ port, host: '0.0.0.0' })
    logger.info({ port }, 'API server started')
  } catch (err) {
    logger.error(err)
    process.exit(1)
  }
}

start()
```

### Step 3.3: Route Migration Example

```typescript
// Before: src/app/api/certificates/route.ts (Next.js)
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const certificates = await prisma.certificate.findMany()
  return NextResponse.json(certificates)
}

// After: apps/api/src/routes/certificates/index.ts (Fastify)
import { FastifyInstance } from 'fastify'
import { prisma } from '@hta/database'
import { verifySession } from '../../middleware/auth'

export async function certificateRoutes(app: FastifyInstance) {
  app.addHook('preHandler', verifySession)

  app.get('/', async (request, reply) => {
    const certificates = await prisma.certificate.findMany()
    return certificates
  })
}
```

### Step 3.4: API Dockerfile

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm install -g pnpm && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --filter=@hta/api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

---

## 11. Phase 4: Worker Service

> **Status:** ✅ COMPLETE (90%)
> 
> | Component | Status | Lines | Description |
> |-----------|--------|-------|-------------|
> | index.ts | ✅ | exists | Worker entry point |
> | jobs/email.ts | ✅ | 124 | Email job processor with Resend |
> | jobs/cleanup.ts | ✅ | 163 | Cleanup job for expired data |
> | jobs/notifications.ts | ✅ | 123 | Notification job processor |
> | jobs/index.ts | ✅ | 7 | Job exports |
> | scheduler/ | ✅ | exists | Scheduled job runners |
> | types.ts | ✅ | exists | Type definitions |
> | **TOTAL** | ✅ | **~417** | Worker implementation |
> 
> **Remaining:** PDF generation job (currently in API), more comprehensive job tests

### Step 4.1: Worker Structure

```typescript
// apps/worker/src/index.ts
import { createLogger } from '@hta/shared/logger'
import { processEmailQueue } from './jobs/email'
import { processCleanup } from './jobs/cleanup'
import { processNotifications } from './jobs/notifications'

const logger = createLogger('worker')

async function main() {
  logger.info('Worker starting...')

  // Run jobs in parallel
  await Promise.all([
    processEmailQueue(),
    processNotifications(),
  ])

  // Run cleanup on schedule
  setInterval(processCleanup, 60 * 60 * 1000) // Every hour

  logger.info('Worker ready')
}

main().catch((err) => {
  logger.error(err, 'Worker failed')
  process.exit(1)
})
```

### Step 4.2: Notification Processing

The Worker consumes notifications queued by the API service via Redis.

```typescript
// apps/worker/src/jobs/notifications.ts
import { cache } from '@hta/shared/cache'
import { renderEmail } from '@hta/emails'
import { createLogger } from '@hta/shared/logger'
import { NotificationPayload, NotificationType } from '@hta/shared/notifications'
import { sendEmail } from './email-sender'

const logger = createLogger('worker:notifications')
const QUEUE_KEY = 'notifications:queue'

// Map notification types to email templates
const NOTIFICATION_TEMPLATES: Record<NotificationType, string> = {
  'CERTIFICATE_CREATED': 'certificate-created',
  'CERTIFICATE_SUBMITTED': 'certificate-submitted',
  'CERTIFICATE_APPROVED': 'certificate-approved',
  'CERTIFICATE_REJECTED': 'certificate-rejected',
  'CERTIFICATE_REVISION_REQUESTED': 'certificate-revision',
  'CERTIFICATE_AUTHORIZED': 'certificate-authorized',
  'CUSTOMER_REVIEW_READY': 'customer-review-ready',
  'CUSTOMER_APPROVED': 'customer-approved',
  'CUSTOMER_REJECTED': 'customer-rejected',
  'CUSTOMER_DOWNLOAD_LINK': 'customer-download-link',
  'STAFF_ACTIVATION': 'staff-activation',
  'STAFF_PASSWORD_RESET': 'password-reset',
  // ... all 26 types mapped
}

export async function processNotifications() {
  logger.info('Notification processor started')
  
  while (true) {
    try {
      // Block and wait for new notification (BLPOP)
      const result = await cache.blpop(QUEUE_KEY, 30) // 30 second timeout
      
      if (!result) continue // Timeout, check again
      
      const payload: NotificationPayload = JSON.parse(result[1])
      
      logger.info({ type: payload.type, to: payload.recipientEmail }, 'Processing notification')
      
      // Get template and render email
      const template = NOTIFICATION_TEMPLATES[payload.type]
      const { html, text } = await renderEmail(template, {
        recipientName: payload.recipientName,
        ...payload.data,
      })
      
      // Send email
      await sendEmail({
        to: payload.recipientEmail,
        subject: getSubjectForType(payload.type, payload.data),
        html,
        text,
      })
      
      logger.info({ type: payload.type }, 'Notification sent')
      
    } catch (error) {
      logger.error({ error }, 'Failed to process notification')
      // Could implement dead-letter queue here
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}

function getSubjectForType(type: NotificationType, data: Record<string, unknown>): string {
  const subjects: Record<NotificationType, string> = {
    'CERTIFICATE_SUBMITTED': `Certificate ${data.certificateNumber} Submitted for Review`,
    'CERTIFICATE_APPROVED': `Certificate ${data.certificateNumber} Approved`,
    'CUSTOMER_REVIEW_READY': `Your Calibration Certificate is Ready for Review`,
    'CUSTOMER_DOWNLOAD_LINK': `Download Your Calibration Certificate`,
    'STAFF_ACTIVATION': `Activate Your HTA Calibration Account`,
    'STAFF_PASSWORD_RESET': `Reset Your Password`,
    // ... all subjects
  }
  return subjects[type] || 'HTA Calibration Notification'
}
```

### Step 4.3: Email Sender

```typescript
// apps/worker/src/jobs/email-sender.ts
import { Resend } from 'resend' // or SendGrid, etc.
import { createLogger } from '@hta/shared/logger'

const logger = createLogger('worker:email-sender')
const resend = new Resend(process.env.RESEND_API_KEY)

interface EmailPayload {
  to: string
  subject: string
  html: string
  text: string
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const { to, subject, html, text } = payload
  
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'noreply@htacalibration.com',
    to,
    subject,
    html,
    text,
  })
  
  if (result.error) {
    throw new Error(`Email send failed: ${result.error.message}`)
  }
  
  logger.info({ to, messageId: result.data?.id }, 'Email sent')
}
```

### Step 4.4: Cleanup Jobs

```typescript
// apps/worker/src/jobs/cleanup.ts
import { prisma } from '@hta/database'
import { createLogger } from '@hta/shared/logger'

const logger = createLogger('worker:cleanup')

export async function processCleanup() {
  logger.info('Running cleanup jobs')
  
  // Clean expired download tokens
  const expiredTokens = await prisma.downloadToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })
  logger.info({ count: expiredTokens.count }, 'Expired download tokens cleaned')
  
  // Clean old audit logs (retain 1 year)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  
  const oldAuditLogs = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: oneYearAgo },
    },
  })
  logger.info({ count: oldAuditLogs.count }, 'Old audit logs archived')
  
  // Clean expired sessions
  const expiredSessions = await prisma.session.deleteMany({
    where: {
      expires: { lt: new Date() },
    },
  })
  logger.info({ count: expiredSessions.count }, 'Expired sessions cleaned')
  
  // Clean stale rate limit keys (handled by Redis TTL, but cleanup orphaned DB records)
  const staleRateLimits = await prisma.failedLoginAttempt.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 24 hours
    },
  })
  logger.info({ count: staleRateLimits.count }, 'Stale rate limit records cleaned')
  
  logger.info('Cleanup complete')
}
```

### Step 4.3: Worker Dockerfile

```dockerfile
# apps/worker/Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/
RUN npm install -g pnpm && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --filter=@hta/worker

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

---

## 12. Phase 5: Load Balancer & Routing

> **Architecture:** GKE Standard + GKE Gateway API (not Cloud Run)
> 
> **Status:** ✅ COMPLETE (100%)
> 
> | Component | Status | Location | Description |
> |-----------|--------|----------|-------------|
> | Gateway API manifest | ✅ | infra/k8s/base/gateway.yaml | GKE Gateway with routing rules |
> | API deployment | ✅ | infra/k8s/base/api-deployment.yaml | API pod spec |
> | API service | ✅ | infra/k8s/base/api-service.yaml | ClusterIP service |
> | Web deployment | ✅ | infra/k8s/base/web-hta-deployment.yaml | Web pod spec |
> | Web service | ✅ | infra/k8s/base/web-hta-service.yaml | ClusterIP service |
> | Worker deployment | ✅ | infra/k8s/base/worker-deployment.yaml | Worker pod spec |
> | ConfigMap | ✅ | infra/k8s/base/configmap.yaml | Environment config |
> | Secrets | ✅ | infra/k8s/base/secrets.yaml | Secret references |
> | HPA | ✅ | infra/k8s/base/hpa.yaml | Horizontal pod autoscaling |
> | Service accounts | ✅ | infra/k8s/base/service-accounts.yaml | K8s service accounts |
> | Namespace | ✅ | infra/k8s/base/namespace.yaml | hta-platform namespace |
> | Kustomization | ✅ | infra/k8s/base/kustomization.yaml | Kustomize base |
> | Production overlay | ✅ | infra/k8s/overlays/production/ | Prod-specific configs |

### Step 5.1: Terraform Infrastructure

Terraform manages the foundational infrastructure. The actual routing is handled by GKE Gateway API (Kubernetes resources).

```hcl
# terraform/modules/cloud-armor/main.tf

# Cloud Armor WAF policy
resource "google_compute_security_policy" "main" {
  name = "${var.environment}-security-policy"

  # Default allow
  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
  }

  # Rate limiting: 100 req/min per IP
  rule {
    action   = "throttle"
    priority = "1000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config { src_ip_ranges = ["*"] }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }
    }
  }

  # OWASP rules (SQLi, XSS, LFI, RFI, RCE)
  rule {
    action   = "deny(403)"
    priority = "2000"
    match {
      expr { expression = "evaluatePreconfiguredWaf('sqli-v33-stable')" }
    }
  }
}

# Static IP for GKE Ingress
resource "google_compute_global_address" "ingress_ip" {
  name = "${var.environment}-security-policy-ip"
}
```

### Step 5.2: GKE Gateway API Configuration

GKE Gateway API handles routing. This is defined in Kubernetes manifests, not Terraform.

```yaml
# infra/k8s/base/gateway.yaml

# Enable Gateway API on GKE cluster first:
# gcloud container clusters update CLUSTER --gateway-api=standard

apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: hta-gateway
  namespace: hta-platform
  annotations:
    networking.gke.io/certmap: hta-certificate-map
spec:
  gatewayClassName: gke-l7-global-external-managed
  addresses:
    - type: NamedAddress
      value: production-security-policy-ip  # From Terraform
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        options:
          networking.gke.io/cert-manager-certs: hta-certificate
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: hta-routes
  namespace: hta-platform
spec:
  parentRefs:
    - name: hta-gateway
  hostnames:
    - "app.hta.example.com"
    - "api.hta.example.com"
  rules:
    # API routes (api.hta.example.com or app.hta.example.com/api/*)
    - matches:
        - headers:
            - name: Host
              value: api.hta.example.com
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: hta-api
          port: 80
    # Frontend (everything else)
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: hta-web
          port: 80
```

### Step 5.3: Backend Configuration (Cloud Armor attachment)

```yaml
# infra/k8s/base/backend-config.yaml

apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: hta-api-backend-config
  namespace: hta-platform
spec:
  securityPolicy:
    name: "production-security-policy"  # From Terraform
  healthCheck:
    requestPath: /health
    port: 8080
  connectionDraining:
    drainingTimeoutSec: 30
---
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: hta-web-backend-config
  namespace: hta-platform
spec:
  securityPolicy:
    name: "production-security-policy"
  healthCheck:
    requestPath: /api/health
    port: 3000
  cdn:
    enabled: true
    cachePolicy:
      includeHost: true
      includeProtocol: true
```

### Architecture Flow

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  Cloud Load Balancer (created by GKE Gateway)       │
│  + Cloud Armor WAF (created by Terraform)           │
│  + Managed SSL (referenced by Gateway)              │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│  GKE Gateway API (HTTPRoute rules)                  │
│                                                     │
│  api.hta.com/*        → hta-api service             │
│  app.hta.com/api/*    → hta-api service             │
│  app.hta.com/*        → hta-web service             │
└─────────────────────────┬───────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    ┌─────────┐     ┌─────────┐     ┌─────────┐
    │ hta-web │     │ hta-api │     │ worker  │
    │  pods   │     │  pods   │     │  pods   │
    └─────────┘     └─────────┘     └─────────┘
```

---

## 13. Phase 6: Deployment & Cutover

> **Architecture:** GitOps with Argo CD + Argo Rollouts for automated canary deployments on GKE Standard
> 
> **Status:** ✅ COMPLETE (100%)
> 
> | Component | Status | Location | Description |
> |-----------|--------|----------|-------------|
> | Argo CD Application | ✅ | infra/k8s/base/argocd/application.yaml | App-of-apps pattern |
> | Argo CD ConfigMap | ✅ | infra/k8s/base/argocd/argocd-cm.yaml | Argo CD configuration |
> | Argo CD Ingress | ✅ | infra/k8s/base/argocd/ingress.yaml | IAP-protected access |
> | Argo CD Namespace | ✅ | infra/k8s/base/argocd/namespace.yaml | argocd namespace |
> | Argo Rollouts Install | ✅ | infra/k8s/base/argo-rollouts/install.yaml | Rollouts controller |
> | Rollouts Namespace | ✅ | infra/k8s/base/argo-rollouts/namespace.yaml | argo-rollouts namespace |
> | Rollout Configs | ✅ | infra/k8s/base/rollouts/ | Canary rollout specs |
> | CI Workflow | ✅ | .github/workflows/ci.yml | Lint, test, build (5,604 lines) |
> | Deploy Workflow | ✅ | .github/workflows/deploy.yml | Direct deploy (8,196 lines) |
> | GitOps Workflow | ✅ | .github/workflows/gitops-deploy.yml | Image build + manifest PR (6,972 lines) |
> | Rollback Workflow | ✅ | .github/workflows/rollback.yml | Emergency rollback (2,591 lines) |

### Step 6.1: Deployment Architecture Overview

| Component | Purpose | Location |
|-----------|---------|----------|
| **Argo CD** | GitOps continuous delivery | `infra/k8s/base/argocd/` |
| **Argo Rollouts** | Automated canary deployments | `infra/k8s/base/argo-rollouts/` |
| **GKE Gateway API** | Traffic routing & splitting | `infra/k8s/base/gateway.yaml` |
| **Cloud Armor WAF** | Security & rate limiting | `terraform/modules/cloud-armor/` |
| **IAP** | Google login for Argo CD | `terraform/modules/iap/` |

### Step 6.2: GitOps Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GitOps Deployment Flow                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Developer              GitHub Actions           Argo CD               │
│   ─────────              ──────────────           ───────               │
│       │                        │                      │                  │
│       │  1. Push to main       │                      │                  │
│       │───────────────────────>│                      │                  │
│       │                        │                      │                  │
│       │                        │  2. Build & push     │                  │
│       │                        │     Docker images    │                  │
│       │                        │                      │                  │
│       │                        │  3. Create PR to     │                  │
│       │                        │     update manifests │                  │
│       │                        │                      │                  │
│       │  4. Review & merge PR  │                      │                  │
│       │<───────────────────────│                      │                  │
│       │                        │                      │                  │
│       │                        │                      │  5. Detect change│
│       │                        │                      │     & sync       │
│       │                        │                      │                  │
│       │                        │                      │  6. Argo Rollouts│
│       │                        │                      │     canary deploy│
│       │                        │                      │     10%→25%→50%→ │
│       │                        │                      │     75%→100%     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key files:**
- `.github/workflows/gitops-deploy.yml` - CI pipeline
- `infra/k8s/base/argocd/application.yaml` - Argo CD config
- `infra/k8s/base/rollouts/api-rollout.yaml` - Canary strategy

### Step 6.3: Argo Rollouts Canary Strategy

Automated 5-step canary deployment with analysis:

```yaml
# infra/k8s/base/rollouts/api-rollout.yaml
strategy:
  canary:
    steps:
      - setWeight: 10       # 10% traffic to canary
      - pause: {duration: 5m}
      - setWeight: 25       # 25% traffic
      - pause: {duration: 10m}
      - setWeight: 50       # 50% traffic
      - pause: {duration: 10m}
      - setWeight: 75       # 75% traffic
      - pause: {duration: 10m}
      - setWeight: 100      # Full rollout
```

**Automatic rollback triggers:**
- Error rate > 1% for 5 minutes
- p95 latency > 500ms for 5 minutes
- Any 5xx errors on critical paths

### Step 6.4: Argo CD Access (IAP-Protected)

Argo CD dashboard is accessible at `https://argocd.hta-calibration.com` with Google login via IAP.

**Terraform outputs needed:**
```bash
# After terraform apply, get IAP credentials
terraform output -raw iap_client_id
terraform output -raw iap_client_secret

# Create K8s secret for Argo CD
kubectl create secret generic argocd-iap-credentials \
  -n argocd \
  --from-literal=client_id=$(terraform output -raw iap_client_id) \
  --from-literal=client_secret=$(terraform output -raw iap_client_secret)
```

**DNS setup:**
```bash
# Get the static IP for Argo CD
terraform output argocd_ip_address

# Add A record in your DNS provider:
# argocd.hta-calibration.com → <static-ip>
```

### Step 6.5: Deployment Commands

**Via Argo CD UI (Recommended):**
1. Open `https://argocd.hta-calibration.com`
2. Login with Google account (must be in `iap_authorized_members`)
3. Click application → Sync → Synchronize

**Via CLI:**
```bash
# Install Argo CD CLI
brew install argocd  # or download from GitHub releases

# Login (uses IAP, opens browser)
argocd login argocd.hta-calibration.com --sso

# View applications
argocd app list

# Sync application
argocd app sync hta-platform

# Watch rollout progress
argocd app get hta-platform --refresh
```

**Via kubectl (Argo Rollouts):**
```bash
# Install Argo Rollouts kubectl plugin
brew install argoproj/tap/kubectl-argo-rollouts

# Watch rollout status
kubectl argo rollouts get rollout hta-api -n hta-platform --watch

# Promote canary to next step
kubectl argo rollouts promote hta-api -n hta-platform

# Abort rollout (immediate rollback)
kubectl argo rollouts abort hta-api -n hta-platform

# Retry failed rollout
kubectl argo rollouts retry rollout hta-api -n hta-platform
```

### Step 6.6: Manual Rollback Procedure

```bash
# Option 1: Via Argo Rollouts (recommended)
kubectl argo rollouts abort hta-api -n hta-platform
kubectl argo rollouts undo hta-api -n hta-platform

# Option 2: Via Argo CD UI
# Click application → History → Select previous revision → Rollback

# Option 3: Via Git (GitOps way)
# Revert the manifest PR that updated image tags
git revert <commit-sha>
git push origin main
# Argo CD will auto-sync to previous version
```

### Step 6.7: Initial Setup Checklist

```markdown
## Infrastructure Setup (One-time)
- [ ] Create GCP project and enable APIs
- [ ] Run `terraform init` and `terraform apply`
- [ ] Get terraform outputs (IPs, credentials)
- [ ] Setup DNS records:
      - `api.hta-calibration.com` → ingress_static_ip
      - `app.hta-calibration.com` → ingress_static_ip
      - `argocd.hta-calibration.com` → argocd_ip_address
- [ ] Wait for SSL certificates to provision (~15-30 min)

## Kubernetes Setup (One-time)
- [ ] Connect to GKE cluster:
      `gcloud container clusters get-credentials production-cluster --region us-central1`
- [ ] Install Argo Rollouts:
      `kubectl apply -f infra/k8s/base/argo-rollouts/install.yaml`
- [ ] Install Argo CD:
      `kubectl create namespace argocd`
      `kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml`
- [ ] Create IAP secret for Argo CD
- [ ] Apply Argo CD Application:
      `kubectl apply -f infra/k8s/base/argocd/application.yaml`

## GitHub Setup (One-time)
- [ ] Add repository secrets:
      - `GCP_PROJECT_ID`
      - `WIF_PROVIDER` (from terraform output)
      - `WIF_SERVICE_ACCOUNT` (from terraform output)
```

### Step 6.8: Cutover Day Checklist

```markdown
## Pre-Cutover
- [ ] All GKE pods healthy: `kubectl get pods -n hta-platform`
- [ ] Argo CD synced and healthy: `argocd app get hta-platform`
- [ ] Gateway API routing verified
- [ ] Cloud Armor WAF rules tested
- [ ] Monitoring dashboards accessible
- [ ] Alerts configured in GCP Monitoring
- [ ] On-call engineer identified

## Cutover Execution
- [ ] Merge the deployment PR (triggers GitOps flow)
- [ ] Monitor Argo CD sync status
- [ ] Watch Argo Rollouts canary progression:
      `kubectl argo rollouts get rollout hta-api -n hta-platform --watch`
- [ ] Verify each canary step:
      - 10% → check error rate, latency
      - 25% → check error rate, latency
      - 50% → check error rate, latency
      - 75% → check error rate, latency
      - 100% → full rollout complete

## Rollback Triggers (abort immediately if ANY):
- [ ] Error rate > 1% for 5 minutes
- [ ] p95 latency > 500ms for 5 minutes
- [ ] Any 5xx errors on /api/auth/* or /api/certificates/*
- [ ] Database connection errors

## Post-Cutover
- [ ] Verify all features working in production
- [ ] Check customer-facing flows (login, certificates, downloads)
- [ ] Monitor for 2 hours post-rollout
- [ ] Update documentation if needed
- [ ] Celebrate! 🎉
```

### Step 6.9: Monitoring During Cutover

```bash
# Terminal 1: Watch pod health
watch kubectl get pods -n hta-platform

# Terminal 2: Watch rollout progress
kubectl argo rollouts get rollout hta-api -n hta-platform --watch

# Terminal 3: Stream logs from canary pods
kubectl logs -f -l app=hta-api -n hta-platform --prefix

# Terminal 4: Check Gateway status
kubectl get httproute,gateway -n hta-platform

# GCP Console: 
# - Cloud Monitoring → Dashboards → GKE
# - Error Reporting → Check for new errors
# - Cloud Logging → Resource: GKE Container
```

---

## 14. Docker Configuration

> **Status:** ✅ COMPLETE (100%)
> 
> | Component | Status | Size | Description |
> |-----------|--------|------|-------------|
> | docker-compose.yml | ✅ | 4,255 bytes | Full stack (postgres, redis, api, worker, web) |
> | docker-compose.infra.yml | ✅ | 1,728 bytes | Infrastructure only (postgres, redis) |
> | .env.example | ✅ | exists | Environment variables template |
> | .dockerignore | ✅ | exists | Excludes node_modules, .next, etc. |
> | apps/api/Dockerfile | ✅ | 3,747 bytes | Multi-stage Fastify build |
> | apps/worker/Dockerfile | ✅ | 3,659 bytes | Multi-stage worker build |
> | apps/web-hta/Dockerfile | ✅ | 3,063 bytes | Multi-stage Next.js build |
> | apps/web-tenant-template/Dockerfile | ✅ | 3,206 bytes | Multi-stage Next.js build |
> | Root package.json scripts | ✅ | exists | docker:infra, docker:up, docker:build:* |

### 14.1 File Structure

```
hta-platform/
├── .dockerignore              # Excludes node_modules, .next, etc.
├── .env.example               # Environment variables template
├── docker-compose.yml         # Full stack (production-like)
├── docker-compose.infra.yml   # Infrastructure only (local dev)
└── apps/
    ├── api/Dockerfile         # Fastify API service
    ├── worker/Dockerfile      # BullMQ worker service
    ├── web-hta/Dockerfile     # Next.js frontend
    └── web-tenant-template/Dockerfile
```

### 14.2 Development Workflow

**Option A: Infrastructure in Docker, apps native (recommended for hot reload)**

```bash
# Start PostgreSQL and Redis
pnpm docker:infra

# Run apps with hot reload
pnpm dev
```

**Option B: Full stack in Docker**

```bash
# Build and start all services
pnpm docker:up:build

# Or just start (if already built)
pnpm docker:up
```

### 14.3 Multi-Stage Dockerfile Pattern

All Dockerfiles follow the same secure, optimized pattern:

```dockerfile
# apps/api/Dockerfile (example)
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
# Install dependencies only

FROM base AS builder
# Build the application

FROM base AS runner
ENV NODE_ENV=production
# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 htaapi
USER htaapi
# Copy only production artifacts
HEALTHCHECK --interval=30s --timeout=10s CMD wget --spider http://localhost:8080/health
CMD ["node", "dist/server.js"]
```

**Key features:**
- Multi-stage builds (smaller final image)
- Non-root user (security)
- Health checks (Kubernetes readiness)
- pnpm with corepack (consistent versions)
- Alpine base (minimal attack surface)

### 14.4 Docker Compose Services

**docker-compose.yml** (full stack):

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | PostgreSQL 16 database |
| `redis` | 6379 | Redis 7 cache & queue |
| `api` | 4000 | Fastify API (maps to 8080 internal) |
| `worker` | - | BullMQ background jobs |
| `web` | 3000 | Next.js frontend |

**docker-compose.infra.yml** (infrastructure only):

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | PostgreSQL 16 database |
| `redis` | 6379 | Redis 7 cache & queue |

### 14.5 Build Commands

```bash
# NPM Scripts (package.json)
pnpm docker:infra          # Start infrastructure only
pnpm docker:infra:down     # Stop infrastructure
pnpm docker:up             # Start full stack
pnpm docker:up:build       # Build and start full stack
pnpm docker:down           # Stop full stack
pnpm docker:build:api      # Build API image
pnpm docker:build:worker   # Build worker image
pnpm docker:build:web      # Build web image
pnpm docker:build:all      # Build all images

# Direct Docker commands
docker build -f apps/api/Dockerfile -t hta-api:latest .
docker build -f apps/worker/Dockerfile -t hta-worker:latest .
docker build -f apps/web-hta/Dockerfile -t hta-web:latest .
```

### 14.6 Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://hta_user:hta_dev_password@localhost:5432/hta_platform

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
AUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx

# API URL (for Next.js)
API_URL=http://localhost:4000
```

### 14.7 Image Sizes (Approximate)

| Image | Size | Notes |
|-------|------|-------|
| `hta-api` | ~250MB | Fastify + Prisma |
| `hta-worker` | ~250MB | BullMQ + Prisma |
| `hta-web` | ~150MB | Next.js standalone |

---

## 15. GitHub Actions CI/CD

> **Status:** ✅ COMPLETE (100%)
> 
> | Workflow | Status | Lines | Description |
> |----------|--------|-------|-------------|
> | ci.yml | ✅ | 5,604 | Lint, typecheck, test on PRs |
> | deploy.yml | ✅ | 8,196 | Direct deployment to GKE |
> | gitops-deploy.yml | ✅ | 6,972 | Build images, create manifest PR for Argo CD |
> | rollback.yml | ✅ | 2,591 | Emergency rollback workflow |
> | **TOTAL** | ✅ | **23,363** | Full CI/CD pipeline |
> 
> **Features:**
> - Turborepo caching for fast builds
> - Parallel jobs per package
> - Docker image builds with layer caching
> - Workload Identity Federation (no service account keys)
> - Environment-based deployment (dev/prod)
> - Automatic canary rollouts via Argo Rollouts

### 15.1 Workflow Structure

```
.github/
└── workflows/
    ├── ci.yml                 # Lint, test, build on PRs
    ├── deploy-dev.yml         # Deploy to dev on main push
    ├── deploy-prod.yml        # Deploy to prod on release
    └── nightly.yml            # Nightly E2E tests
```

### 14.2 Main CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  # ==================== DETECT CHANGES ====================
  changes:
    name: Detect Changes
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.filter.outputs.web }}
      api: ${{ steps.filter.outputs.api }}
      worker: ${{ steps.filter.outputs.worker }}
      packages: ${{ steps.filter.outputs.packages }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            web:
              - 'apps/web/**'
              - 'packages/ui/**'
              - 'packages/shared/**'
              - 'packages/database/**'
            api:
              - 'apps/api/**'
              - 'packages/shared/**'
              - 'packages/database/**'
            worker:
              - 'apps/worker/**'
              - 'packages/shared/**'
              - 'packages/database/**'
            packages:
              - 'packages/**'

  # ==================== CODE QUALITY ====================
  code-quality:
    name: Code Quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8
          
      - name: Get pnpm store
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Cache pnpm
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: pnpm-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: pnpm-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm turbo run lint

      - name: Type check
        run: pnpm turbo run typecheck

  # ==================== UNIT TESTS ====================
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: code-quality
    strategy:
      matrix:
        package: [database, shared, web, api, worker]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma
        run: pnpm turbo run db:generate

      - name: Run unit tests
        run: pnpm turbo run test --filter=@hta/${{ matrix.package }}
        
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          flags: ${{ matrix.package }}
          
  # ==================== INTEGRATION TESTS ====================
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: [code-quality, changes]
    if: needs.changes.outputs.api == 'true' || needs.changes.outputs.packages == 'true'
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: hta_test
          POSTGRES_PASSWORD: hta_test_password
          POSTGRES_DB: hta_calibration_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U hta_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
          
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Setup database
        run: |
          pnpm turbo run db:generate
          pnpm turbo run db:push
        env:
          DATABASE_URL: postgresql://hta_test:hta_test_password@localhost:5432/hta_calibration_test

      - name: Seed database
        run: pnpm turbo run db:seed
        env:
          DATABASE_URL: postgresql://hta_test:hta_test_password@localhost:5432/hta_calibration_test

      - name: Run integration tests
        run: pnpm turbo run test:integration
        env:
          DATABASE_URL: postgresql://hta_test:hta_test_password@localhost:5432/hta_calibration_test
          REDIS_URL: redis://localhost:6379

  # ==================== BUILD ====================
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [code-quality, changes]
    strategy:
      matrix:
        include:
          - app: web
            condition: ${{ needs.changes.outputs.web == 'true' || needs.changes.outputs.packages == 'true' }}
          - app: api
            condition: ${{ needs.changes.outputs.api == 'true' || needs.changes.outputs.packages == 'true' }}
          - app: worker
            condition: ${{ needs.changes.outputs.worker == 'true' || needs.changes.outputs.packages == 'true' }}
    steps:
      - uses: actions/checkout@v4
        if: matrix.condition

      - name: Setup Node.js
        if: matrix.condition
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Setup pnpm
        if: matrix.condition
        uses: pnpm/action-setup@v3
        with:
          version: 8

      - name: Install dependencies
        if: matrix.condition
        run: pnpm install --frozen-lockfile

      - name: Build
        if: matrix.condition
        run: pnpm turbo run build --filter=@hta/${{ matrix.app }}

  # ==================== E2E TESTS ====================
  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests, build]
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: hta_test
          POSTGRES_PASSWORD: hta_test_password
          POSTGRES_DB: hta_calibration_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U hta_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Setup database
        run: |
          pnpm turbo run db:generate
          pnpm turbo run db:push
          pnpm turbo run db:seed
        env:
          DATABASE_URL: postgresql://hta_test:hta_test_password@localhost:5432/hta_calibration_test

      - name: Cache Playwright
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install Playwright
        run: npx playwright install chromium --with-deps

      - name: Build all services
        run: pnpm turbo run build

      - name: Run E2E tests
        run: pnpm turbo run test:e2e
        env:
          DATABASE_URL: postgresql://hta_test:hta_test_password@localhost:5432/hta_calibration_test
          NEXTAUTH_SECRET: test-secret
          NEXTAUTH_URL: http://localhost:3000

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          retention-days: 7
```

### 14.3 Deployment Workflow

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy Production

on:
  release:
    types: [published]

env:
  PROJECT_ID: hta-calibration-prod
  REGION: asia-south1
  GAR_LOCATION: asia-south1-docker.pkg.dev

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    strategy:
      matrix:
        service: [web, api, worker]

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.GAR_LOCATION }}

      - name: Build and push Docker image
        run: |
          IMAGE="${{ env.GAR_LOCATION }}/${{ env.PROJECT_ID }}/hta/${{ matrix.service }}:${{ github.sha }}"
          docker build -f apps/${{ matrix.service }}/Dockerfile \
            --target production \
            -t $IMAGE .
          docker push $IMAGE

      - name: Deploy to GKE
        run: |
          # Get GKE credentials
          gcloud container clusters get-credentials ${{ env.GKE_CLUSTER }} \
            --zone ${{ env.GKE_ZONE }} \
            --project ${{ env.PROJECT_ID }}
          
          # Update image in Kustomize overlay
          cd infra/k8s/overlays/production
          kustomize edit set image \
            gcr.io/PROJECT_ID/hta-${{ matrix.service }}=${{ env.GAR_LOCATION }}/${{ env.PROJECT_ID }}/hta/${{ matrix.service }}:${{ github.sha }}
          
          # Apply to cluster
          kubectl apply -k .
          
          # Wait for rollout
          kubectl rollout status deployment/hta-${{ matrix.service }} \
            -n hta-platform --timeout=300s
```

### 14.4 Turbo Remote Caching

Enable Turbo remote caching for faster CI:

```bash
# In GitHub Actions, set these secrets:
# - TURBO_TOKEN: Get from Vercel or self-hosted cache
# - TURBO_TEAM: Your team name

# turbo.json already configured for remote caching
```

---

## 16. Testing Strategy

> **Status:** 🟡 PARTIAL (27% coverage)
> **Last Updated:** 2026-04-14
> 
> | Component | Status | Tests | Coverage |
> |-----------|--------|-------|----------|
> | Test Infrastructure | ✅ | - | Vitest, Playwright, MSW, Chromatic configured |
> | Shared Package Tests | ✅ | 74 | Cache, rate-limiter, CORS utilities |
> | API Integration Tests | ✅ | 98 | Auth, certificates, customer, notifications, workflows, instruments |
> | API Unit Tests | 🟡 | 5 | Health endpoint only |
> | Web-HTA Unit Tests | 🟡 | 9 | Button component |
> | E2E Journey Tests | ✅ | 49 | Certificate, reviewer, customer, admin flows + visual regression |
> | **TOTAL** | 🟡 | **235** | 27% of hta-calibration |
> 
> **Gap Analysis:** hta-calibration has 865 tests, hta-platform has 235 tests (27% parity).
> Target: Match hta-calibration's test coverage for production readiness.

### 16.0.1 Test Count Comparison (2026-04-14)

| Category | hta-calibration | hta-platform | Gap | Coverage |
|----------|-----------------|--------------|-----|----------|
| Unit Tests | 302 | 88 | 214 | 29% |
| Integration Tests | 197 | 98 | 99 | 50% |
| E2E Tests | 219 | 49 | 170 | 22% |
| Evals/Other | 147 | 0 | 147 | 0% |
| **Total** | **865** | **235** | **630** | **27%** |

### 16.0.2 hta-platform Test Locations

| Location | Tests | Description |
|----------|-------|-------------|
| `packages/shared/tests/` | 74 | Cache (34), rate-limiter (26), CORS (14) |
| `apps/api/tests/integration/` | 98 | Auth (16), certificates (20), customer (20), notifications (15), workflows (18), instruments (25) |
| `apps/api/tests/unit/` | 5 | Health endpoint |
| `apps/web-hta/tests/unit/` | 9 | Button component |
| `apps/web-hta/e2e/journeys/` | 37 | Certificate flow, reviewer flow, customer flow, admin authorization |
| `apps/web-hta/e2e/` | 12 | Visual regression tests (Chromatic) |
| **Total** | **235** | |

### 16.0.3 Remaining Tests to Migrate

| Category | Source Location | Tests | Priority |
|----------|-----------------|-------|----------|
| Unit - Components | `tests/unit/components/` | ~80 | P1 |
| Unit - Hooks | `tests/unit/hooks/` | ~40 | P2 |
| Unit - Utils | `tests/unit/utils/` | ~50 | P2 |
| Unit - Stores | `tests/unit/stores/` | ~30 | P2 |
| Integration - DB | `tests/integration/database/` | ~50 | P1 |
| Integration - API | `tests/integration/api/` | ~50 | P1 |
| E2E - Journeys | `tests/e2e/journeys/` | ~100 | P1 |
| E2E - Pages | `tests/e2e/pages/` | ~40 | P2 |
| Evals - Accessibility | `tests/evals/` | ~80 | P3 |
| Evals - Visual | `tests/evals/` | ~67 | P3 |
| **Total Remaining** | | **~630** | |

### 16.0 Test Migration Overview

#### Current State Comparison

| Repository | Test Count | Lines of Code | Coverage | Status |
|------------|------------|---------------|----------|--------|
| **hta-calibration** (source) | 1,000+ tests | ~50,000 | ~85% | Production, mature |
| **hta-platform** (target) | ~149 tests | ~10,000+ | ~15% | Code migrated, tests lagging |

#### The Reality

**Code IS migrated** — API routes, worker jobs, web components all exist and are functional.
**Tests are NOT migrated** — Only ~149 tests exist for ~10,000 lines of production code.

This creates a **testing debt** that must be addressed before production deployment.

#### What's Currently Implemented

| Location | File | Tests | What It Covers |
|----------|------|-------|----------------|
| `apps/api/tests/unit/` | health.test.ts | 5 | Health endpoint only |
| `apps/worker/tests/unit/` | email.test.ts | 6 | Email job structure |
| `apps/web-hta/tests/unit/` | button.test.tsx | 9 | Button component |
| `apps/web-hta/src/components/dashboard/__tests__/` | StatusBadge.test.tsx | 18 | Status badge variants |
| `apps/web-hta/src/components/tat/__tests__/` | TATBadge.test.tsx | 25 | TAT badge logic |
| `apps/web-hta/src/lib/services/queue/providers/__tests__/` | database.test.ts | 23 | Database queue provider |
| `apps/web-hta/src/lib/services/queue/__tests__/` | queue.test.ts | 17 | Queue service |
| `apps/web-hta/src/lib/stores/__tests__/` | certificate-store.test.ts | 46 | Certificate Zustand store |
| `apps/web-hta/e2e/journeys/` | certificate-flow.spec.ts | 0 | Skeleton (test.skip) |
| **TOTAL** | | **~149** | |

#### What's MISSING (Critical Gaps)

| Category | Lines of Code | Current Tests | Gap |
|----------|---------------|---------------|-----|
| **API Routes** | 6,881 | 5 | Certificate CRUD, auth, admin, customer portal untested |
| **Worker Jobs** | 417 | 6 | Cleanup, notifications untested |
| **Middleware** | ~500 | 0 | Auth, tenant, error-handler untested |
| **Services** | ~300 | 0 | Chat, refresh-token untested |
| **E2E Journeys** | - | 0 | No complete user journeys |
| **Integration** | - | 0 | No API integration tests |

#### Test Migration Plan

| Priority | Category | Tests Needed | Effort | Rationale |
|----------|----------|--------------|--------|-----------|
| **P0** | API Integration | ~50 | 2 days | Core business logic, highest risk |
| **P0** | Auth Middleware | ~20 | 1 day | Security critical |
| **P1** | Certificate Routes | ~80 | 3 days | Primary feature |
| **P1** | E2E Critical Paths | ~30 | 2 days | User journey validation |
| **P2** | Worker Jobs | ~30 | 1 day | Background processing |
| **P2** | Admin Routes | ~40 | 2 days | Admin functionality |
| **P3** | Customer Portal | ~50 | 2 days | Customer-facing features |
| **P3** | Remaining Components | ~100 | 3 days | UI coverage |

**Total Estimated Effort:** ~16 days to reach ~550 tests (~55% of hta-calibration)

#### Migration Strategy Per Test Type

##### Unit Tests (Migrate with code)
```
hta-calibration/tests/unit/          →  hta-platform/
├── auth.test.ts                     →  packages/shared/tests/auth.test.ts
├── certificate-utils.test.ts        →  packages/shared/tests/certificate.test.ts
├── components/button.test.tsx       →  packages/ui/tests/button.test.tsx
├── api/certificates.test.ts         →  apps/api/tests/unit/certificates.test.ts
└── workers/email.test.ts            →  apps/worker/tests/unit/email.test.ts
```

##### Integration Tests (Migrate after API routes)
```
hta-calibration/tests/integration/   →  hta-platform/
├── certificates.test.ts             →  apps/api/tests/integration/certificates.test.ts
├── customers.test.ts                →  apps/api/tests/integration/customers.test.ts
└── auth.test.ts                     →  apps/api/tests/integration/auth.test.ts
```

##### E2E Tests (Migrate after full stack working)
```
hta-calibration/tests/e2e/           →  hta-platform/apps/web-hta/e2e/
├── journeys/                        →  journeys/
│   ├── certificate-flow.spec.ts     →  journeys/certificate-flow.spec.ts
│   ├── customer-portal.spec.ts      →  journeys/customer-portal.spec.ts
│   └── review-flow.spec.ts          →  journeys/review-flow.spec.ts
├── pages/                           →  pages/
├── evals/                           →  evals/
└── auth.setup.ts                    →  auth.setup.ts (already migrated)
```

#### When Tests Get Written/Migrated

| Trigger | Action | Example |
|---------|--------|---------|
| Feature code migrated | Migrate corresponding tests | Move `getCertificates` handler → move `getCertificates.test.ts` |
| New feature added | Write new tests | New tenant isolation logic → new tenant.test.ts |
| Bug discovered | Add regression test | Bug in PDF generation → add specific test case |
| Integration point created | Add contract test | API/Frontend boundary → add schema validation |

#### Test Coverage Targets

| Phase | Expected Test Count | Coverage Target |
|-------|---------------------|-----------------|
| Infrastructure (current) | 20 | N/A (scaffolding) |
| After API migration | 200+ | 80% API routes |
| After worker migration | 250+ | 80% job handlers |
| After shared packages | 350+ | 90% utilities |
| After web migration | 550+ | 75% components |
| After E2E migration | 1,050+ | Full journey coverage |
| Post-migration parity | 1,000+ | Match hta-calibration |

#### Why Not Migrate All Tests First?

1. **Tests depend on code** — Can't test `getCertificates` handler until handler exists
2. **Avoid drift** — Tests migrated early would fail until code catches up
3. **Incremental validation** — Each feature migration is validated by its tests passing
4. **Reduces risk** — Migrating code + tests together ensures nothing breaks

#### Quality Gates

Before any PR is merged to hta-platform:

| Gate | Requirement | Enforced By |
|------|-------------|-------------|
| Unit tests pass | All `pnpm test` green | GitHub Actions |
| Coverage threshold | ≥80% for changed files | Vitest coverage |
| E2E smoke test | Core journeys pass | Playwright |
| Type check | No TypeScript errors | `tsc --noEmit` |
| Lint | No ESLint errors | `eslint` |

---

### 16.1 Test Organization

```
hta-platform/
├── apps/
│   ├── web-hta/
│   │   ├── tests/
│   │   │   ├── unit/              # Component tests (Vitest)
│   │   │   └── integration/       # Page tests with mocked API
│   │   ├── e2e/                   # Playwright E2E tests
│   │   │   ├── .auth/             # Stored auth sessions
│   │   │   ├── journeys/          # User workflow tests
│   │   │   ├── pages/             # Page-specific tests
│   │   │   └── evals/             # Accessibility, visual, compliance
│   │   ├── vitest.config.ts       # Unit/integration test config
│   │   └── playwright.config.ts   # E2E test config
│   │
│   ├── api/
│   │   ├── tests/
│   │   │   ├── unit/              # Handler tests (Vitest)
│   │   │   └── integration/       # API endpoint tests (real DB)
│   │   └── vitest.config.ts
│   │
│   └── worker/
│       ├── tests/
│       │   ├── unit/              # Job logic tests
│       │   └── integration/       # Job execution tests
│       └── vitest.config.ts
│
├── packages/
│   ├── database/
│   │   ├── tests/                 # Prisma query tests
│   │   └── vitest.config.ts
│   ├── shared/
│   │   ├── tests/                 # Utility tests
│   │   └── vitest.config.ts
│   └── ui/
│       ├── tests/                 # Component tests
│       └── vitest.config.ts
│
├── tests/                         # Cross-service tests (root level)
│   ├── contracts/                 # API contract tests (Pact)
│   └── load/                      # Load tests (k6)
│
├── vitest.workspace.ts            # Workspace config for all packages
└── turbo.json                     # Turborepo task orchestration
```

### 16.2 Test Mapping from Current Repo

| Current Location | New Location | Test Type |
|-----------------|--------------|-----------|
| `tests/unit/` | `apps/api/tests/unit/` + `packages/*/tests/` | Unit |
| `tests/integration/` | `apps/api/tests/integration/` | Integration |
| `tests/e2e/journeys/` | `apps/web-hta/e2e/journeys/` | E2E Workflows |
| `tests/e2e/pages/` | `apps/web-hta/e2e/pages/` | E2E Pages |
| `tests/e2e/evals/` | `apps/web-hta/e2e/evals/` | Accessibility/Visual |
| `tests/e2e/auth.setup.ts` | `apps/web-hta/e2e/auth.setup.ts` | Auth Setup |

### 16.3 Unit Tests

Each package/app has its own unit tests using Vitest:

```typescript
// packages/shared/tests/auth.test.ts
import { describe, it, expect } from 'vitest'
import { verifyPassword, hashPassword } from '../src/auth'

describe('Auth utilities', () => {
  it('should hash and verify password', async () => {
    const password = 'testPassword123'
    const hash = await hashPassword(password)
    expect(await verifyPassword(password, hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})
```

```typescript
// apps/api/tests/unit/certificates.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getCertificates } from '../../src/routes/certificates/handlers'

describe('Certificate handlers', () => {
  it('should return certificates for user', async () => {
    const mockPrisma = {
      certificate: {
        findMany: vi.fn().mockResolvedValue([{ id: '1', status: 'DRAFT' }])
      }
    }
    
    const result = await getCertificates({ userId: 'user1' }, mockPrisma)
    expect(result).toHaveLength(1)
  })
})
```

### 16.4 Integration Tests

Test API endpoints with real database:

```typescript
// apps/api/tests/integration/certificates.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestServer } from '../helpers/server'
import { prisma } from '@hta/database'

describe('Certificates API', () => {
  let server: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    server = await createTestServer()
    await prisma.$connect()
  })

  afterAll(async () => {
    await server.close()
    await prisma.$disconnect()
  })

  it('GET /api/certificates returns certificates', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/certificates',
      headers: {
        authorization: 'Bearer test-token'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toBeInstanceOf(Array)
  })
})
```

### 16.5 E2E Tests (Playwright)

E2E tests run against all services:

```typescript
// apps/web-hta/e2e/journeys/certificate-flow.spec.ts
import { test, expect } from '@playwright/test'
import { TEST_USERS } from '../fixtures/test-data'

test.describe('Certificate Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('[name="email"]', TEST_USERS.engineer.email)
    await page.fill('[name="password"]', TEST_USERS.engineer.password)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/dashboard/)
  })

  test('engineer can create certificate', async ({ page }) => {
    await page.click('text=New Certificate')
    await page.fill('[name="customerName"]', 'Test Company')
    // ... fill form
    await page.click('text=Save Draft')
    await expect(page.locator('text=Draft saved')).toBeVisible()
  })
})
```

### 16.6 Contract Tests

Ensure API/frontend contracts are maintained:

```typescript
// tests/contracts/api-contract.test.ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Define expected API response schemas
const CertificateSchema = z.object({
  id: z.string(),
  certificateNumber: z.string(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED']),
  customerName: z.string(),
  createdAt: z.string().datetime(),
})

describe('API Contracts', () => {
  it('GET /api/certificates matches schema', async () => {
    const response = await fetch('http://localhost:8080/api/certificates', {
      headers: { authorization: 'Bearer test-token' }
    })
    const data = await response.json()
    
    // Validate each certificate matches schema
    for (const cert of data) {
      expect(() => CertificateSchema.parse(cert)).not.toThrow()
    }
  })
})
```

### 16.7 Load Tests

```typescript
// tests/load/api-load.test.ts
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up
    { duration: '3m', target: 10 },   // Stay
    { duration: '1m', target: 50 },   // Spike
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% under 200ms
    http_req_failed: ['rate<0.01'],    // <1% errors
  },
}

export default function () {
  const res = http.get('http://api:8080/api/certificates', {
    headers: { authorization: `Bearer ${__ENV.TEST_TOKEN}` },
  })
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  })
  
  sleep(1)
}
```

### 16.8 Test Commands

```json
// Root package.json scripts
{
  "scripts": {
    "test": "turbo run test",
    "test:unit": "turbo run test --filter=./packages/* --filter=./apps/*",
    "test:integration": "turbo run test:integration",
    "test:e2e": "turbo run test:e2e --filter=@hta/web",
    "test:contracts": "vitest run tests/contracts",
    "test:load": "k6 run tests/load/api-load.test.ts",
    "test:coverage": "turbo run test:coverage"
  }
}
```

### 16.9 CI Test Matrix

| Test Type | Trigger | Services Required | Duration |
|-----------|---------|-------------------|----------|
| Unit | All PRs | None | ~30s |
| Integration | API/Package changes | PostgreSQL, Redis | ~2m |
| E2E | All PRs to main | All services | ~5m |
| Load | Nightly/Manual | All services | ~10m |
| Contracts | API changes | API service | ~30s |

---

## 17. Monitoring Implementation

> **Note:** We use Sentry (already configured) for error tracking, performance monitoring, and distributed tracing. No need for separate OpenTelemetry setup.

### 16.1 Sentry Setup for Multi-Service

Each service initializes Sentry with its own service name for distributed tracing:

```typescript
// packages/shared/src/sentry/index.ts
import * as Sentry from '@sentry/node'

export function initSentry(serviceName: 'web' | 'api' | 'worker') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.npm_package_version,
    
    // Service identification for distributed tracing
    serverName: serviceName,
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Profile 10% of sampled transactions
    profilesSampleRate: 0.1,
    
    integrations: [
      // Auto-instrument HTTP, database, etc.
      ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
    ],
    
    // Filter out health check noise
    beforeSendTransaction(event) {
      if (event.transaction?.includes('/health') || event.transaction?.includes('/ready')) {
        return null
      }
      return event
    },
  })
}

export { Sentry }
```

### 16.2 Service Instrumentation

```typescript
// apps/api/src/index.ts
import { initSentry, Sentry } from '@hta/shared/sentry'

// Initialize Sentry before other imports
initSentry('api')

import { createApp } from './app'
const app = createApp()

// Wrap with Sentry error handler
app.setErrorHandler((error, request, reply) => {
  Sentry.captureException(error)
  reply.status(500).send({ error: 'Internal Server Error' })
})
```

```typescript
// apps/web/src/instrumentation.ts (Next.js instrumentation hook)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentry } = await import('@hta/shared/sentry')
    initSentry('web')
  }
}
```

```typescript
// apps/worker/src/index.ts
import { initSentry, Sentry } from '@hta/shared/sentry'

initSentry('worker')

// Wrap job processing with Sentry
async function processJobWithSentry(jobName: string, fn: () => Promise<void>) {
  return Sentry.startSpan({ name: jobName, op: 'job' }, async () => {
    try {
      await fn()
    } catch (error) {
      Sentry.captureException(error)
      throw error
    }
  })
}
```

### 16.3 Distributed Tracing

Sentry automatically propagates trace context via `sentry-trace` and `baggage` headers. For custom HTTP clients:

```typescript
// packages/shared/src/http-client.ts
import * as Sentry from '@sentry/node'

export async function fetchWithTracing(url: string, options: RequestInit = {}) {
  return Sentry.startSpan(
    { name: `HTTP ${options.method || 'GET'} ${new URL(url).pathname}`, op: 'http.client' },
    async (span) => {
      // Sentry injects trace headers automatically with fetch instrumentation
      const response = await fetch(url, options)
      
      span?.setAttributes({
        'http.status_code': response.status,
        'http.url': url,
      })
      
      return response
    }
  )
}
```

### 16.4 Custom Metrics via Sentry

```typescript
// packages/shared/src/metrics.ts
import * as Sentry from '@sentry/node'

// Track custom metrics using Sentry's metrics API
export const metrics = {
  // API Metrics
  trackApiRequest(route: string, duration: number, statusCode: number) {
    Sentry.metrics.distribution('api.request.duration', duration, {
      unit: 'millisecond',
      tags: { route, status: String(statusCode) },
    })
    Sentry.metrics.increment('api.request.count', 1, {
      tags: { route, status: String(statusCode) },
    })
  },

  // Database Metrics
  trackDbQuery(operation: string, duration: number) {
    Sentry.metrics.distribution('db.query.duration', duration, {
      unit: 'millisecond',
      tags: { operation },
    })
  },

  // Worker Metrics
  trackJobProcessed(jobType: string, duration: number, success: boolean) {
    Sentry.metrics.distribution('worker.job.duration', duration, {
      unit: 'millisecond',
      tags: { job_type: jobType, success: String(success) },
    })
    Sentry.metrics.increment('worker.job.count', 1, {
      tags: { job_type: jobType, success: String(success) },
    })
  },

  // Queue depth (call periodically)
  trackQueueDepth(depth: number) {
    Sentry.metrics.gauge('worker.queue.depth', depth)
  },
}
```

### 16.5 Structured Logging

```typescript
// packages/shared/src/logger.ts
import pino from 'pino'
import * as Sentry from '@sentry/node'

const isProduction = process.env.NODE_ENV === 'production'

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    ...(isProduction
      ? {
          // GCP Cloud Logging format
          messageKey: 'message',
          formatters: {
            level: (label) => ({ severity: label.toUpperCase() }),
          },
        }
      : {
          transport: { target: 'pino-pretty' },
        }),
    // Include Sentry trace context in logs
    mixin() {
      const span = Sentry.getActiveSpan()
      if (span) {
        const { traceId, spanId } = span.spanContext()
        return {
          'trace_id': traceId,
          'span_id': spanId,
        }
      }
      return {}
    },
  })
}

// Also send errors to Sentry
export function logError(logger: pino.Logger, error: Error, context?: Record<string, unknown>) {
  logger.error({ error, ...context }, error.message)
  Sentry.captureException(error, { extra: context })
}
```

### 16.6 Health Check Endpoints

```typescript
// packages/shared/src/health.ts
import { prisma } from '@hta/database'
import { cache } from '@hta/shared/cache'

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  checks: Record<string, { status: string; latency?: number; error?: string }>
}

export async function checkHealth(serviceName: string): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {}
  let overallStatus: HealthStatus['status'] = 'healthy'

  // Database check
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latency: Date.now() - dbStart }
  } catch (error) {
    checks.database = { status: 'error', error: String(error) }
    overallStatus = 'unhealthy'
  }

  // Cache check (if applicable)
  if (cache) {
    const cacheStart = Date.now()
    try {
      await cache.set('health:check', '1', 10)
      await cache.get('health:check')
      checks.cache = { status: 'ok', latency: Date.now() - cacheStart }
    } catch (error) {
      checks.cache = { status: 'error', error: String(error) }
      overallStatus = overallStatus === 'healthy' ? 'degraded' : overallStatus
    }
  }

  return {
    status: overallStatus,
    version: process.env.npm_package_version || 'unknown',
    checks,
  }
}

// Express/Fastify route handler
export async function healthHandler(req: Request, res: Response) {
  const health = await checkHealth(process.env.SERVICE_NAME || 'unknown')
  const statusCode = health.status === 'unhealthy' ? 503 : 200
  res.status(statusCode).json(health)
}
```

### 16.7 Monitoring Dashboards (Terraform)

> **Note:** The examples below use Cloud Run metrics. For GKE deployment, replace:
> - `resource.type="cloud_run_revision"` → `resource.type="k8s_container"`
> - `run.googleapis.com/request_count` → `kubernetes.io/container/restart_count` or custom metrics
> - Use GKE-specific metrics: `kubernetes.io/container/cpu/core_usage_time`, `kubernetes.io/container/memory/used_bytes`
>
> See [GKE Monitoring Metrics](https://cloud.google.com/monitoring/api/metrics_gcp#gcp-container) for full list.

```hcl
# terraform/modules/monitoring/dashboards.tf
# TODO: Update filters for GKE metrics (currently shows Cloud Run examples)

resource "google_monitoring_dashboard" "services_overview" {
  dashboard_json = jsonencode({
    displayName = "HTA Services Overview"
    gridLayout = {
      columns = 3
      widgets = [
        # Request Rate per Service
        {
          title = "Request Rate by Service"
          xyChart = {
            dataSets = [for service in ["web", "api", "worker"] : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND resource.labels.service_name=\"hta-${service}\""
                  aggregation = {
                    alignmentPeriod = "60s"
                    perSeriesAligner = "ALIGN_RATE"
                  }
                }
              }
              plotType = "LINE"
            }]
          }
        },
        # Latency by Service
        {
          title = "P95 Latency by Service"
          xyChart = {
            dataSets = [for service in ["web", "api"] : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\" AND resource.labels.service_name=\"hta-${service}\""
                  aggregation = {
                    alignmentPeriod = "60s"
                    perSeriesAligner = "ALIGN_PERCENTILE_95"
                  }
                }
              }
              plotType = "LINE"
            }]
          }
        },
        # Error Rate
        {
          title = "Error Rate (%)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilterRatio = {
                  numerator = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class!=\"2xx\""
                  }
                  denominator = {
                    filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\""
                  }
                }
              }
              plotType = "LINE"
            }]
          }
        },
        # Instance Count
        {
          title = "Active Instances"
          xyChart = {
            dataSets = [for service in ["web", "api", "worker"] : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/container/instance_count\" AND resource.labels.service_name=\"hta-${service}\""
                }
              }
              plotType = "STACKED_AREA"
            }]
          }
        },
        # Database Connections
        {
          title = "Database Connections"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\""
                }
              }
              plotType = "LINE"
            }]
          }
        },
        # Worker Queue Depth
        {
          title = "Worker Queue Depth"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"custom.googleapis.com/worker/queue/depth\""
                }
              }
              plotType = "LINE"
            }]
          }
        }
      ]
    }
  })
}
```

### 16.8 Alerting Policies

```hcl
# terraform/modules/monitoring/alerts.tf

# High Error Rate Alert (per service)
resource "google_monitoring_alert_policy" "high_error_rate" {
  for_each = toset(["web", "api", "worker"])
  
  display_name = "High Error Rate - hta-${each.key}"
  combiner     = "OR"
  
  conditions {
    display_name = "Error rate > 5%"
    condition_threshold {
      filter     = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class!=\"2xx\" AND resource.labels.service_name=\"hta-${each.key}\""
      comparison = "COMPARISON_GT"
      threshold_value = 0.05
      duration   = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = var.notification_channels
  
  alert_strategy {
    auto_close = "1800s"
  }
}

# High Latency Alert
resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "High API Latency"
  combiner     = "OR"
  
  conditions {
    display_name = "P95 latency > 500ms"
    condition_threshold {
      filter     = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\" AND resource.labels.service_name=\"hta-api\""
      comparison = "COMPARISON_GT"
      threshold_value = 500
      duration   = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }
    }
  }

  notification_channels = var.notification_channels
}

# Database Connection Pool Exhaustion
resource "google_monitoring_alert_policy" "db_connection_pool" {
  display_name = "Database Connection Pool Warning"
  combiner     = "OR"
  
  conditions {
    display_name = "Connections > 80% of max"
    condition_threshold {
      filter     = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\""
      comparison = "COMPARISON_GT"
      threshold_value = 80  # 80% of 100 max connections
      duration   = "120s"
    }
  }

  notification_channels = var.notification_channels
}

# Worker Queue Backlog
resource "google_monitoring_alert_policy" "worker_backlog" {
  display_name = "Worker Queue Backlog"
  combiner     = "OR"
  
  conditions {
    display_name = "Queue depth > 100"
    condition_threshold {
      filter     = "metric.type=\"custom.googleapis.com/worker/queue/depth\""
      comparison = "COMPARISON_GT"
      threshold_value = 100
      duration   = "600s"
    }
  }

  notification_channels = var.notification_channels
}
```

### 17.9 PagerDuty Integration

```typescript
// packages/shared/src/alerting/pagerduty.ts
import { createLogger } from '../logger'

const logger = createLogger('pagerduty')

interface PagerDutyEvent {
  routing_key: string
  event_action: 'trigger' | 'acknowledge' | 'resolve'
  dedup_key?: string
  payload: {
    summary: string
    severity: 'critical' | 'error' | 'warning' | 'info'
    source: string
    custom_details?: Record<string, unknown>
  }
}

export async function triggerPagerDutyAlert(
  summary: string,
  severity: 'critical' | 'error' | 'warning' | 'info',
  details?: Record<string, unknown>,
  dedupKey?: string
): Promise<void> {
  if (!process.env.PAGERDUTY_ROUTING_KEY) {
    logger.warn('PagerDuty routing key not configured')
    return
  }

  const event: PagerDutyEvent = {
    routing_key: process.env.PAGERDUTY_ROUTING_KEY,
    event_action: 'trigger',
    dedup_key: dedupKey,
    payload: {
      summary,
      severity,
      source: `hta-calibr8s-${process.env.SERVICE_NAME || 'unknown'}`,
      custom_details: details,
    },
  }

  try {
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.status}`)
    }

    logger.info({ summary, severity }, 'PagerDuty alert triggered')
  } catch (error) {
    logger.error({ err: error }, 'Failed to trigger PagerDuty alert')
  }
}

export async function resolvePagerDutyAlert(dedupKey: string): Promise<void> {
  if (!process.env.PAGERDUTY_ROUTING_KEY) return

  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routing_key: process.env.PAGERDUTY_ROUTING_KEY,
      event_action: 'resolve',
      dedup_key: dedupKey,
    }),
  })
}

// Usage with health checks
export async function alertOnHealthFailure(service: string, checks: Record<string, any>) {
  const failedChecks = Object.entries(checks)
    .filter(([_, v]) => v.status === 'error')
    .map(([k]) => k)

  if (failedChecks.length > 0) {
    await triggerPagerDutyAlert(
      `${service}: Health check failed - ${failedChecks.join(', ')}`,
      'error',
      { service, failedChecks, checks },
      `health-${service}-${failedChecks.sort().join('-')}`
    )
  }
}
```

### 17.10 SLO/SLA Dashboard

```hcl
# terraform/modules/monitoring/slo-dashboard.tf

resource "google_monitoring_dashboard" "slo" {
  dashboard_json = jsonencode({
    displayName = "HTA Calibr8s - SLO Dashboard"
    gridLayout = {
      columns = 2
      widgets = [
        {
          title = "API Availability (Target: 99.9%)"
          scorecard = {
            timeSeriesQuery = {
              timeSeriesFilterRatio = {
                numerator = {
                  filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"2xx\" AND resource.labels.service_name=\"hta-api\""
                }
                denominator = {
                  filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND resource.labels.service_name=\"hta-api\""
                }
              }
            }
            thresholds = [
              { value = 99.9, color = "GREEN" },
              { value = 99.5, color = "YELLOW" },
              { value = 99.0, color = "RED" }
            ]
          }
        },
        {
          title = "API Latency p95 (Target: <200ms)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_latencies\" AND resource.labels.service_name=\"hta-api\""
                  aggregation = {
                    alignmentPeriod = "300s"
                    perSeriesAligner = "ALIGN_PERCENTILE_95"
                  }
                }
              }
            }]
            yAxis = {
              scale = "LINEAR"
              label = "Latency (ms)"
            }
          }
        },
        {
          title = "Error Budget Remaining (Monthly)"
          scorecard = {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "metric.type=\"custom.googleapis.com/slo/error_budget_remaining\""
              }
            }
            thresholds = [
              { value = 50, color = "GREEN" },
              { value = 25, color = "YELLOW" },
              { value = 0, color = "RED" }
            ]
          }
        },
        {
          title = "Worker Job Success Rate (Target: 99%)"
          scorecard = {
            timeSeriesQuery = {
              timeSeriesFilterRatio = {
                numerator = {
                  filter = "metric.type=\"custom.googleapis.com/worker/job/count\" AND metric.labels.success=\"true\""
                }
                denominator = {
                  filter = "metric.type=\"custom.googleapis.com/worker/job/count\""
                }
              }
            }
            thresholds = [
              { value = 99, color = "GREEN" },
              { value = 95, color = "YELLOW" },
              { value = 90, color = "RED" }
            ]
          }
        }
      ]
    }
  })
}
```

### 17.11 Monitoring Checklist

| Capability | Implementation | Status |
|------------|----------------|--------|
| Error tracking | Sentry | ✅ Done |
| Performance monitoring | Sentry APM | ✅ Done |
| Distributed tracing | Sentry + sentry-trace headers | ✅ Done |
| Custom metrics | Sentry metrics API | ✅ Done |
| Structured logging | Pino + Cloud Logging | ✅ Done |
| Health endpoints | `/health`, `/ready` | ✅ Done |
| Cloud dashboards | Terraform managed | ⏳ Planned |
| Alert policies | GCP Monitoring | ⏳ Planned |
| PagerDuty integration | Events API v2 | ⏳ Planned |
| SLO dashboards | GCP Monitoring | ⏳ Planned |
| Error budget alerts | Custom metric + alert | ⏳ Planned |

---

## 18. Security Enhancements

### 18.1 Two-Factor Authentication (2FA)

#### TOTP Implementation

```typescript
// packages/shared/src/auth/totp.ts
import { authenticator } from 'otplib'
import { createLogger } from '../logger'

const logger = createLogger('totp')

export function generateTOTPSecret(email: string): {
  secret: string
  qrCodeUrl: string
} {
  const secret = authenticator.generateSecret()
  const otpauth = authenticator.keyuri(email, 'HTA Calibr8s', secret)
  
  logger.info({ email }, 'Generated TOTP secret')
  
  return {
    secret,
    qrCodeUrl: otpauth, // Use qrcode library to generate QR
  }
}

export function verifyTOTP(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret })
}

export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase())
  }
  return codes
}
```

#### Database Schema Addition

```prisma
// packages/database/prisma/schema.prisma

model User {
  // ... existing fields
  
  // 2FA fields
  totpSecret        String?
  totpEnabled       Boolean   @default(false)
  totpVerifiedAt    DateTime?
  backupCodes       String[]  // Encrypted backup codes
  
  // WebAuthn
  webauthnCredentials WebAuthnCredential[]
}

model WebAuthnCredential {
  id              String    @id @default(cuid())
  credentialId    String    @unique
  publicKey       Bytes
  counter         Int
  deviceType      String?
  deviceName      String?
  createdAt       DateTime  @default(now())
  lastUsedAt      DateTime?
  
  userId          String
  user            User      @relation(fields: [userId], references: [id])
}
```

#### 2FA Setup Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    2FA SETUP FLOW                            │
├─────────────────────────────────────────────────────────────┤
│  1. Admin navigates to Settings > Security                  │
│           │                                                  │
│           ▼                                                  │
│  2. Click "Enable 2FA"                                      │
│           │                                                  │
│           ▼                                                  │
│  3. Choose method: TOTP (Google Auth) or WebAuthn (Passkey)│
│           │                                                  │
│           ▼                                                  │
│  4a. TOTP: Scan QR code, enter verification code            │
│  4b. WebAuthn: Register security key or biometric           │
│           │                                                  │
│           ▼                                                  │
│  5. Generate and save backup codes                          │
│           │                                                  │
│           ▼                                                  │
│  6. 2FA enabled - required on next login                    │
└─────────────────────────────────────────────────────────────┘
```

### 18.2 WebAuthn Implementation

```typescript
// packages/shared/src/auth/webauthn.ts
import { 
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'

const rpName = 'HTA Calibr8s'
const rpID = process.env.WEBAUTHN_RP_ID || 'htacalibr8s.com'
const origin = process.env.WEBAUTHN_ORIGIN || `https://${rpID}`

export async function startRegistration(user: { id: string; email: string }) {
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: user.id,
    userName: user.email,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })
  
  return options
}

export async function finishRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string
) {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })
  
  return verification
}

export async function startAuthentication(
  credentials: { id: string; transports?: AuthenticatorTransport[] }[]
) {
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map(cred => ({
      id: cred.id,
      type: 'public-key',
      transports: cred.transports,
    })),
    userVerification: 'preferred',
  })
  
  return options
}
```

### 18.3 CSP with Nonces

```typescript
// apps/web/src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'

export function middleware(request: NextRequest) {
  const nonce = crypto.randomBytes(16).toString('base64')
  
  // Strict CSP with nonces
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' data: blob: https://storage.googleapis.com;
    font-src 'self' data:;
    connect-src 'self' https://*.sentry.io wss://*.pusher.com;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim()

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', cspHeader)
  response.headers.set('X-Nonce', nonce) // Pass to components
  
  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
```

```typescript
// apps/web/src/app/layout.tsx
import { headers } from 'next/headers'
import Script from 'next/script'

export default function RootLayout({ children }) {
  const nonce = headers().get('X-Nonce') || ''
  
  return (
    <html lang="en">
      <body>
        {children}
        {/* All inline scripts must use nonce */}
        <Script nonce={nonce} id="analytics">
          {`/* analytics code */`}
        </Script>
      </body>
    </html>
  )
}
```

### 18.4 Cloud Armor WAF

```hcl
# terraform/modules/cloud-armor/main.tf

resource "google_compute_security_policy" "waf" {
  name = "hta-waf-policy"

  # Default rule - allow all
  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default allow rule"
  }

  # Block SQL injection
  rule {
    action   = "deny(403)"
    priority = "1000"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-v33-stable')"
      }
    }
    description = "Block SQL injection"
  }

  # Block XSS
  rule {
    action   = "deny(403)"
    priority = "1001"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-v33-stable')"
      }
    }
    description = "Block XSS attacks"
  }

  # Block remote code execution
  rule {
    action   = "deny(403)"
    priority = "1002"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rce-v33-stable')"
      }
    }
    description = "Block RCE attempts"
  }

  # Rate limiting - 1000 requests per minute per IP
  rule {
    action   = "throttle"
    priority = "2000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      rate_limit_threshold {
        count        = 1000
        interval_sec = 60
      }
    }
    description = "Rate limit all IPs"
  }

  # Geo-blocking (optional - enable for specific regions)
  # rule {
  #   action   = "deny(403)"
  #   priority = "500"
  #   match {
  #     expr {
  #       expression = "origin.region_code == 'XX'"
  #     }
  #   }
  #   description = "Geo-block specific regions"
  # }
}

# Attach WAF policy to backend services
resource "google_compute_backend_service" "api" {
  name                  = "hta-api-backend"
  security_policy       = google_compute_security_policy.waf.id
  # ... other config
}
```

### 18.5 CORS for Separated Services

```typescript
// apps/api/src/middleware/cors.ts
import { FastifyPluginCallback } from 'fastify'
import cors from '@fastify/cors'

export const corsPlugin: FastifyPluginCallback = (fastify, _, done) => {
  const allowedOrigins = [
    process.env.WEB_URL || 'https://htacalibr8s.com',
    process.env.CUSTOMER_URL || 'https://customer.htacalibr8s.com',
  ]

  // Add staging/dev origins
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:3000', 'http://localhost:3001')
  }

  fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server)
      if (!origin) {
        callback(null, true)
        return
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('CORS not allowed'), false)
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'sentry-trace', 'baggage'],
    credentials: true,
    maxAge: 86400, // 24 hours
  })

  done()
}
```

### 18.6 Security Checklist

| Feature | Status | Location | Priority |
|---------|--------|----------|----------|
| 2FA (TOTP) | ⏳ Planned | `packages/shared/src/auth/totp.ts` | P1 |
| WebAuthn | ⏳ Planned | `packages/shared/src/auth/webauthn.ts` | P2 |
| CSP with nonces | ⏳ Planned | `apps/web/src/middleware.ts` | P1 |
| Cloud Armor WAF | ⏳ Planned | `terraform/modules/cloud-armor/` | P1 |
| CORS for services | ⏳ Planned | `apps/api/src/middleware/cors.ts` | P1 |
| Rate limiting | ✅ Done | `packages/shared/src/security/` | - |
| Account lockout | ✅ Done | `packages/shared/src/security/` | - |
| Security headers | ✅ Done | `next.config.ts` | - |

---

## 19. Disaster Recovery

### 19.1 Backup Configuration

```hcl
# terraform/modules/cloudsql/main.tf

resource "google_sql_database_instance" "main" {
  name             = "hta-main"
  database_version = "POSTGRES_16"
  region           = "asia-south1"

  settings {
    tier              = "db-custom-2-4096"
    availability_type = "REGIONAL" # HA with automatic failover

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00" # 3 AM IST
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 4 # 4 AM IST
      update_track = "stable"
    }
  }

  deletion_protection = true
}
```

### 19.2 Backup Restore Procedure

```bash
#!/bin/bash
# scripts/dr-restore.sh

set -e

# Configuration
PROJECT_ID="hta-calibration-prod"
INSTANCE_NAME="hta-main"
BACKUP_ID="$1"
TARGET_INSTANCE="hta-restore-test"
START_TIME=$(date +%s)

echo "=== HTA Calibr8s Disaster Recovery Restore ==="
echo "Backup ID: $BACKUP_ID"
echo "Target: $TARGET_INSTANCE"

# 1. Create restore instance
echo "Creating restore instance..."
gcloud sql instances clone $INSTANCE_NAME $TARGET_INSTANCE \
  --project=$PROJECT_ID

# 2. Restore from backup
echo "Restoring from backup..."
gcloud sql backups restore $BACKUP_ID \
  --restore-instance=$TARGET_INSTANCE \
  --project=$PROJECT_ID

# 3. Wait for restore to complete
echo "Waiting for restore..."
while true; do
  STATUS=$(gcloud sql operations list --instance=$TARGET_INSTANCE \
    --filter="operationType=RESTORE_VOLUME" --format="value(status)" \
    --limit=1)
  if [ "$STATUS" == "DONE" ]; then
    break
  fi
  echo "Status: $STATUS"
  sleep 30
done

# 4. Verify data integrity
echo "Verifying data integrity..."
CERT_COUNT=$(gcloud sql connect $TARGET_INSTANCE --database=hta_calibration \
  --quiet -- -c "SELECT COUNT(*) FROM certificates;" | tail -1)
echo "Certificate count: $CERT_COUNT"

USER_COUNT=$(gcloud sql connect $TARGET_INSTANCE --database=hta_calibration \
  --quiet -- -c "SELECT COUNT(*) FROM users WHERE is_active = true;" | tail -1)
echo "Active user count: $USER_COUNT"

# 5. Record restore time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo "Restore completed in $DURATION seconds ($(($DURATION / 60)) minutes)"

# 6. Cleanup (optional)
read -p "Delete test instance? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  gcloud sql instances delete $TARGET_INSTANCE --project=$PROJECT_ID --quiet
fi
```

### 19.3 DR Drill Checklist

```markdown
# Monthly DR Drill Checklist

**Date:** _______________
**Conducted by:** _______________
**Backup used:** _______________

## Pre-Drill Preparation
- [ ] Notify team of upcoming drill
- [ ] Identify latest backup to restore
- [ ] Document expected data counts:
  - Certificates: _______
  - Users: _______
  - Audit logs: _______

## Database Restore
- [ ] Create test Cloud SQL instance
- [ ] Restore backup to test instance
- [ ] Record restore duration: _______ minutes
- [ ] Verify certificate count matches
- [ ] Verify user count matches

## Data Integrity Checks
- [ ] Query sample certificates (10 random)
- [ ] Verify user accounts can authenticate
- [ ] Check audit logs present
- [ ] Validate file attachments accessible (GCS)
- [ ] Check PDF generation works

## Application Verification
- [ ] Point test app to restored database
- [ ] Login as admin - success?
- [ ] Login as customer - success?
- [ ] View certificate details
- [ ] Download PDF certificate
- [ ] Send test notification

## Results Summary
| Metric | Target | Actual | Pass? |
|--------|--------|--------|-------|
| RTO (Recovery Time) | < 1 hour | _______ | ☐ |
| RPO (Data Loss) | < 1 hour | _______ | ☐ |
| Data Integrity | 100% | _______% | ☐ |

## Issues Found
1. _______________
2. _______________
3. _______________

## Action Items
1. _______________
2. _______________

## Post-Drill Cleanup
- [ ] Delete test instance
- [ ] Document findings in Confluence
- [ ] Update runbook if needed
- [ ] Schedule fixes for issues

**Sign-off:** _______________
**Date:** _______________
```

### 19.4 Cross-Region Replica

```hcl
# terraform/modules/cloudsql/replica.tf

resource "google_sql_database_instance" "replica" {
  name                 = "hta-main-replica"
  master_instance_name = google_sql_database_instance.main.name
  region               = "us-west1" # Different region from primary (asia-south1)
  database_version     = "POSTGRES_16"

  replica_configuration {
    failover_target = true
  }

  settings {
    tier              = "db-custom-2-4096"
    availability_type = "REGIONAL"
    
    backup_configuration {
      enabled = false # Replica doesn't need separate backups
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_network_id
    }
  }

  deletion_protection = true
}

# Failover command (manual)
# gcloud sql instances failover hta-main-replica --project=hta-calibration-prod
```

### 19.5 GCS Multi-Region Buckets

```hcl
# terraform/modules/storage/main.tf

resource "google_storage_bucket" "certificates" {
  name     = "hta-calibr8s-certificates"
  location = "US" # Multi-region for redundancy

  storage_class = "STANDARD"
  
  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
    condition {
      age = 90 # Move to Nearline after 90 days
    }
  }

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
    condition {
      age = 365 # Move to Coldline after 1 year
    }
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age                   = 3650 # Delete after 10 years
      num_newer_versions    = 1
      with_state            = "ARCHIVED"
    }
  }
}

resource "google_storage_bucket" "uploads" {
  name     = "hta-calibr8s-uploads"
  location = "ASIA" # Multi-region for user-facing content

  storage_class = "STANDARD"
  
  versioning {
    enabled = true
  }

  cors {
    origin          = ["https://htacalibr8s.com"]
    method          = ["GET", "HEAD", "PUT", "POST"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}
```

### 19.6 RTO/RPO Targets

| Metric | Definition | Target | Current Capability |
|--------|------------|--------|-------------------|
| **RPO** | Maximum acceptable data loss | 1 hour | 5 min (PITR) |
| **RTO** | Time to restore service | 1 hour | ~30 min |
| **MTTR** | Mean time to repair | 2 hours | TBD |
| **Backup frequency** | Automated backups | Daily | Daily 3 AM |
| **PITR window** | Point-in-time recovery | 7 days | 7 days |
| **Backup retention** | How long backups kept | 30 days | 30 days |
| **Geo-redundancy** | Cross-region failover | Yes | Yes (US-West replica) |

### 19.7 Disaster Scenarios & Responses

| Scenario | Impact | Response | RTO |
|----------|--------|----------|-----|
| **Database corruption** | High | Restore from PITR backup | 30 min |
| **Region failure** | High | Failover to replica region | 15 min |
| **Accidental deletion** | Medium | Restore from GCS versioning | 10 min |
| **Security breach** | Critical | Isolate, restore clean backup | 2 hours |
| **Cloud provider outage** | High | Wait or manual intervention | Variable |

---

## 20. Secrets Infrastructure

### 17.1 Secret Manager Organization

```
projects/hta-calibration-prod/secrets/
├── common/                    # Shared across services
│   ├── database-url           # Prisma Accelerate URL
│   ├── database-direct-url    # Direct PostgreSQL URL (migrations)
│   ├── redis-url              # Redis connection string
│   └── sentry-dsn             # Error tracking
├── web/                       # Frontend-specific
│   ├── nextauth-secret        # Session signing
│   ├── nextauth-url           # Public URL
│   └── api-internal-url       # Internal API URL
├── api/                       # API-specific
│   ├── jwt-secret             # JWT signing key
│   ├── encryption-key         # Data encryption key
│   └── webhook-signing-key    # Webhook verification
└── worker/                    # Worker-specific
    ├── sendgrid-api-key       # Email service
    └── queue-signing-key      # Job queue verification
```

### 17.2 Terraform Secret Resources

```hcl
# terraform/modules/secrets/main.tf

locals {
  common_secrets = {
    "database-url"        = { description = "Prisma Accelerate connection URL" }
    "database-direct-url" = { description = "Direct PostgreSQL URL for migrations" }
    "redis-url"           = { description = "Redis connection string" }
    "sentry-dsn"          = { description = "Sentry error tracking DSN" }
  }
  
  web_secrets = {
    "nextauth-secret" = { description = "NextAuth.js session signing secret" }
    "api-internal-url" = { description = "Internal API service URL" }
  }
  
  api_secrets = {
    "jwt-secret"          = { description = "JWT signing secret" }
    "encryption-key"      = { description = "Data encryption key (AES-256)" }
    "webhook-signing-key" = { description = "Webhook signature verification" }
  }
  
  worker_secrets = {
    "sendgrid-api-key"   = { description = "SendGrid API key for emails" }
    "queue-signing-key"  = { description = "Job queue message signing" }
  }
}

# Create secrets with automatic replication
resource "google_secret_manager_secret" "common" {
  for_each  = local.common_secrets
  secret_id = "hta-common-${each.key}"
  
  labels = {
    service = "common"
    env     = var.environment
  }
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "web" {
  for_each  = local.web_secrets
  secret_id = "hta-web-${each.key}"
  
  labels = {
    service = "web"
    env     = var.environment
  }
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "api" {
  for_each  = local.api_secrets
  secret_id = "hta-api-${each.key}"
  
  labels = {
    service = "api"
    env     = var.environment
  }
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "worker" {
  for_each  = local.worker_secrets
  secret_id = "hta-worker-${each.key}"
  
  labels = {
    service = "worker"
    env     = var.environment
  }
  
  replication {
    auto {}
  }
}
```

### 17.3 Per-Service IAM Bindings

```hcl
# terraform/modules/secrets/iam.tf

# Service accounts for each service
resource "google_service_account" "services" {
  for_each     = toset(["web", "api", "worker"])
  account_id   = "hta-${each.key}-${var.environment}"
  display_name = "HTA ${title(each.key)} Service Account"
}

# Common secrets access - all services
resource "google_secret_manager_secret_iam_member" "common_access" {
  for_each  = google_secret_manager_secret.common
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.services["web"].email}"
}

resource "google_secret_manager_secret_iam_member" "common_access_api" {
  for_each  = google_secret_manager_secret.common
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.services["api"].email}"
}

resource "google_secret_manager_secret_iam_member" "common_access_worker" {
  for_each  = google_secret_manager_secret.common
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.services["worker"].email}"
}

# Service-specific secrets - only that service
resource "google_secret_manager_secret_iam_member" "web_access" {
  for_each  = google_secret_manager_secret.web
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.services["web"].email}"
}

resource "google_secret_manager_secret_iam_member" "api_access" {
  for_each  = google_secret_manager_secret.api
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.services["api"].email}"
}

resource "google_secret_manager_secret_iam_member" "worker_access" {
  for_each  = google_secret_manager_secret.worker
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.services["worker"].email}"
}
```

### 17.4 Cloud Run Secret Mounting

```hcl
# terraform/modules/services/main.tf

resource "google_cloud_run_v2_service" "api" {
  name     = "hta-api-${var.environment}"
  location = var.region

  template {
    service_account = google_service_account.services["api"].email
    
    containers {
      image = var.api_image
      
      # Common secrets
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = "hta-common-database-url"
            version = "latest"
          }
        }
      }
      
      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = "hta-common-redis-url"
            version = "latest"
          }
        }
      }
      
      # API-specific secrets
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = "hta-api-jwt-secret"
            version = "latest"
          }
        }
      }
      
      env {
        name = "ENCRYPTION_KEY"
        value_source {
          secret_key_ref {
            secret  = "hta-api-encryption-key"
            version = "latest"
          }
        }
      }
    }
  }
}
```

### 17.5 Secret Rotation

```typescript
// packages/shared/src/secrets/rotation.ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

const client = new SecretManagerServiceClient()

export async function rotateSecret(
  projectId: string,
  secretId: string,
  generateNewValue: () => Promise<string>
): Promise<void> {
  const secretName = `projects/${projectId}/secrets/${secretId}`
  
  // Generate new secret value
  const newValue = await generateNewValue()
  
  // Add new version
  await client.addSecretVersion({
    parent: secretName,
    payload: {
      data: Buffer.from(newValue, 'utf8'),
    },
  })
  
  // Get all versions
  const [versions] = await client.listSecretVersions({ parent: secretName })
  
  // Disable old versions (keep last 2)
  const enabledVersions = versions
    .filter((v) => v.state === 'ENABLED')
    .sort((a, b) => {
      const aTime = Number(a.createTime?.seconds) || 0
      const bTime = Number(b.createTime?.seconds) || 0
      return bTime - aTime
    })
  
  for (const version of enabledVersions.slice(2)) {
    await client.disableSecretVersion({ name: version.name })
  }
}

// Example: Rotate JWT secret monthly
export async function rotateJwtSecret(projectId: string) {
  await rotateSecret(projectId, 'hta-api-jwt-secret', async () => {
    const crypto = await import('crypto')
    return crypto.randomBytes(64).toString('base64')
  })
}
```

### 17.6 Local Development Secrets

```bash
# scripts/setup-local-secrets.sh
#!/bin/bash

# Create .env.local from Secret Manager (for local dev)
gcloud secrets versions access latest --secret="hta-common-database-url" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "# Auto-generated from Secret Manager" > .env.local
  
  echo "DATABASE_URL=$(gcloud secrets versions access latest --secret='hta-common-database-url')" >> .env.local
  echo "REDIS_URL=$(gcloud secrets versions access latest --secret='hta-common-redis-url')" >> .env.local
  echo "NEXTAUTH_SECRET=$(gcloud secrets versions access latest --secret='hta-web-nextauth-secret')" >> .env.local
  
  echo "✅ .env.local created from Secret Manager"
else
  echo "⚠️  Not authenticated to GCP, using default local values"
  cp .env.example .env.local
fi
```

---

## 21. Performance Management

### 18.1 Performance Baselines

Establish baselines before and after separation:

| Metric | Current (Monolith) | Target (Separated) | Critical Threshold |
|--------|-------------------|-------------------|-------------------|
| API p50 latency | 80ms | 70ms | 150ms |
| API p95 latency | 150ms | 120ms | 300ms |
| API p99 latency | 300ms | 200ms | 500ms |
| Frontend TTFB | 200ms | 150ms | 400ms |
| Frontend LCP | 2.0s | 1.8s | 2.5s |
| Frontend FID | 50ms | 40ms | 100ms |
| Database query p95 | 50ms | 40ms | 100ms |
| Worker job p95 | 2s | 1.5s | 5s |
| Error rate | 0.1% | 0.1% | 1% |

### 18.2 Load Testing Configuration

```typescript
// tests/load/scenarios/api-baseline.ts
import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

// Custom metrics
const certificateListDuration = new Trend('certificate_list_duration')
const certificateCreateDuration = new Trend('certificate_create_duration')
const errorRate = new Rate('errors')

export const options = {
  scenarios: {
    // Normal load
    normal_load: {
      executor: 'constant-arrival-rate',
      rate: 50,           // 50 requests per second
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
    // Spike test
    spike_test: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      stages: [
        { duration: '2m', target: 50 },   // Normal
        { duration: '30s', target: 200 }, // Spike
        { duration: '2m', target: 200 },  // Sustained spike
        { duration: '30s', target: 50 },  // Recovery
        { duration: '2m', target: 50 },   // Normal
      ],
      preAllocatedVUs: 100,
      maxVUs: 300,
    },
    // Soak test (run separately)
    soak_test: {
      executor: 'constant-arrival-rate',
      rate: 30,
      duration: '1h',
      preAllocatedVUs: 15,
      maxVUs: 30,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    certificate_list_duration: ['p(95)<150'],
    certificate_create_duration: ['p(95)<300'],
    errors: ['rate<0.01'],
  },
}

export default function () {
  const BASE_URL = __ENV.API_URL || 'http://localhost:8080'
  const TOKEN = __ENV.AUTH_TOKEN
  
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  }

  group('Certificate API', () => {
    // List certificates
    group('GET /api/certificates', () => {
      const start = Date.now()
      const res = http.get(`${BASE_URL}/api/certificates`, { headers })
      certificateListDuration.add(Date.now() - start)
      
      const success = check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 200ms': (r) => r.timings.duration < 200,
        'returns array': (r) => Array.isArray(JSON.parse(r.body)),
      })
      
      if (!success) errorRate.add(1)
    })

    sleep(1)

    // Create certificate (10% of requests)
    if (Math.random() < 0.1) {
      group('POST /api/certificates', () => {
        const payload = JSON.stringify({
          customerName: `Load Test Customer ${Date.now()}`,
          equipmentType: 'PRESSURE_GAUGE',
          serialNumber: `LT-${Date.now()}`,
        })
        
        const start = Date.now()
        const res = http.post(`${BASE_URL}/api/certificates`, payload, { headers })
        certificateCreateDuration.add(Date.now() - start)
        
        const success = check(res, {
          'status is 201': (r) => r.status === 201,
          'response time < 500ms': (r) => r.timings.duration < 500,
        })
        
        if (!success) errorRate.add(1)
      })
    }
  })

  sleep(Math.random() * 2 + 1) // Random 1-3s between iterations
}
```

### 18.3 Performance Testing Workflow

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Nightly at 2 AM
  workflow_dispatch:
    inputs:
      scenario:
        description: 'Test scenario'
        required: true
        default: 'normal_load'
        type: choice
        options:
          - normal_load
          - spike_test
          - soak_test

env:
  API_URL: https://api-staging.htacalibration.com

jobs:
  load-test:
    name: Load Test - ${{ github.event.inputs.scenario || 'normal_load' }}
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Get auth token
        id: auth
        run: |
          TOKEN=$(curl -s -X POST ${{ env.API_URL }}/api/auth/token \
            -H "Content-Type: application/json" \
            -d '{"email":"loadtest@example.com","password":"${{ secrets.LOADTEST_PASSWORD }}"}' \
            | jq -r '.token')
          echo "token=$TOKEN" >> $GITHUB_OUTPUT

      - name: Run load test
        run: |
          k6 run tests/load/scenarios/api-baseline.ts \
            --out json=results.json \
            --scenario ${{ github.event.inputs.scenario || 'normal_load' }}
        env:
          API_URL: ${{ env.API_URL }}
          AUTH_TOKEN: ${{ steps.auth.outputs.token }}

      - name: Process results
        run: |
          # Check if thresholds passed
          PASSED=$(jq '.metrics.http_req_duration.thresholds | all' results.json)
          echo "Thresholds passed: $PASSED"
          
          # Summary
          echo "## Load Test Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Metric | p50 | p95 | p99 |" >> $GITHUB_STEP_SUMMARY
          echo "|--------|-----|-----|-----|" >> $GITHUB_STEP_SUMMARY
          
          P50=$(jq '.metrics.http_req_duration.values["p(50)"]' results.json)
          P95=$(jq '.metrics.http_req_duration.values["p(95)"]' results.json)
          P99=$(jq '.metrics.http_req_duration.values["p(99)"]' results.json)
          
          echo "| Latency | ${P50}ms | ${P95}ms | ${P99}ms |" >> $GITHUB_STEP_SUMMARY

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: results.json
          retention-days: 30

      - name: Alert on regression
        if: failure()
        run: |
          curl -X POST "${{ secrets.SLACK_WEBHOOK }}" \
            -H "Content-Type: application/json" \
            -d '{"text":"⚠️ Load test failed - performance regression detected"}'
```

### 18.4 Caching Strategy

```typescript
// packages/shared/src/cache/strategy.ts

export const CacheStrategies = {
  // Frequently accessed, rarely changing data
  STATIC_REFERENCE: {
    ttl: 3600,        // 1 hour
    swr: 86400,       // Serve stale for 24h while revalidating
    tags: ['static'],
  },
  
  // User-specific data that changes moderately
  USER_DATA: {
    ttl: 300,         // 5 minutes
    swr: 600,         // Serve stale for 10m
    // Tags set dynamically: [`user:${userId}`]
  },
  
  // Frequently changing data
  DYNAMIC: {
    ttl: 60,          // 1 minute
    swr: 120,
  },
  
  // Real-time data (no cache)
  NONE: {
    ttl: 0,
    swr: 0,
  },
}

// Prisma Accelerate cache usage
export async function getCertificatesWithCache(userId: string) {
  return prisma.certificate.findMany({
    where: { userId },
    cacheStrategy: {
      ...CacheStrategies.USER_DATA,
      tags: [`user:${userId}`, 'certificates'],
    },
  })
}

// Invalidate on mutation
export async function createCertificate(data: CertificateInput, userId: string) {
  const certificate = await prisma.certificate.create({ data })
  
  // Invalidate user's certificate cache
  await prisma.$accelerate.invalidate({
    tags: [`user:${userId}`, 'certificates'],
  })
  
  return certificate
}
```

### 18.5 Database Query Optimization

```typescript
// packages/database/src/optimizations.ts

// Batch loading to avoid N+1
export async function getCertificatesWithRelations(certificateIds: string[]) {
  // Single query with includes instead of N+1
  return prisma.certificate.findMany({
    where: { id: { in: certificateIds } },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      engineer: { select: { id: true, name: true } },
      readings: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  })
}

// Cursor-based pagination for large datasets
export async function getCertificatesPaginated(
  cursor?: string,
  limit: number = 20
) {
  return prisma.certificate.findMany({
    take: limit + 1, // Fetch one extra to check if there's more
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      certificateNumber: true,
      status: true,
      customerName: true,
      createdAt: true,
    },
  })
}

// Materialized view for dashboard stats
export async function getDashboardStats() {
  // Uses database-level caching via Prisma Accelerate
  return prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE status = 'DRAFT') as draft_count,
      COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW') as pending_count,
      COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_count,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as weekly_count
    FROM certificates
  `
}
```

### 18.6 Frontend Performance

```typescript
// apps/web/next.config.ts - Performance optimizations

const nextConfig = {
  // Enable SWC minification
  swcMinify: true,
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96],
  },
  
  // Optimize fonts
  optimizeFonts: true,
  
  // Enable React strict mode
  reactStrictMode: true,
  
  // Bundle analyzer (dev only)
  ...(process.env.ANALYZE && {
    webpack: (config) => {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: '../bundle-report.html',
        })
      )
      return config
    },
  }),
  
  // Modular imports for large libraries
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{ kebabCase member }}',
    },
  },
}
```

---

## 22. Compliance Management

### 19.1 GDPR Data Flow Across Services

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Web      │     │    API      │     │   Worker    │
│  (Frontend) │────▶│  (Backend)  │────▶│  (Jobs)     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   ▼                   │
       │            ┌─────────────┐            │
       │            │  Database   │◀───────────┘
       │            │ (PostgreSQL)│
       │            └─────────────┘
       │                   │
       ▼                   ▼
┌─────────────────────────────────────────────────────┐
│                   Audit Log                         │
│  (All PII access logged with user context)          │
└─────────────────────────────────────────────────────┘
```

### 19.2 Data Processing Inventory

```typescript
// packages/shared/src/compliance/data-inventory.ts

export const DataProcessingInventory = {
  'customer-registration': {
    purpose: 'Account creation and service delivery',
    legalBasis: 'Contract performance',
    dataCategories: ['email', 'name', 'company', 'phone'],
    retention: '7 years after last activity',
    thirdParties: ['SendGrid (email delivery)'],
    services: ['web', 'api'],
  },
  'certificate-processing': {
    purpose: 'Calibration certificate management',
    legalBasis: 'Contract performance',
    dataCategories: ['equipment details', 'readings', 'signatures'],
    retention: '10 years (regulatory requirement)',
    thirdParties: [],
    services: ['api', 'worker'],
  },
  'analytics': {
    purpose: 'Service improvement',
    legalBasis: 'Legitimate interest',
    dataCategories: ['usage patterns', 'aggregated statistics'],
    retention: '2 years',
    thirdParties: ['Google Analytics (anonymized)'],
    services: ['web'],
  },
  'email-notifications': {
    purpose: 'Service communications',
    legalBasis: 'Contract performance / Consent',
    dataCategories: ['email', 'name', 'notification preferences'],
    retention: 'Until unsubscribe + 30 days',
    thirdParties: ['SendGrid'],
    services: ['worker'],
  },
}
```

### 19.3 Cross-Service Audit Logging

```typescript
// packages/shared/src/compliance/audit-logger.ts
import { prisma } from '@hta/database'
import { createLogger } from '../logger'

const logger = createLogger('audit')

export interface AuditEvent {
  action: string
  resourceType: string
  resourceId: string
  userId?: string
  userEmail?: string
  userRole?: string
  service: 'web' | 'api' | 'worker'
  ipAddress?: string
  userAgent?: string
  details?: Record<string, unknown>
  piiAccessed?: string[]
  piiModified?: string[]
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  // Log to structured logging (Cloud Logging)
  logger.info({
    audit: true,
    ...event,
    timestamp: new Date().toISOString(),
  })

  // Log to database for compliance queries
  await prisma.auditLog.create({
    data: {
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      userId: event.userId,
      userEmail: event.userEmail,
      userRole: event.userRole,
      service: event.service,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      details: event.details ? JSON.stringify(event.details) : null,
      piiAccessed: event.piiAccessed || [],
      piiModified: event.piiModified || [],
      createdAt: new Date(),
    },
  })
}

// Middleware for automatic audit logging
export function withAuditLogging(
  handler: (req: Request) => Promise<Response>,
  config: {
    action: string
    resourceType: string
    getResourceId: (req: Request, res: Response) => string
    piiFields?: string[]
  }
) {
  return async (req: Request): Promise<Response> => {
    const startTime = Date.now()
    const response = await handler(req)
    
    await logAuditEvent({
      action: config.action,
      resourceType: config.resourceType,
      resourceId: config.getResourceId(req, response),
      userId: (req as any).user?.id,
      userEmail: (req as any).user?.email,
      userRole: (req as any).user?.role,
      service: 'api',
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
      details: {
        method: req.method,
        path: new URL(req.url).pathname,
        duration: Date.now() - startTime,
        status: response.status,
      },
      piiAccessed: config.piiFields,
    })
    
    return response
  }
}
```

### 19.4 Data Subject Rights Implementation

```typescript
// packages/shared/src/compliance/dsr.ts
import { prisma } from '@hta/database'
import { logAuditEvent } from './audit-logger'
import { createLogger } from '../logger'

const logger = createLogger('dsr')

export interface DataExportResult {
  user: {
    id: string
    email: string
    name: string
    createdAt: Date
  }
  certificates: any[]
  auditLogs: any[]
  consents: any[]
  exportedAt: Date
  format: 'json'
}

// Right to Access (Data Export)
export async function exportUserData(
  userId: string,
  requestedBy: string
): Promise<DataExportResult> {
  logger.info({ userId, requestedBy }, 'Starting data export')
  
  const [user, certificates, auditLogs, consents] = await Promise.all([
    prisma.customerUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.certificate.findMany({
      where: { customerId: userId },
      include: {
        readings: true,
        events: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.consent.findMany({
      where: { userId },
    }),
  ])

  await logAuditEvent({
    action: 'DATA_EXPORT',
    resourceType: 'USER',
    resourceId: userId,
    userId: requestedBy,
    service: 'api',
    piiAccessed: ['email', 'name', 'company', 'phone', 'certificates', 'audit_logs'],
  })

  return {
    user: user!,
    certificates,
    auditLogs,
    consents,
    exportedAt: new Date(),
    format: 'json',
  }
}

// Right to Erasure (Account Deletion)
export async function deleteUserData(
  userId: string,
  requestedBy: string,
  options: { immediate?: boolean } = {}
): Promise<{ success: boolean; retainedData?: string[] }> {
  logger.info({ userId, requestedBy, options }, 'Starting data deletion')
  
  // Check for regulatory holds
  const hasRegulatoryHold = await prisma.certificate.count({
    where: {
      customerId: userId,
      status: 'APPROVED',
      createdAt: {
        gte: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000), // 10 years
      },
    },
  })

  if (hasRegulatoryHold > 0 && !options.immediate) {
    // Pseudonymize instead of delete for regulatory compliance
    await prisma.customerUser.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@anonymized.local`,
        name: 'Deleted User',
        company: null,
        phone: null,
        passwordHash: '', // Prevent login
        deletedAt: new Date(),
      },
    })

    await logAuditEvent({
      action: 'DATA_PSEUDONYMIZE',
      resourceType: 'USER',
      resourceId: userId,
      userId: requestedBy,
      service: 'api',
      piiModified: ['email', 'name', 'company', 'phone'],
      details: { reason: 'Regulatory retention requirement' },
    })

    return {
      success: true,
      retainedData: ['Certificates (regulatory requirement - 10 years)'],
    }
  }

  // Full deletion
  await prisma.$transaction([
    prisma.consent.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.auditLog.deleteMany({ where: { userId } }),
    prisma.certificate.deleteMany({ where: { customerId: userId } }),
    prisma.customerUser.delete({ where: { id: userId } }),
  ])

  await logAuditEvent({
    action: 'DATA_DELETE',
    resourceType: 'USER',
    resourceId: userId,
    userId: requestedBy,
    service: 'api',
    piiModified: ['ALL'],
  })

  return { success: true }
}

// Right to Rectification
export async function updateUserData(
  userId: string,
  updates: Partial<{ email: string; name: string; company: string; phone: string }>,
  requestedBy: string
): Promise<void> {
  const oldData = await prisma.customerUser.findUnique({
    where: { id: userId },
    select: { email: true, name: true, company: true, phone: true },
  })

  await prisma.customerUser.update({
    where: { id: userId },
    data: updates,
  })

  await logAuditEvent({
    action: 'DATA_RECTIFY',
    resourceType: 'USER',
    resourceId: userId,
    userId: requestedBy,
    service: 'api',
    piiModified: Object.keys(updates),
    details: {
      changes: Object.entries(updates).map(([field]) => ({
        field,
        oldValue: '[REDACTED]',
        newValue: '[REDACTED]',
      })),
    },
  })
}
```

### 19.5 Consent Management

```typescript
// packages/shared/src/compliance/consent.ts
import { prisma } from '@hta/database'

export type ConsentType = 
  | 'marketing_email'
  | 'analytics'
  | 'third_party_sharing'
  | 'data_processing'

export interface ConsentRecord {
  userId: string
  type: ConsentType
  granted: boolean
  grantedAt?: Date
  revokedAt?: Date
  version: string
  ipAddress?: string
}

export async function recordConsent(consent: ConsentRecord): Promise<void> {
  await prisma.consent.upsert({
    where: {
      userId_type: {
        userId: consent.userId,
        type: consent.type,
      },
    },
    update: {
      granted: consent.granted,
      ...(consent.granted
        ? { grantedAt: new Date(), revokedAt: null }
        : { revokedAt: new Date() }),
      version: consent.version,
      ipAddress: consent.ipAddress,
    },
    create: {
      userId: consent.userId,
      type: consent.type,
      granted: consent.granted,
      grantedAt: consent.granted ? new Date() : null,
      version: consent.version,
      ipAddress: consent.ipAddress,
    },
  })
}

export async function checkConsent(
  userId: string,
  type: ConsentType
): Promise<boolean> {
  const consent = await prisma.consent.findUnique({
    where: {
      userId_type: {
        userId,
        type,
      },
    },
  })
  
  return consent?.granted ?? false
}

export async function getUserConsents(userId: string): Promise<ConsentRecord[]> {
  return prisma.consent.findMany({
    where: { userId },
  })
}
```

### 19.6 Compliance Testing

```typescript
// tests/compliance/gdpr.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@hta/database'
import { exportUserData, deleteUserData } from '@hta/shared/compliance/dsr'
import { recordConsent, checkConsent } from '@hta/shared/compliance/consent'

describe('GDPR Compliance', () => {
  let testUserId: string

  beforeAll(async () => {
    // Create test user
    const user = await prisma.customerUser.create({
      data: {
        email: 'gdpr-test@example.com',
        name: 'GDPR Test User',
        passwordHash: 'test',
      },
    })
    testUserId = user.id
  })

  afterAll(async () => {
    await prisma.customerUser.deleteMany({
      where: { email: { contains: 'gdpr-test' } },
    })
  })

  describe('Right to Access', () => {
    it('should export all user data', async () => {
      const data = await exportUserData(testUserId, 'admin')
      
      expect(data.user).toBeDefined()
      expect(data.user.email).toBe('gdpr-test@example.com')
      expect(data.certificates).toBeInstanceOf(Array)
      expect(data.auditLogs).toBeInstanceOf(Array)
      expect(data.exportedAt).toBeInstanceOf(Date)
    })

    it('should create audit log for data export', async () => {
      await exportUserData(testUserId, 'admin')
      
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          resourceId: testUserId,
          action: 'DATA_EXPORT',
        },
        orderBy: { createdAt: 'desc' },
      })
      
      expect(auditLog).toBeDefined()
      expect(auditLog?.piiAccessed).toContain('email')
    })
  })

  describe('Right to Erasure', () => {
    it('should pseudonymize user with regulatory hold', async () => {
      // Create approved certificate (regulatory hold)
      await prisma.certificate.create({
        data: {
          customerId: testUserId,
          status: 'APPROVED',
          certificateNumber: 'TEST-001',
        },
      })

      const result = await deleteUserData(testUserId, 'admin')
      
      expect(result.success).toBe(true)
      expect(result.retainedData).toContain('Certificates (regulatory requirement - 10 years)')
      
      const user = await prisma.customerUser.findUnique({
        where: { id: testUserId },
      })
      
      expect(user?.email).toContain('anonymized')
      expect(user?.name).toBe('Deleted User')
    })
  })

  describe('Consent Management', () => {
    it('should record and verify consent', async () => {
      await recordConsent({
        userId: testUserId,
        type: 'marketing_email',
        granted: true,
        version: '1.0',
      })

      const hasConsent = await checkConsent(testUserId, 'marketing_email')
      expect(hasConsent).toBe(true)
    })

    it('should respect revoked consent', async () => {
      await recordConsent({
        userId: testUserId,
        type: 'analytics',
        granted: false,
        version: '1.0',
      })

      const hasConsent = await checkConsent(testUserId, 'analytics')
      expect(hasConsent).toBe(false)
    })
  })
})
```

### 19.7 Compliance Checklist

| Requirement | Implementation | Service | Status |
|-------------|----------------|---------|--------|
| **Lawful Basis** | Consent + Contract documented | All | ✅ |
| **Data Inventory** | `data-inventory.ts` | All | ✅ |
| **Right to Access** | `exportUserData()` | API | ✅ |
| **Right to Erasure** | `deleteUserData()` | API | ✅ |
| **Right to Rectification** | `updateUserData()` | API | ✅ |
| **Data Portability** | JSON export format | API | ✅ |
| **Consent Management** | `consent.ts` module | API/Web | ✅ |
| **Audit Logging** | `audit-logger.ts` | All | ✅ |
| **Data Minimization** | Select clauses in queries | API | ✅ |
| **Encryption at Rest** | Cloud SQL encryption | Database | ✅ |
| **Encryption in Transit** | TLS everywhere | All | ✅ |
| **Breach Notification** | Alert policies | Monitoring | ✅ |
| **DPA with Processors** | SendGrid, GCP | Legal | ✅ |

---

---

## 23. Rollback Plan

### Immediate Rollback (< 5 minutes)

1. Revert load balancer to route all traffic to monolith
2. No code changes needed

```bash
# Option 1: Revert Gateway API traffic to stable
kubectl patch httproute hta-api-canary -n hta-platform --type=merge -p '
spec:
  rules:
    - backendRefs:
        - name: hta-api-canary
          weight: 0
        - name: hta-api
          weight: 100
'

# Option 2: Rollback GKE deployment to previous revision
kubectl rollout undo deployment/hta-api -n hta-platform

# Option 3: Scale down canary completely
kubectl scale deployment hta-api-canary --replicas=0 -n hta-platform
```

### Full Rollback (< 30 minutes)

1. Redeploy monolith with original code
2. Revert database migrations (if any)
3. Update DNS/routing

```bash
# Redeploy monolith
gcloud run deploy hta-calibration \
  --image gcr.io/hta-calibration/monolith:last-known-good

# Revert migrations if needed
pnpm db:migrate:rollback
```

### Data Consistency

- All services share same database
- No data migration needed for separation
- Rollback is safe - no data loss

### Rollback Triggers

Initiate rollback if:
- Error rate > 5% for 5 minutes
- Latency p95 > 500ms for 10 minutes
- Any critical functionality broken
- Data integrity issues detected

---

## 24. Post-Migration Checklist

### Operational

- [ ] All pods healthy in GKE (`kubectl get pods -n hta-platform`)
- [ ] Health checks passing for web, api, worker
- [ ] Logs flowing to Cloud Logging with correct labels
- [ ] Metrics appearing in dashboards
- [ ] Alerts configured and tested for each service
- [ ] Service accounts have correct permissions

### Performance

- [ ] API latency within SLO (p95 < 200ms)
- [ ] Frontend load time unchanged (LCP < 2.5s)
- [ ] Database connections stable (< 50% pool utilization)
- [ ] No memory leaks (stable memory over 24h)
- [ ] Worker queue processing within SLO

### CI/CD

- [ ] All workflows updated for monorepo
- [ ] Change detection working correctly
- [ ] Build times acceptable (< 10 min)
- [ ] Deployment pipelines tested
- [ ] Rollback procedures tested

### Testing

- [ ] Unit tests passing for all packages
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Load tests show acceptable performance
- [ ] Contract tests passing

### Documentation

- [ ] Architecture diagrams updated
- [ ] Runbooks updated for multi-service
- [ ] README files added to each app/package
- [ ] Deployment guide updated
- [ ] On-call guide updated

### Cleanup

- [ ] Old API routes removed from frontend
- [ ] Unused dependencies removed
- [ ] Old Docker images cleaned up
- [ ] Old CI workflows removed
- [ ] Monolith service decommissioned (after 2 weeks)

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-13 | Initial plan |
| 1.1 | 2026-04-13 | Added Docker, GitHub Actions, expanded Testing sections |
| 1.2 | 2026-04-13 | Added Monitoring, Secrets, Performance, Compliance sections |
| 1.3 | 2026-04-13 | Added existing feature migration inventory (Phases 1-4), expanded shared packages migration, notification processing in Worker |
| 1.4 | 2026-04-13 | Replaced OpenTelemetry with Sentry for monitoring (already configured) |
| 1.5 | 2026-04-13 | Added new repo migration approach, Security Enhancements (Track C: 2FA, WebAuthn, CSP nonces, Cloud Armor WAF), Disaster Recovery (Track E: backup/restore, DR drills, cross-region replica) |
