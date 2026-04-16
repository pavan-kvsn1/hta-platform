# HTA Platform - Architecture & Design Decisions

**Purpose:** Technical deep-dive for architecture discussions and interviews
**Last Updated:** 2026-04-16

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture Decisions](#3-architecture-decisions)
4. [Technology Choices](#4-technology-choices)
5. [Data Architecture](#5-data-architecture)
6. [Security Architecture](#6-security-architecture)
7. [Infrastructure & Deployment](#7-infrastructure--deployment)
8. [Cost Optimization](#8-cost-optimization)
9. [Trade-offs & Alternatives Considered](#9-trade-offs--alternatives-considered)
10. [Scaling Strategy](#10-scaling-strategy)
11. [Interview Q&A Guide](#11-interview-qa-guide)

---

## 1. Executive Summary

### What is HTA Platform?

A B2B2C SaaS platform for calibration certificate management, serving:
- **Tenants:** Calibration laboratories (NABL/ISO 17025 accredited)
- **Tenant Users:** Engineers, reviewers, admins who create/approve certificates
- **Customers:** Lab clients who track their calibration certificates

### Key Numbers

| Metric | Scale |
|--------|-------|
| Users per tenant | ~100 |
| Certificates/month | ~5,000 |
| Images per certificate | ~5 (30MB total) |
| Concurrent users | ~15 peak |
| Target infrastructure cost | <₹12,500/month (~$150) |

### Architecture Style

**Modular Monolith evolving to Microservices**

```
Current: Monorepo with service separation
├── Web (Next.js) ─────────┐
├── API (Fastify) ─────────┼──▶ Shared Database
└── Worker (BullMQ) ───────┘
```

---

## 2. System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              HTA Platform Architecture                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│    ┌──────────────┐                                                             │
│    │   Browser    │                                                             │
│    │   (React)    │                                                             │
│    └──────┬───────┘                                                             │
│           │ HTTPS                                                               │
│           ▼                                                                     │
│    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐          │
│    │     Web      │  HTTP   │     API      │  Queue  │    Worker    │          │
│    │  (Next.js)   │────────▶│  (Fastify)   │────────▶│  (BullMQ)    │          │
│    │   Port 3000  │  Proxy  │   Port 4000  │         │              │          │
│    └──────────────┘         └──────┬───────┘         └──────┬───────┘          │
│           │                        │                        │                   │
│           │                        │                        │                   │
│           └────────────────────────┼────────────────────────┘                   │
│                                    │                                            │
│                    ┌───────────────┼───────────────┐                            │
│                    ▼               ▼               ▼                            │
│             ┌──────────┐    ┌──────────┐    ┌──────────┐                        │
│             │PostgreSQL│    │  Redis   │    │   GCS    │                        │
│             │(Cloud SQL)│    │(Memory-  │    │ (Images) │                        │
│             │          │    │  store)  │    │          │                        │
│             └──────────┘    └──────────┘    └──────────┘                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

```
1. User opens app
   Browser ──▶ Web (Next.js SSR) ──▶ Renders HTML

2. User creates certificate
   Browser ──▶ Web ──▶ API (Fastify) ──▶ PostgreSQL
                                      ──▶ Return response

3. User uploads image
   Browser ──▶ API ──▶ GCS (store original)
                   ──▶ Redis (queue processing job)
                   ──▶ Worker (create thumbnails)
                   ──▶ GCS (store variants)

4. Certificate approved, send email
   API ──▶ Redis (queue email job)
       ──▶ Worker (process job)
       ──▶ Resend API (send email)
```

---

## 3. Architecture Decisions

### ADR-001: Monorepo over Polyrepo

**Decision:** Use Turborepo monorepo with pnpm workspaces

**Context:**
- Small team (1-3 developers)
- Shared code between services (types, utilities, database)
- Need atomic commits across service boundaries

**Rationale:**
| Factor | Monorepo | Polyrepo |
|--------|----------|----------|
| Code sharing | ✅ Easy via packages | ❌ NPM publishing overhead |
| Atomic changes | ✅ Single commit | ❌ Coordinated releases |
| CI complexity | Medium | High (multi-repo triggers) |
| Team size fit | ✅ Small teams | Large teams |

**Trade-off:** Monorepo CI can be slower, mitigated by Turborepo's caching.

---

### ADR-002: Service Separation (Web/API/Worker)

**Decision:** Separate Next.js frontend, Fastify API, and BullMQ worker

**Context:**
- Started as Next.js monolith with API routes
- Needed independent scaling for API vs frontend
- Background jobs were blocking request handling

**Rationale:**
```
Before (Monolith):
┌─────────────────────────┐
│       Next.js           │
│  ┌─────────────────┐    │
│  │  Pages (SSR)    │    │  Problem: API routes and
│  │  API Routes     │    │  background jobs compete
│  │  Background Jobs│    │  for same resources
│  └─────────────────┘    │
└─────────────────────────┘

After (Separated):
┌─────────┐ ┌─────────┐ ┌─────────┐
│   Web   │ │   API   │ │ Worker  │
│  (SSR)  │ │ (REST)  │ │ (Jobs)  │
└─────────┘ └─────────┘ └─────────┘
     │           │           │
     └───────────┴───────────┘
              Shared DB

Benefits:
- Scale API independently (handle more requests)
- Worker doesn't block API responses
- Deploy API without redeploying frontend
```

**Trade-off:** More operational complexity, but manageable with Kubernetes.

---

### ADR-003: Fastify over Express for API

**Decision:** Use Fastify instead of Express.js

**Context:**
- Building new API service, choosing framework
- Need high performance, TypeScript support, validation

**Rationale:**
| Factor | Fastify | Express |
|--------|---------|---------|
| Performance | ~30K req/s | ~10K req/s |
| TypeScript | First-class | Bolt-on |
| Validation | Built-in (JSON Schema) | Middleware (Joi/Zod) |
| Ecosystem | Growing | Mature |
| Learning curve | Medium | Low |

**Benchmark (same hardware):**
```
Express: 10,847 req/sec
Fastify: 30,891 req/sec (2.8x faster)
```

**Trade-off:** Smaller ecosystem than Express, but sufficient for our needs.

---

### ADR-004: PostgreSQL over MongoDB

**Decision:** Use PostgreSQL with Prisma ORM

**Context:**
- Certificate data is highly relational (certificates → parameters → results)
- Need strong consistency for compliance (ISO 17025)
- Multi-tenant with tenant isolation

**Rationale:**
| Factor | PostgreSQL | MongoDB |
|--------|------------|---------|
| Data model | Relational (fits our domain) | Document (flexible) |
| ACID compliance | ✅ Full | Partial |
| Multi-tenancy | Row-level security | Database per tenant |
| Audit requirements | ✅ Strong consistency | Eventually consistent |
| Prisma support | ✅ Excellent | Good |

**Trade-off:** Less flexible schema, but our domain is well-defined.

---

### ADR-005: Redis + BullMQ for Job Queue

**Decision:** Use Redis with BullMQ for background jobs

**Context:**
- Need reliable job processing (emails, notifications, image processing)
- Jobs must survive service restarts
- Need job retry, scheduling, and monitoring

**Alternatives Considered:**
| Option | Pros | Cons | Cost |
|--------|------|------|------|
| **BullMQ + Redis** | Battle-tested, features | Requires Redis | ~₹2,900/mo |
| Database queue | No extra infra | Polling overhead | ₹0 |
| AWS SQS | Managed, scalable | Vendor lock-in | ~₹500/mo |
| RabbitMQ | Feature-rich | Operational overhead | ~₹3,000/mo |

**Decision:** BullMQ for features (retry, scheduling, rate limiting) + implemented database queue as fallback for simpler deployments.

---

### ADR-006: GCS for Image Storage

**Decision:** Store certificate images in Google Cloud Storage

**Context:**
- ~6MB of images per certificate (original + optimized + thumbnails)
- 5,000 certs/month = 360GB/year growth
- Need signed URLs for secure access

**Rationale:**
| Factor | GCS | Database BLOBs | Local filesystem |
|--------|-----|----------------|------------------|
| Scalability | ✅ Unlimited | ❌ DB bloat | ❌ Disk limits |
| Cost | $0.02/GB | DB storage cost | Server disk cost |
| CDN integration | ✅ Easy | ❌ Complex | ❌ Complex |
| Backup | ✅ Built-in | With DB backup | Manual |

**Image Processing Pipeline:**
```
Upload ──▶ Store Original ──▶ Queue Job ──▶ Worker Process
                                              │
                                              ├──▶ Optimized (2000px, 90% JPEG)
                                              └──▶ Thumbnail (200px, 85% JPEG)
```

---

### ADR-007: Multi-Tenancy with Shared Database

**Decision:** Single database with tenant_id column (shared schema)

**Context:**
- Multiple calibration labs (tenants) on same platform
- Each tenant has their own customers
- Need data isolation without infrastructure duplication

**Approaches Considered:**
| Approach | Isolation | Cost | Complexity |
|----------|-----------|------|------------|
| **Shared schema (tenant_id)** | Row-level | Low | Low |
| Schema per tenant | Schema-level | Medium | Medium |
| Database per tenant | Full | High | High |

**Implementation:**
```typescript
// Every query includes tenant context
const certificates = await prisma.certificate.findMany({
  where: {
    tenantId: currentTenant.id,  // Always filtered
    status: 'APPROVED'
  }
})

// Enforced via Prisma middleware
prisma.$use(async (params, next) => {
  if (params.model && tenantModels.includes(params.model)) {
    params.args.where = {
      ...params.args.where,
      tenantId: getTenantId()
    }
  }
  return next(params)
})
```

**Trade-off:** Less isolation than separate databases, but 90% cost savings.

---

### ADR-008: GKE Standard over Autopilot/Cloud Run

**Decision:** Use GKE Standard with single node for cost optimization

**Context:**
- Need Kubernetes for orchestration learning and future scaling
- Low traffic (~3 requests/minute peak)
- Budget constraint: <₹12,500/month

**Comparison:**
| Option | Monthly Cost | Pros | Cons |
|--------|--------------|------|------|
| Cloud Run | ~₹4,000 | Scales to zero | Cold starts |
| GKE Autopilot | ~₹6,000 | No node mgmt | Higher minimum |
| **GKE Standard** | ~₹10,000 | Full control | Node management |
| EKS (AWS) | ~₹19,000 | AWS ecosystem | $73 control plane |

**Decision:** GKE Standard because:
1. Free control plane (first cluster)
2. Full Kubernetes experience
3. Sustained use discount (~20% auto)
4. Clear scaling path

---

### ADR-009: Single Cluster, Dual Namespace

**Decision:** Run dev and prod in same cluster with namespace isolation

**Context:**
- Need dev and prod environments
- Two clusters would double costs
- Acceptable risk for current scale

**Architecture:**
```
GKE Cluster (hta-platform-cluster)
├── Namespace: hta-dev
│   ├── web-dev
│   ├── api-dev
│   └── worker-dev
└── Namespace: hta-prod
    ├── web-prod
    ├── api-prod
    └── worker-prod

Shared:
├── Cloud SQL (separate databases: hta_dev, hta_prod)
├── Redis (key prefix isolation: dev:*, prod:*)
└── Load Balancer (host-based routing)
```

**Trade-off:** Noisy neighbor risk, but acceptable at this scale. Will separate at 10x growth.

---

## 4. Technology Choices

### Frontend Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 14 | SSR, file-based routing, React ecosystem |
| UI | Tailwind + shadcn/ui | Utility-first, accessible components |
| State | Zustand | Simple, TypeScript-friendly |
| Forms | React Hook Form + Zod | Performance, type-safe validation |
| Data fetching | TanStack Query | Caching, background refetch |

### Backend Stack

| Layer | Choice | Why |
|-------|--------|-----|
| API Framework | Fastify | Performance, TypeScript, validation |
| ORM | Prisma | Type safety, migrations, multi-DB |
| Auth | NextAuth.js + Custom JWT | Session + API token support |
| Validation | Zod | Shared with frontend |
| Job Queue | BullMQ | Redis-based, battle-tested |

### Infrastructure

| Component | Choice | Why |
|-----------|--------|-----|
| Container orchestration | GKE Standard | Free control plane, K8s learning |
| Database | Cloud SQL (PostgreSQL) | Managed, backups, HA option |
| Cache/Queue | Memorystore (Redis) | Managed, VPC-native |
| Object storage | GCS | Cost, integration, lifecycle policies |
| CI/CD | GitHub Actions | Free for public, integrated |
| Monitoring | Sentry | Error tracking, performance |
| Email | Resend | Developer-friendly, good deliverability |

---

## 5. Data Architecture

### Entity Relationship Overview

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Tenant    │──────▶│    User     │       │  Customer   │
│  (Lab)      │       │ (Engineer)  │       │  Account    │
└─────────────┘       └─────────────┘       └──────┬──────┘
      │                     │                      │
      │                     │                      │
      ▼                     ▼                      ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ Certificate │◀──────│  Created By │       │  Customer   │
│             │       │  Reviewed By│       │    User     │
└──────┬──────┘       └─────────────┘       └─────────────┘
       │
       │
       ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  Parameter  │──────▶│   Result    │       │   Image     │
│             │       │  (Reading)  │       │             │
└─────────────┘       └─────────────┘       └─────────────┘
```

### Multi-Tenancy Data Flow

```
Request with tenant context:
┌─────────────────────────────────────────────────────────┐
│  JWT Token: { sub: "user-123", tenantId: "tenant-abc" } │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Middleware extracts tenantId, attaches to request      │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Prisma middleware auto-adds WHERE tenantId = ?         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Query: SELECT * FROM certificates                      │
│         WHERE tenantId = 'tenant-abc' AND status = ... │
└─────────────────────────────────────────────────────────┘
```

### Compliance Data Retention

| Data Type | Retention | Reason |
|-----------|-----------|--------|
| Certificates | 10 years | ISO 17025 requirement |
| Audit logs | 7 years | Compliance |
| Images | 10 years | Evidence |
| User sessions | 30 days | Security |
| Job queue history | 7 days | Debugging |

---

## 6. Security Architecture

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Authentication Flows                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Web App (Session-based):                                       │
│  ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐         │
│  │ Login  │───▶│NextAuth│───▶│  JWT   │───▶│ Cookie │         │
│  │ Form   │    │Verify  │    │ Token  │    │(httpOnly)│        │
│  └────────┘    └────────┘    └────────┘    └────────┘         │
│                                                                 │
│  API (Token-based):                                             │
│  ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐         │
│  │ Login  │───▶│  API   │───▶│ Access │───▶│ Bearer │         │
│  │Endpoint│    │Validate│    │+ Refresh│   │ Header │         │
│  └────────┘    └────────┘    └────────┘    └────────┘         │
│                                                                 │
│  2FA (Optional):                                                │
│  ┌────────┐    ┌────────┐    ┌────────┐                        │
│  │ TOTP   │ or │WebAuthn│───▶│Verified │                       │
│  │ Code   │    │(Passkey)│   │ Session │                       │
│  └────────┘    └────────┘    └────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Authorization Model

```typescript
// Role-based access control
enum Role {
  ADMIN,        // Tenant admin - full access
  ENGINEER,     // Create/edit certificates
  REVIEWER,     // Approve/reject certificates
  CUSTOMER,     // View own company's certificates
}

// Permission matrix
const permissions = {
  'certificate:create': [ADMIN, ENGINEER],
  'certificate:review': [ADMIN, REVIEWER],
  'certificate:view':   [ADMIN, ENGINEER, REVIEWER, CUSTOMER],
  'user:manage':        [ADMIN],
  'settings:edit':      [ADMIN],
}
```

### Security Layers

| Layer | Implementation |
|-------|----------------|
| Transport | TLS 1.3 (managed certificates) |
| WAF | Cloud Armor (OWASP rules) |
| Rate limiting | Per-IP and per-user limits |
| Input validation | Zod schemas on all endpoints |
| SQL injection | Prisma parameterized queries |
| XSS | React auto-escaping, CSP headers |
| CSRF | SameSite cookies, CSRF tokens |
| Secrets | GCP Secret Manager |

---

## 7. Infrastructure & Deployment

### Kubernetes Architecture

```yaml
# Namespace: hta-prod
Deployments:
  - hta-web (1 replica, 512MB)
  - hta-api (1 replica, 512MB)  
  - hta-worker (1 replica, 256MB)

Services:
  - hta-web (ClusterIP)
  - hta-api (ClusterIP)

Gateway:
  - HTTPRoute: app.hta-calibration.com → hta-web
  - HTTPRoute: app.hta-calibration.com/api/* → hta-api
```

### CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                      CI/CD Pipeline                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Push to dev/*:                                                 │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │
│  │  Lint  │─▶│  Test  │─▶│ Build  │─▶│ Deploy │               │
│  │        │  │  Unit  │  │ Docker │  │ to Dev │               │
│  └────────┘  └────────┘  └────────┘  └────────┘               │
│                                                                 │
│  Push to main:                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │  Lint  │─▶│  Test  │─▶│ Build  │─▶│ Deploy │─▶│ Verify │  │
│  │        │  │All+E2E │  │ Docker │  │to Prod │  │ Health │  │
│  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Deployment Strategy

| Strategy | When Used |
|----------|-----------|
| Rolling update | Default for all services |
| Canary (10% → 100%) | Major releases, risky changes |
| Blue-green | Database migrations |
| Rollback | Auto on health check failure |

---

## 8. Cost Optimization

### Infrastructure Cost Breakdown

| Resource | Monthly Cost (INR) |
|----------|-------------------|
| GKE (e2-medium, sustained use) | ₹1,660 |
| Cloud SQL (db-f1-micro, 50GB) | ₹1,410 |
| Memorystore Redis (1GB) | ₹2,900 |
| Load Balancer | ₹1,500 |
| GCS Storage (~400GB) | ₹580 |
| Network (NAT, egress) | ₹750 |
| Other (Armor, DNS, Secrets) | ₹700 |
| **GCP Total** | **~₹10,000** |
| External (Resend, Sentry) | ~₹2,000 |
| **Grand Total** | **~₹12,000/month** |

### Cost Optimization Strategies Applied

| Strategy | Savings |
|----------|---------|
| Single cluster for dev+prod | ~₹6,000/mo |
| Shared Redis with key prefix | ~₹2,900/mo |
| Sustained use (not spot) | ~20% auto discount |
| GCS lifecycle policies | ~30% on old images |
| Right-sized instances | ~50% vs over-provisioned |

### Why Not Cheaper Options?

| Option | Why Not |
|--------|---------|
| Spot VMs | Unreliable for production (24hr max, preemption) |
| Smaller nodes | Memory pressure during image processing |
| No Redis | Slower job processing, no BullMQ features |
| Cloud Run | Cold starts affect UX |

---

## 9. Trade-offs & Alternatives Considered

### Summary of Key Trade-offs

| Decision | Chose | Over | Why |
|----------|-------|------|-----|
| Monorepo | Turborepo | Polyrepo | Small team, shared code |
| API framework | Fastify | Express | 3x performance, TypeScript |
| Database | PostgreSQL | MongoDB | Relational data, compliance |
| Hosting | GKE | Cloud Run | No cold starts, K8s learning |
| Multi-tenancy | Shared DB | DB per tenant | 90% cost savings |
| Environments | Single cluster | Two clusters | 50% cost savings |
| VMs | Sustained use | Spot | Reliability > cost |

### What I'd Do Differently

| Aspect | Current | If Starting Over |
|--------|---------|------------------|
| Complexity | Microservices | Start monolith, split later |
| Queue | Redis + BullMQ | Database queue initially |
| Hosting | GKE | Cloud Run (simpler) |

---

## 10. Scaling Strategy

### Current Capacity vs Usage

| Metric | Capacity | Current Usage | Headroom |
|--------|----------|---------------|----------|
| Concurrent users | 1,000+ | ~15 | 66x |
| Requests/min | 1,200 | ~3 | 400x |
| Memory | 4GB | ~1.5GB | 2.5x |

### Scaling Triggers & Actions

| Trigger | Metric | Action |
|---------|--------|--------|
| CPU > 70% sustained | Node | Add second node |
| Memory > 80% | Node | Increase node size |
| API latency > 200ms | API | Add replica |
| Queue depth > 1000 | Worker | Add worker replica |
| DB connections > 80% | Database | Upgrade Cloud SQL tier |
| Storage > 40GB | Database | Increase storage |

### Growth Path

| Scale | Changes | Est. Cost |
|-------|---------|-----------|
| 10x users | Add node, increase replicas | ₹18,000/mo |
| 100x users | Multi-node, HA database | ₹50,000/mo |
| 1000x users | Multiple clusters, read replicas | ₹2,00,000/mo |

---

## 11. Interview Q&A Guide

### "Walk me through the architecture"

> "HTA Platform is a B2B2C SaaS for calibration certificate management. The architecture is a **modular monorepo** with three services:
>
> 1. **Web** (Next.js) - Server-side rendered frontend, proxies API requests
> 2. **API** (Fastify) - REST API handling business logic
> 3. **Worker** (BullMQ) - Background job processing for emails, image optimization
>
> They share a **PostgreSQL database** via Prisma ORM, use **Redis** for job queues and caching, and **GCS** for image storage.
>
> Everything runs on a single **GKE cluster** with namespace isolation for dev/prod, optimized to run under ₹12,000/month while handling 100 users and 5,000 certificates monthly."

### "Why did you separate the API from Next.js?"

> "Three reasons:
>
> 1. **Independent scaling** - API load is different from SSR load. With separation, I can scale the API without affecting the frontend.
>
> 2. **Resource isolation** - Background jobs (image processing, emails) were blocking API responses in the monolith. Now the worker has its own resources.
>
> 3. **Deployment flexibility** - Can deploy API fixes without redeploying frontend, reducing risk and deployment time."

### "Why PostgreSQL over MongoDB?"

> "Our domain is highly relational - certificates have parameters, parameters have results, everything links to tenants and users. PostgreSQL gives us:
>
> 1. **ACID compliance** - Critical for compliance (ISO 17025 requires audit trails)
> 2. **Strong consistency** - Certificate data can't be eventually consistent
> 3. **Prisma support** - Excellent TypeScript integration, type-safe queries
>
> MongoDB would require embedding or manual joins, and eventual consistency isn't acceptable for compliance documents."

### "How do you handle multi-tenancy?"

> "We use **shared database with row-level isolation**:
>
> - Every table has a `tenantId` column
> - Prisma middleware automatically adds tenant filter to all queries
> - JWT tokens contain `tenantId`, extracted in middleware
>
> This is 90% cheaper than database-per-tenant, and acceptable because:
> - Tenants are calibration labs (not competitors)
> - Data sensitivity is moderate (not financial/healthcare)
> - We can move to separate databases for enterprise clients if needed"

### "Why GKE over Cloud Run or ECS?"

> "It's a trade-off between cost, complexity, and learning:
>
> - **Cloud Run** would be cheaper and simpler, but cold starts affect user experience for a dashboard app
> - **GKE** has a free control plane (unlike EKS at $73/month), and I wanted to learn Kubernetes properly
> - At our scale, the ~₹3,000/month premium over Cloud Run is acceptable for always-warm responses and K8s experience
>
> If I were purely optimizing for cost and simplicity, I'd choose Cloud Run."

### "How would you scale this to 100x users?"

> "In stages:
>
> 1. **Vertical first** - Increase node size (e2-medium → e2-standard-4)
> 2. **Horizontal pods** - Add replicas for API and worker
> 3. **Database** - Upgrade Cloud SQL tier, add read replicas
> 4. **Caching** - Add application-level caching for common queries
> 5. **CDN** - Add Cloud CDN for static assets and images
> 6. **Separate clusters** - Split dev/prod, regional deployment
>
> The architecture already supports this - it's just resource allocation changes, no redesign needed."

### "What would you do differently?"

> "Honestly? I'd **start simpler**:
>
> 1. **Monolith first** - Keep everything in Next.js API routes until scaling issues appear
> 2. **Database queue** - Skip Redis initially, use the database queue fallback
> 3. **Cloud Run** - Start serverless, move to GKE when cold starts matter
>
> We over-engineered for scale we don't have yet. The current architecture is correct for 10x growth, but we're at 1x. That said, the learning value of building this properly was worth it."

### "How do you ensure reliability?"

> "Multiple layers:
>
> 1. **Health checks** - Kubernetes restarts unhealthy pods
> 2. **Graceful shutdown** - Drain connections before pod termination
> 3. **Job retries** - BullMQ retries failed jobs with exponential backoff
> 4. **Database backups** - Automated daily backups with 7-day retention
> 5. **Monitoring** - Sentry for errors, Cloud Monitoring for metrics
> 6. **Rollback** - Kubernetes rollback on failed deployments
>
> For a small team, we rely on managed services (Cloud SQL, Memorystore) rather than self-managing for reliability."

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│                 HTA Platform - Quick Reference                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Architecture:  Modular Monorepo (Web + API + Worker)           │
│  Frontend:      Next.js 14, React, Tailwind, Zustand            │
│  Backend:       Fastify, Prisma, BullMQ                         │
│  Database:      PostgreSQL (Cloud SQL)                          │
│  Cache/Queue:   Redis (Memorystore)                             │
│  Storage:       GCS (images), Artifact Registry (Docker)        │
│  Hosting:       GKE Standard (single cluster, dual namespace)   │
│  CI/CD:         GitHub Actions                                  │
│  Monitoring:    Sentry, Cloud Monitoring                        │
│                                                                 │
│  Scale:         100 users, 5K certs/month, 15 concurrent        │
│  Cost:          ~₹12,000/month (~$150)                          │
│  Capacity:      400x headroom on requests                       │
│                                                                 │
│  Key Decisions:                                                 │
│  - Fastify over Express (3x performance)                        │
│  - PostgreSQL over MongoDB (relational, compliance)             │
│  - GKE over Cloud Run (no cold starts)                          │
│  - Shared DB multi-tenancy (90% cost savings)                   │
│  - Single cluster dev+prod (50% cost savings)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
