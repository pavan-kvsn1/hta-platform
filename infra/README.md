# HTA Platform Infrastructure

## Directory Structure

```
infra/
├── k8s/
│   ├── base/                    # Base Kubernetes manifests
│   │   ├── kustomization.yaml   # Kustomize configuration
│   │   ├── namespace.yaml       # Namespace definition
│   │   ├── configmap.yaml       # Non-sensitive configuration
│   │   ├── secrets.yaml         # Secrets template (DO NOT COMMIT REAL VALUES)
│   │   ├── api-deployment.yaml  # API server deployment
│   │   ├── api-service.yaml     # API service + ServiceAccount
│   │   ├── worker-deployment.yaml # Background worker deployment
│   │   ├── ingress.yaml         # GKE Ingress + ManagedCertificate
│   │   └── hpa.yaml             # Horizontal Pod Autoscaler
│   └── overlays/
│       └── production/          # Production-specific overrides
│           └── kustomization.yaml
└── README.md
```

## GKE Deployment

### Prerequisites

1. GKE cluster with Workload Identity enabled
2. Cloud SQL PostgreSQL instance
3. Memorystore Redis instance
4. GCS bucket for certificate images
5. Static IP for Ingress
6. Domain configured with Cloud DNS

### Setup Secrets

Create secrets in the cluster (do not commit real values):

```bash
kubectl create secret generic hta-secrets \
  --namespace=hta-platform \
  --from-literal=database-url='postgresql://user:pass@host:5432/db' \
  --from-literal=redis-url='redis://host:6379' \
  --from-literal=jwt-secret='$(openssl rand -base64 32)' \
  --from-literal=resend-api-key='re_xxxxx'
```

### Deploy with Kustomize

```bash
# Preview what will be applied
kubectl kustomize infra/k8s/overlays/production

# Apply to cluster
kubectl apply -k infra/k8s/overlays/production

# Check deployment status
kubectl -n hta-platform get pods
kubectl -n hta-platform get ingress
```

### Update Images

```bash
# Build and push new images
docker build -f apps/api/Dockerfile -t gcr.io/PROJECT/hta-api:v1.2.3 .
docker push gcr.io/PROJECT/hta-api:v1.2.3

# Update deployment
kubectl -n hta-platform set image deployment/hta-api api=gcr.io/PROJECT/hta-api:v1.2.3

# Or update kustomization.yaml and re-apply
```

## Architecture

```
                    ┌─────────────────┐
                    │  Cloud DNS      │
                    │  *.hta.com      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Cloud Load     │
                    │  Balancer       │
                    │  (GKE Ingress)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───────┐ ┌────▼────┐ ┌──────▼──────┐
     │ /api/*         │ │ /*      │ │ /_next/*    │
     │ → API Service  │ │ → Web   │ │ → CDN       │
     └────────┬───────┘ └─────────┘ └─────────────┘
              │
     ┌────────▼────────┐
     │  API Pods       │
     │  (Fastify)      │◄──────┐
     └────────┬────────┘       │
              │                │
     ┌────────▼────────┐ ┌─────┴─────┐
     │  Cloud SQL      │ │   Redis   │
     │  (PostgreSQL)   │ │ (BullMQ)  │
     └─────────────────┘ └─────┬─────┘
                               │
                      ┌────────▼────────┐
                      │  Worker Pods    │
                      │  (Background)   │
                      └─────────────────┘
```

## Scaling

- **API**: Auto-scales 2-10 pods based on CPU/memory (HPA)
- **Worker**: Fixed 1 replica (scale manually if needed)
- **Database**: Vertical scaling via Cloud SQL
- **Redis**: Vertical scaling via Memorystore
