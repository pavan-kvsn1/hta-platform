# HTA Platform - Deployment Guide

**Purpose:** Step-by-step guide to deploy HTA Platform to GCP
**Estimated Time:** 2-3 hours for initial setup
**Last Updated:** 2026-04-16

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [GCP Project Setup](#2-gcp-project-setup)
3. [Infrastructure Provisioning](#3-infrastructure-provisioning)
4. [Kubernetes Setup](#4-kubernetes-setup)
5. [CI/CD Configuration](#5-cicd-configuration)
6. [DNS & SSL Setup](#6-dns--ssl-setup)
7. [First Deployment](#7-first-deployment)
8. [Verification & Testing](#8-verification--testing)
9. [Post-Deployment Checklist](#9-post-deployment-checklist)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### Tools Required

```bash
# Install Google Cloud CLI
# Windows: Download from https://cloud.google.com/sdk/docs/install
# Mac:
brew install google-cloud-sdk

# Install kubectl
gcloud components install kubectl

# Install Helm (for some deployments)
# Windows: choco install kubernetes-helm
# Mac: brew install helm

# Verify installations
gcloud version
kubectl version --client
helm version
```

### Accounts & Access

- [ ] GCP account with billing enabled
- [ ] Domain name (hta-calibration.com) with DNS access
- [ ] GitHub repository access
- [ ] Resend account for emails
- [ ] Sentry account for monitoring (optional)

### Local Environment

```bash
# Clone the repository
git clone https://github.com/your-org/hta-platform.git
cd hta-platform

# Install dependencies
pnpm install

# Verify local build works
pnpm build
```

---

## 2. GCP Project Setup

### 2.1 Create Project

```bash
# Set variables
export PROJECT_ID="hta-platform-prod"
export REGION="asia-south1"
export ZONE="asia-south1-a"

# Create project
gcloud projects create $PROJECT_ID --name="HTA Platform"

# Set as default
gcloud config set project $PROJECT_ID

# Link billing account (get ID from console)
gcloud billing accounts list
gcloud billing projects link $PROJECT_ID --billing-account=YOUR_BILLING_ACCOUNT_ID
```

### 2.2 Enable APIs

```bash
# Enable required APIs
gcloud services enable \
  container.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  dns.googleapis.com
```

### 2.3 Service Accounts & Workload Identity (Terraform)

> **Note:** Service accounts and Workload Identity Federation are created automatically by Terraform in Section 3. No manual setup required.

Terraform creates:
- `github-actions` service account with CI/CD permissions
- Workload Identity Pool and OIDC Provider for GitHub Actions
- `api`, `worker`, `web` service accounts with Workload Identity bindings

After running `terraform apply`, get the values you need:

```bash
# Get these values for GitHub Actions secrets
cd terraform/environments/production  # or dev
terraform output github_workload_identity_provider
terraform output github_service_account_email
```

---

## 3. Infrastructure Provisioning (Terraform)

All infrastructure is managed via Terraform for consistency and reproducibility.

### 3.1 Prerequisites

```bash
# Install Terraform
# Windows: choco install terraform
# Mac: brew install terraform

# Verify installation
terraform version  # Should be >= 1.5.0
```

### 3.2 Create Terraform State Bucket

```bash
# This is the only manual step - create bucket for Terraform state
gsutil mb -l $REGION gs://hta-platform-terraform-state
gsutil versioning set on gs://hta-platform-terraform-state
```

### 3.3 Configure Terraform Variables

```bash
# Navigate to appropriate environment
cd terraform/environments/dev    # For development
# OR
cd terraform/environments/production  # For production

# Copy example tfvars
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
# IMPORTANT: Never commit terraform.tfvars to git
```

**Required variables in terraform.tfvars:**

```hcl
# terraform.tfvars
project_id        = "hta-calibration-dev"  # Your GCP project ID
region            = "asia-south1"          # Mumbai
database_password = "YOUR_SECURE_PASSWORD" # Generate strong password
github_repo       = "your-username/hta-platform"

# For production only:
iap_support_email      = "admin@hta-calibration.com"
iap_authorized_members = ["user:your-email@gmail.com"]
```

### 3.4 Initialize Terraform

```bash
# Initialize (downloads providers, sets up backend)
terraform init

# Validate configuration
terraform validate
```

### 3.5 Plan Infrastructure

```bash
# Preview what will be created
terraform plan -out=tfplan

# Review the plan carefully - it will show:
# - VPC network and subnets
# - GKE cluster with node pool
# - Cloud SQL PostgreSQL (50GB)
# - Memorystore Redis
# - Cloud NAT for outbound traffic
# - Cloud Armor WAF
# - GCS buckets
# - Secret Manager secrets
# - Artifact Registry
# - Service accounts with Workload Identity
# - GitHub Actions OIDC federation
```

### 3.6 Apply Infrastructure

```bash
# Apply the plan (creates all resources)
terraform apply tfplan

# This takes 15-25 minutes (GKE and Cloud SQL are slow)
# Go grab a coffee ☕
```

### 3.7 Capture Outputs

```bash
# View all outputs
terraform output

# Key outputs you'll need:
terraform output gke_cluster_name
terraform output ingress_static_ip
terraform output cloudsql_private_ip
terraform output redis_host
terraform output artifact_registry_url
terraform output github_workload_identity_provider
terraform output github_service_account_email
```

### 3.8 Connect to GKE Cluster

```bash
# Get cluster credentials
CLUSTER_NAME=$(terraform output -raw gke_cluster_name)
gcloud container clusters get-credentials $CLUSTER_NAME --region=$REGION

# Verify connection
kubectl get nodes
```

### 3.9 What Terraform Creates

| Resource | Dev Tier | Production Tier |
|----------|----------|-----------------|
| **VPC** | Custom VPC with private subnets | Same |
| **GKE** | e2-medium, 1-3 nodes, single zone | e2-standard-4, 1-3 nodes, multi-zone |
| **Cloud SQL** | db-g1-small, 10GB, ZONAL | db-custom-2-4096, 50GB, REGIONAL |
| **Redis** | BASIC 1GB | STANDARD_HA 1GB |
| **Cloud NAT** | Auto-allocated IPs | Same |
| **Cloud Armor** | OWASP rules, rate limiting | Same |
| **GCS** | Standard bucket | Standard with versioning |
| **Secrets** | DATABASE_URL, REDIS_URL, etc. | Same |
| **Artifact Registry** | Docker repo | Same |
| **Service Accounts** | API, Worker, Web with Workload Identity | Same |
| **GitHub OIDC** | Workload Identity Federation | Same |

### 3.10 Cost Estimate

| Environment | Monthly Cost |
|-------------|--------------|
| **Dev** | ~$100 (~₹8,300) |
| **Production** | ~$150 (~₹12,000) |

### 3.11 Manual Post-Terraform Steps

Some secrets need manual population:

```bash
# Add Resend API key (get from resend.com dashboard)
echo -n "re_your_resend_api_key" | \
  gcloud secrets versions add resend-api-key --data-file=-

# Add NextAuth secret (generate random 32+ char string)
openssl rand -base64 32 | \
  gcloud secrets versions add nextauth-secret --data-file=-

# Add Sentry DSN (optional, get from sentry.io)
echo -n "https://xxx@xxx.ingest.sentry.io/xxx" | \
  gcloud secrets versions add sentry-dsn --data-file=-
```

---

## 4. Kubernetes Setup

### 4.1 Create Namespaces

```bash
# Create namespaces
kubectl create namespace hta-prod
kubectl create namespace hta-dev

# Set labels
kubectl label namespace hta-prod environment=production
kubectl label namespace hta-dev environment=development
```

### 4.2 Create Kubernetes Secrets

```bash
# Production secrets
kubectl create secret generic hta-secrets -n hta-prod \
  --from-literal=DATABASE_URL="postgresql://hta_app:PASSWORD@CLOUD_SQL_IP:5432/hta_prod" \
  --from-literal=REDIS_URL="redis://REDIS_IP:6379" \
  --from-literal=AUTH_SECRET="your-auth-secret" \
  --from-literal=RESEND_API_KEY="re_your_key" \
  --from-literal=SENTRY_DSN="your-sentry-dsn"

# Dev secrets
kubectl create secret generic hta-secrets -n hta-dev \
  --from-literal=DATABASE_URL="postgresql://hta_app:PASSWORD@CLOUD_SQL_IP:5432/hta_dev" \
  --from-literal=REDIS_URL="redis://REDIS_IP:6379" \
  --from-literal=AUTH_SECRET="your-auth-secret-dev" \
  --from-literal=RESEND_API_KEY="re_your_key" \
  --from-literal=SENTRY_DSN="your-sentry-dsn"
```

### 4.3 Create ConfigMaps

```bash
# Production config
kubectl create configmap hta-config -n hta-prod \
  --from-literal=NODE_ENV=production \
  --from-literal=LOG_LEVEL=info \
  --from-literal=NEXTAUTH_URL=https://app.hta-calibration.com \
  --from-literal=API_URL=http://hta-api:4000 \
  --from-literal=GCS_CERTIFICATES_BUCKET=${PROJECT_ID}-prod-certificates \
  --from-literal=GCS_IMAGES_BUCKET=${PROJECT_ID}-prod-images \
  --from-literal=REDIS_KEY_PREFIX=prod: \
  --from-literal=BULLMQ_PREFIX=prod

# Dev config
kubectl create configmap hta-config -n hta-dev \
  --from-literal=NODE_ENV=development \
  --from-literal=LOG_LEVEL=debug \
  --from-literal=NEXTAUTH_URL=https://dev.hta-calibration.com \
  --from-literal=API_URL=http://hta-api:4000 \
  --from-literal=GCS_CERTIFICATES_BUCKET=${PROJECT_ID}-dev-certificates \
  --from-literal=GCS_IMAGES_BUCKET=${PROJECT_ID}-dev-images \
  --from-literal=REDIS_KEY_PREFIX=dev: \
  --from-literal=BULLMQ_PREFIX=dev
```

### 4.4 Apply Kubernetes Manifests

```bash
# Apply base manifests
kubectl apply -k infra/k8s/base

# Apply production overlay
kubectl apply -k infra/k8s/overlays/production

# Apply dev overlay
kubectl apply -k infra/k8s/overlays/dev
```

### 4.5 Setup Ingress/Gateway

```bash
# Install Gateway API CRDs
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml

# Apply gateway configuration
kubectl apply -f infra/k8s/base/gateway.yaml
```

---

## 5. CI/CD Configuration

### 5.1 Get Values from Terraform

First, get the required values from Terraform outputs:

```bash
cd terraform/environments/production

# Get all values needed for GitHub secrets
echo "GCP_PROJECT_ID: $(terraform output -raw gke_cluster_name | cut -d'-' -f1-2)"
echo "GKE_CLUSTER_NAME: $(terraform output -raw gke_cluster_name)"
echo "WIF_PROVIDER: $(terraform output -raw github_workload_identity_provider)"
echo "WIF_SERVICE_ACCOUNT: $(terraform output -raw github_service_account_email)"
echo "ARTIFACT_REGISTRY: $(terraform output -raw artifact_registry_url)"
```

### 5.2 GitHub Repository Secrets

Go to GitHub repo → Settings → Secrets and variables → Actions

Add these secrets (values from Terraform outputs above):

| Secret Name | Value (from Terraform) |
|-------------|------------------------|
| `GCP_PROJECT_ID` | Your GCP project ID (e.g., `hta-calibration-prod`) |
| `GCP_REGION` | `asia-south1` |
| `GKE_CLUSTER_NAME` | `terraform output -raw gke_cluster_name` |
| `WIF_PROVIDER` | `terraform output -raw github_workload_identity_provider` |
| `WIF_SERVICE_ACCOUNT` | `terraform output -raw github_service_account_email` |
| `ARTIFACT_REGISTRY` | `terraform output -raw artifact_registry_url` |
| `API_HEALTH_URL` | `https://app.hta-calibration.com/api/health` |

### 5.3 GitHub Environments

Create environments in GitHub:

1. **production**
   - Required reviewers: (optional)
   - Deployment branches: main

2. **dev**
   - Deployment branches: dev/*

### 5.4 Verify Workflow

```bash
# Push a small change to trigger CI
git checkout -b dev/test-deploy
echo "# Test" >> README.md
git add .
git commit -m "test: trigger CI/CD"
git push origin dev/test-deploy
```

---

## 6. DNS & SSL Setup

### 6.1 Configure Cloud DNS (or your DNS provider)

```bash
# Create DNS zone (if using Cloud DNS)
gcloud dns managed-zones create hta-zone \
  --dns-name="hta-calibration.com." \
  --description="HTA Platform DNS zone"

# Get load balancer IP
LB_IP=$(gcloud compute addresses describe hta-lb-ip --global --format="value(address)")

# Add A records
gcloud dns record-sets create app.hta-calibration.com. \
  --zone=hta-zone \
  --type=A \
  --ttl=300 \
  --rrdatas=$LB_IP

gcloud dns record-sets create dev.hta-calibration.com. \
  --zone=hta-zone \
  --type=A \
  --ttl=300 \
  --rrdatas=$LB_IP
```

### 6.2 If Using External DNS Provider

Add these DNS records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | app | (Load Balancer IP) | 300 |
| A | dev | (Load Balancer IP) | 300 |

### 6.3 SSL Certificate (Managed)

```bash
# Create managed certificate
cat > ssl-cert.yaml << 'EOF'
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: hta-ssl-cert
  namespace: hta-prod
spec:
  domains:
    - app.hta-calibration.com
    - dev.hta-calibration.com
EOF

kubectl apply -f ssl-cert.yaml

# Check certificate status (takes 10-30 minutes)
kubectl describe managedcertificate hta-ssl-cert -n hta-prod
```

---

## 7. First Deployment

### 7.1 Build and Push Docker Images

```bash
# Get registry URL from Terraform
cd terraform/environments/production
export REGISTRY=$(terraform output -raw artifact_registry_url)

# Authenticate Docker with GCP
gcloud auth configure-docker asia-south1-docker.pkg.dev

# Build images (from repo root)
cd ../../..
docker build -f apps/web-hta/Dockerfile -t ${REGISTRY}/hta-web:v1.0.0 .
docker build -f apps/api/Dockerfile -t ${REGISTRY}/hta-api:v1.0.0 .
docker build -f apps/worker/Dockerfile -t ${REGISTRY}/hta-worker:v1.0.0 .

# Push images
docker push ${REGISTRY}/hta-web:v1.0.0
docker push ${REGISTRY}/hta-api:v1.0.0
docker push ${REGISTRY}/hta-worker:v1.0.0
```

### 7.2 Run Database Migrations

```bash
# Get Cloud SQL connection name from Terraform
cd terraform/environments/production
export SQL_CONNECTION=$(terraform output -raw cloudsql_connection_name)

# Option 1: Run from local (with Cloud SQL proxy)
# Download proxy: https://cloud.google.com/sql/docs/postgres/sql-proxy
./cloud-sql-proxy --port=5432 $SQL_CONNECTION &

# Run migrations (use password from your terraform.tfvars)
DATABASE_URL="postgresql://hta_app:YOUR_PASSWORD@localhost:5432/hta_platform" \
  pnpm prisma migrate deploy

# Option 2: Run as Kubernetes job
kubectl apply -f - << 'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  namespace: hta-prod
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: ${REGISTRY}/hta-api:v1.0.0
        command: ["pnpm", "prisma", "migrate", "deploy"]
        envFrom:
        - secretRef:
            name: hta-secrets
        - configMapRef:
            name: hta-config
      restartPolicy: Never
  backoffLimit: 3
EOF

# Check job status
kubectl logs job/db-migrate -n hta-prod
```

### 7.3 Deploy Applications

```bash
# Update image tags in kustomization
cd infra/k8s/overlays/production
kustomize edit set image \
  gcr.io/PROJECT_ID/hta-web=${REGISTRY}/hta-web:v1.0.0 \
  gcr.io/PROJECT_ID/hta-api=${REGISTRY}/hta-api:v1.0.0 \
  gcr.io/PROJECT_ID/hta-worker=${REGISTRY}/hta-worker:v1.0.0

# Deploy
kubectl apply -k .

# Watch rollout
kubectl rollout status deployment/hta-web -n hta-prod
kubectl rollout status deployment/hta-api -n hta-prod
kubectl rollout status deployment/hta-worker -n hta-prod
```

### 7.4 Verify Deployment

```bash
# Check pods
kubectl get pods -n hta-prod

# Check services
kubectl get svc -n hta-prod

# Check ingress/gateway
kubectl get gateway,httproute -n hta-prod

# View logs
kubectl logs -l app=hta-api -n hta-prod --tail=100
```

---

## 8. Verification & Testing

### 8.1 Health Checks

```bash
# API health
curl https://app.hta-calibration.com/api/health

# Expected response:
# {"status":"ok","timestamp":"2026-04-16T10:00:00.000Z"}

# Web health
curl -I https://app.hta-calibration.com

# Expected: HTTP/2 200
```

### 8.2 Functional Tests

```bash
# Run E2E tests against production
PLAYWRIGHT_BASE_URL=https://app.hta-calibration.com \
  pnpm --filter @hta/web-hta test:e2e

# Or run smoke tests
curl -X POST https://app.hta-calibration.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

### 8.3 Load Test (Optional)

```bash
# Run k6 load test
k6 run tests/load/scenarios/api-baseline.ts \
  -e BASE_URL=https://app.hta-calibration.com
```

---

## 9. Post-Deployment Checklist

### Infrastructure

- [ ] All pods running (`kubectl get pods -n hta-prod`)
- [ ] Services accessible (`kubectl get svc -n hta-prod`)
- [ ] SSL certificate active (`kubectl describe managedcertificate`)
- [ ] Database connected (check API logs)
- [ ] Redis connected (check worker logs)
- [ ] GCS accessible (try image upload)

### Monitoring

- [ ] Sentry receiving errors
- [ ] Cloud Monitoring dashboards created
- [ ] Billing alerts configured ($150, $200, $250)
- [ ] Uptime checks configured

### Security

- [ ] Secrets not in logs
- [ ] HTTPS redirects working
- [ ] Cloud Armor rules active
- [ ] Service account permissions minimal

### Backup

- [ ] Cloud SQL automated backups enabled
- [ ] GCS versioning enabled (if needed)
- [ ] Tested restore procedure

### Documentation

- [ ] Runbook updated with new endpoints
- [ ] Team notified of deployment
- [ ] DNS propagation complete

---

## 10. Troubleshooting

### Pod Not Starting

```bash
# Check pod status
kubectl describe pod POD_NAME -n hta-prod

# Check events
kubectl get events -n hta-prod --sort-by='.lastTimestamp'

# Common issues:
# - ImagePullBackOff: Check image name, registry permissions
# - CrashLoopBackOff: Check logs, environment variables
# - Pending: Check resource quotas, node capacity
```

### Database Connection Failed

```bash
# Test from a pod
kubectl run -it --rm debug --image=postgres:15 -n hta-prod -- \
  psql "postgresql://hta_app:PASSWORD@CLOUD_SQL_IP:5432/hta_prod"

# Check Cloud SQL
gcloud sql instances describe hta-db

# Common issues:
# - Wrong IP (use private IP)
# - Firewall blocking
# - Wrong credentials
```

### Redis Connection Failed

```bash
# Test from a pod
kubectl run -it --rm debug --image=redis:7 -n hta-prod -- \
  redis-cli -h REDIS_IP ping

# Check Memorystore
gcloud redis instances describe hta-redis --region=$REGION
```

### SSL Certificate Not Working

```bash
# Check certificate status
kubectl describe managedcertificate hta-ssl-cert -n hta-prod

# Common issues:
# - DNS not pointing to LB IP
# - Certificate still provisioning (wait 30 min)
# - Domain verification failed
```

### High Latency

```bash
# Check pod resources
kubectl top pods -n hta-prod

# Check node resources
kubectl top nodes

# Check database slow queries
gcloud sql operations list --instance=hta-db
```

---

## Quick Commands Reference

```bash
# --- Cluster Access ---
gcloud container clusters get-credentials hta-platform-cluster --zone=$ZONE

# --- View Resources ---
kubectl get all -n hta-prod
kubectl get all -n hta-dev

# --- Logs ---
kubectl logs -l app=hta-api -n hta-prod -f
kubectl logs -l app=hta-worker -n hta-prod -f

# --- Shell into Pod ---
kubectl exec -it deployment/hta-api -n hta-prod -- /bin/sh

# --- Restart Deployment ---
kubectl rollout restart deployment/hta-api -n hta-prod

# --- Scale ---
kubectl scale deployment/hta-api -n hta-prod --replicas=2

# --- Rollback ---
kubectl rollout undo deployment/hta-api -n hta-prod

# --- Port Forward (for debugging) ---
kubectl port-forward svc/hta-api 4000:4000 -n hta-prod

# --- View Secrets ---
kubectl get secret hta-secrets -n hta-prod -o jsonpath='{.data.DATABASE_URL}' | base64 -d
```

---

## Cost Monitoring

```bash
# Set up billing alerts
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="HTA Platform Budget" \
  --budget-amount=150USD \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0

# View current costs
gcloud billing accounts describe BILLING_ACCOUNT_ID
```

---

## Next Steps After Deployment

1. **Create first tenant** - Set up admin account
2. **Configure email templates** - Verify Resend integration
3. **Test customer flow** - Create test customer, view certificates
4. **Set up monitoring dashboards** - Cloud Monitoring or Grafana
5. **Schedule DR drill** - Test backup restore
6. **Document tenant onboarding** - Process for new labs

---

## Support

- **Logs**: `kubectl logs -l app=hta-api -n hta-prod`
- **Monitoring**: GCP Console → Monitoring
- **Errors**: Sentry dashboard
- **Costs**: GCP Console → Billing
