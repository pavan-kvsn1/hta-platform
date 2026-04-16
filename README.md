# HTA Platform

[![CI](https://github.com/pavan-kvsn1/hta-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/pavan-kvsn1/hta-platform/actions/workflows/ci.yml)

Multi-tenant calibration certificate management platform for calibration laboratories. Built with a modern microservices architecture using Turborepo.

## Features

- **Certificate Management** - Create, review, approve, and deliver calibration certificates
- **Multi-Tenant Architecture** - Single platform serving multiple calibration labs
- **Customer Portal** - Customers can review and download their certificates
- **Workflow Engine** - Configurable approval workflows with role-based access
- **Email Notifications** - Automated notifications for certificate lifecycle events
- **PDF Generation** - Professional certificate PDFs with digital signatures
- **Image Processing** - Automatic optimization and thumbnail generation

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui |
| **API** | Fastify, TypeScript, Zod validation |
| **Database** | PostgreSQL 16, Prisma ORM |
| **Cache/Queue** | Redis, BullMQ |
| **Auth** | NextAuth.js, JWT |
| **Email** | React Email, Resend |
| **Infrastructure** | GKE, Cloud SQL, Memorystore, GCS |
| **IaC** | Terraform |
| **CI/CD** | GitHub Actions |

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         GKE Gateway API             │
                    │      (Cloud Load Balancer)          │
                    └──────────────┬──────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │   Web App   │         │     API     │         │   Worker    │
    │  (Next.js)  │         │  (Fastify)  │         │  (BullMQ)   │
    └─────────────┘         └─────────────┘         └─────────────┘
           │                       │                       │
           └───────────────────────┼───────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │  Cloud SQL  │         │    Redis    │         │     GCS     │
    │ (PostgreSQL)│         │ (Memorystore)│        │  (Storage)  │
    └─────────────┘         └─────────────┘         └─────────────┘
```

## Repository Structure

```
hta-platform/
├── apps/
│   ├── web-hta/              # Next.js frontend (HTA branded)
│   ├── api/                  # Fastify API service
│   └── worker/               # BullMQ background jobs
├── packages/
│   ├── database/             # Prisma schema & client
│   ├── shared/               # Shared utilities (auth, cache, security)
│   ├── emails/               # Email templates (React Email)
│   └── ui/                   # Shared UI components
├── terraform/
│   ├── environments/
│   │   ├── dev/              # Development environment (~$100/mo)
│   │   └── production/       # Production environment (~$150/mo)
│   └── modules/              # Reusable Terraform modules
├── infra/k8s/                # Kubernetes manifests
├── docs/                     # Documentation
└── tests/                    # Cross-service tests
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+
- Redis 7+
- Docker (for local development)

### Local Development

```bash
# Clone the repository
git clone https://github.com/pavan-kvsn1/hta-platform.git
cd hta-platform

# Install dependencies
pnpm install

# Copy environment variables
cp apps/web-hta/.env.example apps/web-hta/.env.local
cp apps/api/.env.example apps/api/.env

# Start PostgreSQL and Redis (Docker)
docker compose up -d postgres redis

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Seed the database
pnpm db:seed

# Start all services
pnpm dev
```

### Development URLs

| Service | URL |
|---------|-----|
| Web App | http://localhost:3000 |
| API | http://localhost:4000 |
| API Health | http://localhost:4000/health |
| Prisma Studio | http://localhost:5555 |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all services in development mode |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type check all packages |
| `pnpm test` | Run all tests |
| `pnpm test:unit` | Run unit tests only |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Prisma Studio |

## Infrastructure

Infrastructure is managed via Terraform. See [docs/deployment-guide.md](docs/deployment-guide.md) for detailed deployment instructions.

### Quick Start

```bash
cd terraform/environments/dev

# Copy and configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Initialize and apply
terraform init
terraform plan
terraform apply
```

### Cost Estimates

| Environment | Monthly Cost |
|-------------|--------------|
| Development | ~$100 (~₹8,300) |
| Production | ~$150 (~₹12,000) |

## Documentation

| Document | Description |
|----------|-------------|
| [Deployment Guide](docs/deployment-guide.md) | Step-by-step GCP deployment |
| [Architecture Decisions](docs/architecture-decisions.md) | ADRs and design rationale |
| [API Separation Plan](docs/phase-9b-api-separation.md) | Microservices migration plan |

## CI/CD

The project uses GitHub Actions for CI/CD:

- **CI** (`ci.yml`) - Runs on every push
  - Code quality (lint, typecheck)
  - Unit tests
  - Integration tests (PostgreSQL + Redis)
  - E2E tests (Playwright, 3 shards)
  - Docker build verification

- **Deploy** (`deploy.yml`) - Manual trigger
  - Build and push to Artifact Registry
  - Deploy to GKE
  - Health check verification

## Adding a New Tenant

1. Copy tenant template:
   ```bash
   cp -r tenants/_template tenants/{tenant-slug}
   ```

2. Update `tenants/{tenant-slug}/config.json` with tenant settings

3. Copy web app template:
   ```bash
   cp -r apps/web-tenant-template apps/web-{tenant-slug}
   ```

4. Update branding in the new web app

5. Add tenant to database:
   ```bash
   pnpm db:seed:tenant --slug={tenant-slug}
   ```

6. Deploy with tenant-specific environment variables

## License

Proprietary - All rights reserved.
