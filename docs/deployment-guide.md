# HTA Platform - Deployment Guide

**Purpose:** Step-by-step guide to deploy HTA Platform to GCP
**Estimated Time:** 2-3 hours for initial setup
**Last Updated:** 2026-04-21

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [GCP Project Setup](#2-gcp-project-setup)
3. [Infrastructure Provisioning](#3-infrastructure-provisioning)
4. [Kubernetes Setup](#4-kubernetes-setup)
5. [CI/CD Configuration](#5-cicd-configuration)
6. [DNS & SSL Setup](#6-dns--ssl-setup)
7. [First Deployment](#7-first-deployment)
8. [Monitoring Setup](#8-monitoring-setup)
9. [Argo CD Setup (GitOps)](#9-argo-cd-setup-gitops)
10. [Verification & Testing](#10-verification--testing)
11. [Post-Deployment Checklist](#11-post-deployment-checklist)
12. [Troubleshooting](#12-troubleshooting)

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
gcloud services enable '
  container.googleapis.com '
  sqladmin.googleapis.com '
  redis.googleapis.com '
  storage.googleapis.com '
  secretmanager.googleapis.com '
  cloudbuild.googleapis.com '
  artifactregistry.googleapis.com '
  compute.googleapis.com '
  cloudresourcemanager.googleapis.com '
  iam.googleapis.com '
  dns.googleapis.com '
  servicenetworking.googleapis.com '
  iap.googleapis.com '
  certificatemanager.googleapis.com
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
terraform output github_workload_identity_provider    #"projects/923421312140/locations/global/workloadIdentityPools/github-actions/providers/github-provider"
terraform output github_service_account_email         #"github-actions@hta-platform-prod.iam.gserviceaccount.com"
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
    # For production

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
terraform output gke_cluster_name                      #"production-cluster"
terraform output ingress_static_ip                     #"34.120.49.187"
terraform output cloudsql_private_ip                   #"10.70.1.2""
terraform output redis_host                            #"10.70.0.4"
terraform output artifact_registry_url                 #"asia-south1-docker.pkg.dev/hta-platform-prod/production-docker"
terraform output github_workload_identity_provider     #"projects/923421312140/locations/global/workloadIdentityPools/github-actions/providers/github-provider"
terraform output github_service_account_email          #"github-actions@hta-platform-prod.iam.gserviceaccount.com"
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

### 3.10 Important Configuration Notes

#### Cloud SQL SSL Mode

Cloud SQL supports different SSL modes for connections:

| SSL Mode | Description | Use Case |
|----------|-------------|----------|
| `ALLOW_UNENCRYPTED_AND_ENCRYPTED` | SSL optional | Development only |
| `ENCRYPTED_ONLY` | SSL required, no client cert | **Recommended for production** |
| `TRUSTED_CLIENT_CERTIFICATE_REQUIRED` | mTLS - requires client certificates | High security (needs Cloud SQL Auth Proxy) |

**We use `ENCRYPTED_ONLY`** because:
- Traffic is encrypted in transit
- Pods don't need client certificates
- Simpler than setting up Cloud SQL Auth Proxy

If you need `TRUSTED_CLIENT_CERTIFICATE_REQUIRED` (mTLS), you must either:
1. Deploy Cloud SQL Auth Proxy as a sidecar container, OR
2. Mount client certificates to your pods

The DATABASE_URL must include `?sslmode=require` for SSL connections.

#### Redis Eviction Policy

BullMQ (our job queue) requires Redis to use `noeviction` policy. If Redis evicts keys when memory is full, job data can be lost and workers will fail.

Terraform configures this automatically:
```hcl
redis_configs = {
  maxmemory-policy = "noeviction"
}
```

If you see this warning in worker logs, the policy is wrong:
```
IMPORTANT! Eviction policy is volatile-lru. It should be "noeviction"
```

Fix manually:
```bash
gcloud redis instances update INSTANCE_NAME \
  --region=asia-south1 \
  --update-redis-config=maxmemory-policy=noeviction
```

### 3.11 Cost Estimate

| Environment | Monthly Cost |
|-------------|--------------|
| **Dev** | ~$100 (~₹8,300) |
| **Production** | ~$150 (~₹12,000) |

### 3.12 Manual Post-Terraform Steps

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

### 3.12 External Secrets Operator Setup

External Secrets Operator syncs GCP Secret Manager secrets to Kubernetes automatically. This is the recommended approach for managing secrets.

#### Create Namespace First

```bash
# Create namespace (required before applying secrets)
kubectl create namespace hta-prod
kubectl label namespace hta-prod environment=production
```

#### Install External Secrets Operator

```bash
# Add Helm repo
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

# Install operator
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace --wait
```

#### Create GCP Service Account for External Secrets

```bash
# Create service account
gcloud iam service-accounts create external-secrets \
  --display-name="External Secrets Operator" \
  --project=$PROJECT_ID

# Grant Secret Manager access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:external-secrets@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None

# Setup Workload Identity binding
gcloud iam service-accounts add-iam-policy-binding \
  external-secrets@${PROJECT_ID}.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[external-secrets/external-secrets]"

# Grant GKE node SA permission to impersonate
gcloud iam service-accounts add-iam-policy-binding \
  external-secrets@${PROJECT_ID}.iam.gserviceaccount.com \
  --role="roles/iam.serviceAccountTokenCreator" \
  --member="serviceAccount:${ENVIRONMENT}-gke-nodes@${PROJECT_ID}.iam.gserviceaccount.com"

# Annotate K8s service account
kubectl annotate serviceaccount external-secrets -n external-secrets \
  iam.gke.io/gcp-service-account=external-secrets@${PROJECT_ID}.iam.gserviceaccount.com

# Restart operator to pick up credentials
kubectl rollout restart deployment external-secrets -n external-secrets
```

#### Apply Kubernetes Manifests

The manifests are in `k8s/` directory:

```bash
# Create service accounts with Workload Identity annotations
kubectl apply -f k8s/service-accounts.yaml

# Create ClusterSecretStore (connects to GCP Secret Manager)
kubectl apply -f k8s/secret-store.yaml

# Create ExternalSecrets (syncs secrets to K8s)
kubectl apply -f k8s/external-secrets.yaml
```

#### Verify Secrets Synced

```bash
# Check ExternalSecret status (should show SecretSynced)
kubectl get externalsecrets -n hta-prod

# Verify K8s secrets were created
kubectl get secrets -n hta-prod

# Check secret keys
kubectl get secret api-secrets -n hta-prod -o jsonpath='{.data}' | jq 'keys'
```

**Expected secrets:**

| K8s Secret | Keys | Used By |
|------------|------|---------|
| `api-secrets` | DATABASE_URL, REDIS_URL | API deployment |
| `worker-secrets` | DATABASE_URL, REDIS_URL, RESEND_API_KEY | Worker deployment |
| `web-secrets` | NEXTAUTH_SECRET | Web deployment |

Secrets auto-refresh every hour from GCP Secret Manager. Update secrets in GCP and they'll sync to Kubernetes automatically (pods need restart to pick up changes).

---

## 4. Kubernetes Setup

### 4.1 Create Namespaces

> **Note:** If you followed section 3.12, `hta-prod` namespace already exists. Skip to dev namespace.

```bash
# Create namespaces (skip if already exists)
kubectl create namespace hta-prod --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace hta-dev --dry-run=client -o yaml | kubectl apply -f -

# Set labels
kubectl label namespace hta-prod environment=production --overwrite
kubectl label namespace hta-dev environment=development --overwrite
```

### 4.2 Create Kubernetes Secrets

> **Recommended:** Use External Secrets Operator (section 3.12) instead of manual secret creation. External Secrets syncs from GCP Secret Manager automatically.

If using External Secrets Operator (recommended):

```bash
# Secrets are already created by ExternalSecrets - verify they exist
kubectl get secrets -n hta-prod
# Should show: api-secrets, worker-secrets, web-secrets
```

<details>
<summary>Manual approach (legacy - not recommended)</summary>

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

</details>

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
echo "GCP_PROJECT_ID: $((terraform output -raw gke_cluster_name).Split('-')[0..1] -join '-')"
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

> **Note:** SSL setup requires DNS to be configured first. The certificate provisioning will fail if the domain doesn't resolve to your load balancer IP.

### 6.1 Get the Static IP

Terraform **reserves** a static IP during infrastructure provisioning. This IP exists before the load balancer is created, so you can configure DNS immediately after running `terraform apply`.

```bash
# Get the reserved static IP
gcloud compute addresses describe production-security-policy-ip --global --format="value(address)"

# Example output: 34.120.49.187
```

Or from Terraform outputs:

```bash
cd terraform/environments/production
terraform output ingress_static_ip
```

> **Note:** The IP is reserved but not yet in use. Once you deploy the Gateway (Section 7), it will bind to this IP and create the load balancer.

### 6.2 Configure DNS Records

#### Option A: Using Cloud DNS

> **Note:** Cloud DNS requires changing your domain's nameservers at your registrar to Google's nameservers. Skip to Option B if you prefer to manage DNS at your existing registrar (GoDaddy, Namecheap, Cloudflare, etc.).

**Step 1: Create DNS Zone**

```bash
# Create DNS zone
gcloud dns managed-zones create hta-zone \
  --dns-name="hta-calibration.com." \
  --description="HTA Platform DNS zone" \
  --project=hta-platform-prod

# Get Google's nameservers for your zone
gcloud dns managed-zones describe hta-zone --format="value(nameServers)"
# Example output:
# ns-cloud-a1.googledomains.com.
# ns-cloud-a2.googledomains.com.
# ns-cloud-a3.googledomains.com.
# ns-cloud-a4.googledomains.com.
```

**Step 2: Update Nameservers at Your Registrar**

Go to your domain registrar (where you bought hta-calibration.com) and update the nameservers to the Google nameservers from Step 1.

> **Warning:** Nameserver changes can take 24-48 hours to propagate globally.

**Step 3: Add DNS Records**

```bash
# Get the reserved static IP
export LB_IP=$(gcloud compute addresses describe production-security-policy-ip --global --format="value(address)")

# Add A records
gcloud dns record-sets create app.hta-calibration.com. \
  --zone=hta-zone \
  --type=A \
  --ttl=300 \
  --rrdatas=$LB_IP

gcloud dns record-sets create hta-calibration.com. \
  --zone=hta-zone \
  --type=A \
  --ttl=300 \
  --rrdatas=$LB_IP
```

#### Option B: External DNS Provider (GoDaddy, Cloudflare, etc.)

Add these DNS records in your provider's dashboard:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ (root) | 34.120.49.187 | 300 |
| A | app | 34.120.49.187 | 300 |

Replace `34.120.49.187` with your actual IP from step 6.1.

#### Verify DNS Propagation

```bash
# Check DNS resolution (may take 5-30 minutes to propagate)
nslookup app.hta-calibration.com
# or
dig app.hta-calibration.com
```

### 6.3 SSL Certificate Setup

#### Phase 1: HTTP Only (Initial Testing)

For initial deployment, start with HTTP only to verify the Gateway works:

```bash
# Check Gateway status
kubectl get gateway -n hta-prod

# Gateway should show an ADDRESS once Load Balancer is provisioned
# This can take 5-10 minutes
```

#### Phase 2: Enable HTTPS with GCP Managed Certificate

Once HTTP is working, add SSL:

**Step 1: Create the Managed Certificate**

```bash
# Create managed certificate resource
kubectl apply -f - <<EOF
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: hta-managed-cert
  namespace: hta-prod
spec:
  domains:
    - app.hta-calibration.com
    - hta-calibration.com
EOF
```

**Step 2: Update Gateway to use the certificate**

Update `infra/k8s/base/gateway.yaml` to reference the managed certificate:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: hta-gateway
  namespace: hta-prod
  annotations:
    networking.gke.io/certmap: hta-managed-cert
spec:
  gatewayClassName: gke-l7-global-external-managed
  # ... rest of config
```

**Step 3: Check certificate status**

```bash
# Certificate provisioning takes 10-30 minutes
kubectl describe managedcertificate hta-managed-cert -n hta-prod

# Status should eventually show:
# Certificate Status: Active
```

### 6.4 Troubleshooting DNS & SSL

| Issue | Check | Fix |
|-------|-------|-----|
| Gateway has no ADDRESS | `kubectl describe gateway hta-gateway -n hta-prod` | Check events for errors, ensure Gateway config is valid |
| Certificate stuck on Provisioning | DNS must resolve to LB IP | Verify DNS records point to correct IP |
| Certificate failed | Domain verification failed | Ensure DNS is propagated, check domain ownership |
| SSL handshake fails | Certificate not yet active | Wait for provisioning (up to 30 min) |

```bash
# Debug Gateway issues
kubectl get gateway -n hta-prod -o wide
kubectl describe gateway hta-gateway -n hta-prod | tail -20

# Check events
kubectl get events -n hta-prod --sort-by='.lastTimestamp' | grep -i gateway

# Test HTTP access (before SSL)
curl -I http://app.hta-calibration.com/health
```

---

## 7. First Deployment

> **Note:** This section covers manual deployment. Once Argo CD is set up (Section 9), deployments are automated via GitOps.

### 7.1 Prerequisites Check

Before deploying, ensure you have:

```bash
# Verify cluster connection
kubectl get nodes

# Verify secrets are synced (from External Secrets)
kubectl get secrets -n hta-prod
# Should show: api-secrets, worker-secrets, web-secrets

# Verify ConfigMap exists
kubectl get configmap hta-config -n hta-prod
```

### 7.2 Build and Push Docker Images

#### Option A: Build Locally (Windows PowerShell)

```powershell
# Set registry URL
$REGISTRY = "asia-south1-docker.pkg.dev/hta-platform-prod/production-docker"

# Authenticate Docker with GCP
gcloud auth configure-docker asia-south1-docker.pkg.dev

# Build images (from repo root)
docker build --no-cache -f apps/api/Dockerfile -t hta-api:latest .
docker build --no-cache -f apps/web-hta/Dockerfile -t hta-web:latest .
docker build --no-cache -f apps/worker/Dockerfile -t hta-worker:latest .

# Build images using cache (from repo root)
docker build -f apps/api/Dockerfile -t hta-api:latest .
docker build -f apps/web-hta/Dockerfile -t hta-web:latest .
docker build -f apps/worker/Dockerfile -t hta-worker:latest .

# Tag for registry (both :latest and version tag)
docker tag hta-api:latest $REGISTRY/hta-api:latest
docker tag hta-api:latest $REGISTRY/hta-api:v1.0.33
docker tag hta-web:latest $REGISTRY/hta-web:latest
docker tag hta-web:latest $REGISTRY/hta-web:v1.0.40
docker tag hta-worker:latest $REGISTRY/hta-worker:latest
docker tag hta-worker:latest $REGISTRY/hta-worker:v1.0.23

# Push images (push :latest - this is what K8s deployments use)
docker push $REGISTRY/hta-api:latest
docker push $REGISTRY/hta-web:latest
docker push $REGISTRY/hta-worker:latest

# Optionally push version tags for rollback
docker push $REGISTRY/hta-api:v1.0.33
docker push $REGISTRY/hta-web:v1.0.40
docker push $REGISTRY/hta-worker:v1.0.23
```

#### Option A: Build Locally (Linux/Mac)

```bash
# Set registry URL
export REGISTRY="asia-south1-docker.pkg.dev/hta-platform-prod/production-docker"

# Authenticate Docker with GCP
gcloud auth configure-docker asia-south1-docker.pkg.dev

# Build images (from repo root)
docker build -f apps/api/Dockerfile -t hta-api:latest .
docker build -f apps/web-hta/Dockerfile -t hta-web:latest .
docker build -f apps/worker/Dockerfile -t hta-worker:latest .

# Tag for registry
docker tag hta-api:latest $REGISTRY/hta-api:latest
docker tag hta-web:latest $REGISTRY/hta-web:latest
docker tag hta-worker:latest $REGISTRY/hta-worker:latest

# Push images
docker push $REGISTRY/hta-api:latest
docker push $REGISTRY/hta-web:latest
docker push $REGISTRY/hta-worker:latest
```

#### Verify Images Were Pushed

```bash
# List images in Artifact Registry
gcloud artifacts docker images list asia-south1-docker.pkg.dev/hta-platform-prod/production-docker

# You should see hta-api, hta-web, hta-worker with :latest tags
```

> **Important:** The Kubernetes deployments reference `:latest` tag by default. Make sure to push with this tag, not just a version tag like `:v1.0.0`.

#### Option B: Build via GitHub Actions

Push to the repository and let CI build images:

```bash
git add .
git commit -m "feat: initial deployment"
git push origin main
```

GitHub Actions will:
1. Build Docker images
2. Tag with commit SHA and `:latest`
3. Push to Artifact Registry
4. (With Argo CD) Trigger deployment

### 7.3 Run Database Migrations

#### Option 1: Via Cloud SQL Proxy (Local)

> **Note:** Cloud SQL is configured with **private IP only** by default. You must temporarily enable public IP to connect from your local machine.

**Step 1: Enable Public IP on Cloud SQL**

```bash
# Enable public IP
gcloud sql instances patch production-postgres --assign-ip --project=hta-platform-prod

# Get your public IP
curl ifconfig.me
# Or in PowerShell: (Invoke-WebRequest -Uri "https://ifconfig.me/ip").Content

# Authorize your IP (replace YOUR_PUBLIC_IP with the IP from above)
gcloud sql instances patch production-postgres --authorized-networks=YOUR_PUBLIC_IP/32 --project=hta-platform-prod
```

**Step 2: Install and Start Cloud SQL Proxy**

```bash
# Install Cloud SQL Proxy
# Windows: Download from https://cloud.google.com/sql/docs/postgres/sql-proxy#windows-64-bit
# Mac: brew install cloud-sql-proxy
# Or: gcloud components install cloud-sql-proxy

# Start proxy in a separate terminal
cloud-sql-proxy hta-platform-prod:asia-south1:production-postgres --port=5432

# Should show: "Listening on 127.0.0.1:5432"
```

**Step 3: Temporarily disable conflicting .env files**

Prisma loads `.env` and `.env.local` files which may override your DATABASE_URL:

```powershell
# PowerShell - rename conflicting files
cd C:\Users\kcsva\OneDrive\Documents\HTACalibr8s\hta-platform
Rename-Item packages\database\.env.local packages\database\.env.local.bak -ErrorAction SilentlyContinue
Rename-Item apps\web-hta\.env.local apps\web-hta\.env.local.bak -ErrorAction SilentlyContinue
Rename-Item apps\api\.env.local apps\api\.env.local.bak -ErrorAction SilentlyContinue
```

**Step 4: Push schema and run migrations**

```powershell
# Set DATABASE_URL environment variable
$env:DATABASE_URL="postgresql://hta_app:YOUR_PASSWORD@127.0.0.1:5432/hta_platform"

cd packages\database

# Option A: Push schema directly (first deployment, no migrations yet)
npx prisma db push

# Option B: Apply existing migrations (subsequent deployments)
npx prisma migrate deploy
```

> **Note:** Use `db push` for initial deployment when no migrations exist. Use `migrate deploy` for subsequent deployments with migration files.

**Step 5: Seed the database**

```powershell
# Seed is configured in apps/web-hta
cd C:\Users\kcsva\OneDrive\Documents\HTACalibr8s\hta-platform\apps\web-hta
npx prisma db seed
```

This creates initial data (admin user, default tenant, etc.).

**Step 6: Restore .env files and disable public IP**

```powershell
# Restore .env files
cd C:\Users\kcsva\OneDrive\Documents\HTACalibr8s\hta-platform
Rename-Item packages\database\.env.local.bak packages\database\.env.local -ErrorAction SilentlyContinue
Rename-Item apps\web-hta\.env.local.bak apps\web-hta\.env.local -ErrorAction SilentlyContinue
Rename-Item apps\api\.env.local.bak apps\api\.env.local -ErrorAction SilentlyContinue
```

```bash
# IMPORTANT: Disable public IP after migrations (security)
gcloud sql instances patch production-postgres --no-assign-ip --project=hta-platform-prod
```

#### Option 2: Via Kubernetes Job

```bash
# Create migration job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  namespace: hta-prod
spec:
  template:
    spec:
      serviceAccountName: api
      containers:
      - name: migrate
        image: asia-south1-docker.pkg.dev/hta-platform-prod/production-docker/hta-api:v1.0.0
        command: ["pnpm", "prisma", "migrate", "deploy"]
        envFrom:
        - secretRef:
            name: api-secrets
        - configMapRef:
            name: hta-config
      restartPolicy: Never
  backoffLimit: 3
EOF

# Check job status
kubectl get jobs -n hta-prod
kubectl logs job/db-migrate -n hta-prod

# Clean up after success
kubectl delete job db-migrate -n hta-prod
```

### 7.4 Deploy Applications

#### Apply Kubernetes Manifests

```bash
# From repo root - apply base manifests
kubectl apply -k infra/k8s/base

# Or apply production overlay (if exists)
kubectl apply -k infra/k8s/overlays/production
```

#### Restart Deployments (if images were updated)

```bash
# Force pods to pull new images
kubectl rollout restart deployment/hta-api -n hta-prod
kubectl rollout restart deployment/hta-web -n hta-prod
kubectl rollout restart deployment/hta-worker -n hta-prod

# Watch rollout progress
kubectl rollout status deployment/hta-api -n hta-prod
kubectl rollout status deployment/hta-web -n hta-prod
kubectl rollout status deployment/hta-worker -n hta-prod
```

### 7.5 Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n hta-prod
# All should show STATUS: Running, READY: 1/1

# Check services
kubectl get svc -n hta-prod

# Check Gateway and routes
kubectl get gateway,httproute -n hta-prod

# View API logs
kubectl logs -l app=hta-api -n hta-prod --tail=50

# View worker logs
kubectl logs -l app=hta-worker -n hta-prod --tail=50

# Test API health (port-forward if no external access yet)
kubectl port-forward svc/hta-api 8080:80 -n hta-prod
# Then: curl http://localhost:8080/health
```

### 7.6 Troubleshooting First Deployment

| Issue | Command | Fix |
|-------|---------|-----|
| ImagePullBackOff | `kubectl describe pod POD_NAME -n hta-prod` | Check image exists in Artifact Registry, verify image URL |
| CrashLoopBackOff | `kubectl logs POD_NAME -n hta-prod` | Check env vars, secrets, app errors |
| Pending | `kubectl describe pod POD_NAME -n hta-prod` | Check node resources, PVC issues |
| Secret not found | `kubectl get externalsecrets -n hta-prod` | Verify External Secrets synced |

```bash
# Detailed pod debugging
kubectl describe pod POD_NAME -n hta-prod

# Check events
kubectl get events -n hta-prod --sort-by='.lastTimestamp'

# Shell into running pod
kubectl exec -it deployment/hta-api -n hta-prod -- /bin/sh
```

---

## 8. Monitoring Setup

Terraform creates monitoring dashboards and alerts automatically. This section covers accessing and using them.

### 8.1 Access Dashboards

```bash
# Get dashboard URLs from Terraform
cd terraform/environments/production
terraform output dashboard_urls
```

Or access directly in GCP Console:
- **Services Overview**: [Cloud Monitoring → Dashboards](https://console.cloud.google.com/monitoring/dashboards?project=hta-platform-prod)
- **Logs**: [Cloud Logging](https://console.cloud.google.com/logs?project=hta-platform-prod)
- **Errors**: [Error Reporting](https://console.cloud.google.com/errors?project=hta-platform-prod)

### 8.2 Key Metrics to Monitor

| Metric | Location | Alert Threshold |
|--------|----------|-----------------|
| API Latency P95 | Services Dashboard | > 500ms |
| Error Rate | Services Dashboard | > 5% |
| DB Connections | Services Dashboard | > 80% of pool |
| Pod Restarts | Services Dashboard | > 3 in 5min |
| CPU/Memory | GKE Workloads | > 80% |

### 8.3 Configure Alert Notifications

```bash
# Create email notification channel
gcloud beta monitoring channels create \
  --display-name="HTA Alerts Email" \
  --type=email \
  --channel-labels=email_address=alerts@hta-calibration.com

# List channels (get the ID)
gcloud beta monitoring channels list --project=hta-platform-prod

# Add channel ID to terraform.tfvars
# monitoring_notification_channels = ["projects/hta-platform-prod/notificationChannels/CHANNEL_ID"]
```

### 8.4 View Logs

```bash
# API logs
kubectl logs -l app=hta-api -n hta-prod -f

# Worker logs  
kubectl logs -l app=hta-worker -n hta-prod -f

# Or use Cloud Logging with filters
# resource.type="k8s_container"
# resource.labels.namespace_name="hta-prod"
# resource.labels.container_name="api"
```

---

## 9. Argo CD Setup (GitOps)

Argo CD provides GitOps-based continuous deployment. Changes pushed to git are automatically synced to the cluster.

### 9.1 Install Argo CD

```bash
# Create namespace
kubectl create namespace argocd

# Install Argo CD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argocd-server -n argocd --timeout=300s
```

### 9.2 Access Argo CD UI

```bash
# Option 1: Port forward (for local access)
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Then open: https://localhost:8080

# Option 2: Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
# Username: admin
```

### 9.3 Configure Argo CD Application

```bash
# Apply the HTA application configuration
kubectl apply -f infra/k8s/base/argocd/application.yaml
```

Or create via CLI:

```bash
# Install argocd CLI
# Windows: choco install argocd-cli
# Mac: brew install argocd

# Login
argocd login localhost:8080 --insecure

# Add application
argocd app create hta-platform \
  --repo https://github.com/pavan-kvsn1/hta-platform.git \
  --path infra/k8s/overlays/production \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace hta-prod \
  --sync-policy automated \
  --auto-prune \
  --self-heal
```

### 9.4 GitOps Workflow

Once configured, deployments work like this:

1. **Push code** to `main` branch
2. **GitHub Actions** builds Docker images, pushes to Artifact Registry
3. **GitHub Actions** updates image tags in `infra/k8s/overlays/production/kustomization.yaml`
4. **Argo CD** detects the change and syncs to cluster
5. **Argo CD** performs rolling update of deployments

### 9.5 Useful Argo CD Commands

```bash
# Check app status
argocd app get hta-platform

# Sync manually
argocd app sync hta-platform

# View sync history
argocd app history hta-platform

# Rollback to previous version
argocd app rollback hta-platform

# View in UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

### 9.6 Troubleshooting Argo CD

> **WARNING:** NEVER delete an ArgoCD Application when workloads are running. Deleting the app with `prune: true` will delete ALL managed resources including deployments, causing downtime.

#### Get Admin Password (PowerShell)

```powershell
# PowerShell doesn't have base64 command - use this instead:
$encoded = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))
```

#### Force Refresh (Clear Cache)

When ArgoCD shows stale/cached errors after pushing changes:

```bash
# Option 1: Use the UI - click "Refresh" then "Hard Refresh"

# Option 2: Via kubectl (Linux/Mac)
kubectl -n argocd patch application hta-platform --type merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'

# Option 2: Via kubectl (PowerShell)
kubectl -n argocd patch application hta-platform --type merge `
  -p "{`"metadata`":{`"annotations`":{`"argocd.argoproj.io/refresh`":`"hard`"}}}"

# Option 3: Delete the annotation and let it resync
kubectl -n argocd annotate application hta-platform argocd.argoproj.io/refresh-
```

#### App Stuck in "Unknown" Sync Status

Usually means kustomize build failed. Check the error:

```bash
kubectl -n argocd describe application hta-platform | grep -A5 "Message:"
```

Common causes:
- **Duplicate resource IDs**: Two files define the same resource (e.g., ServiceAccount with same name)
- **Invalid kustomization.yaml**: Missing resources, wrong paths
- **Deprecated fields**: `commonLabels` should be `labels` with `pairs`

Fix by updating the kustomization files and pushing to Git. Then force refresh.

#### App Stuck in "OutOfSync" with Immutable Field Error

```
Deployment.apps "xxx" is invalid: spec.selector: Invalid value: field is immutable
```

The deployment's label selector changed. You must delete the old deployment first:

```bash
# Delete the specific deployment (NOT the ArgoCD app!)
kubectl delete deployment hta-api hta-web hta-worker -n hta-platform

# ArgoCD will automatically recreate them with correct selectors
```

#### Application Deletion Stuck

If you accidentally started deleting an app and it's stuck:

```bash
# Check if app has deletion timestamp
kubectl -n argocd get application hta-platform -o yaml | grep deletionTimestamp

# Remove the finalizer to force deletion (LAST RESORT - will orphan resources)
kubectl -n argocd patch application hta-platform --type json \
  -p '[{"op":"remove","path":"/metadata/finalizers"}]'

# PowerShell version:
kubectl -n argocd patch application hta-platform --type json `
  -p "[{`"op`":`"remove`",`"path`":`"/metadata/finalizers`"}]"
```

#### Namespace Stuck in Terminating

If a namespace won't delete due to stuck finalizers:

```bash
# Find what's blocking deletion
kubectl get namespace hta-platform -o json | grep -A5 "finalizersRemaining"

# Find resources with finalizers
kubectl api-resources --verbs=list --namespaced -o name | xargs -I {} kubectl get {} -n hta-platform --ignore-not-found 2>/dev/null

# Remove finalizer from stuck resource (example: NEG)
kubectl patch servicenetworkendpointgroup RESOURCE_NAME -n hta-platform \
  -p '{"metadata":{"finalizers":null}}' --type=merge
```

#### Safe Recovery After Disaster

If workloads are down and you need to recover:

```bash
# 1. Create namespace if deleted
kubectl create namespace hta-platform

# 2. Apply service accounts
kubectl apply -f k8s/service-accounts.yaml

# 3. Verify secrets exist (from External Secrets)
kubectl get secrets -n hta-platform

# 4. Create ConfigMap if missing
kubectl create configmap hta-config -n hta-platform \
  --from-literal=NODE_ENV=production \
  --from-literal=LOG_LEVEL=info \
  --from-literal=NEXTAUTH_URL=https://app.hta-calibration.com \
  --from-literal=API_URL=http://hta-api:80

# 5. Apply ArgoCD application (will recreate all resources)
kubectl apply -f infra/k8s/base/argocd/application.yaml

# 6. Watch for sync
kubectl -n argocd get applications -w
```

---

## 10. Verification & Testing

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

## 11. Post-Deployment Checklist

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

## 12. Troubleshooting

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

### Worker Pod Keeps Restarting

If the worker pod shows `0/1 Running` with increasing restarts but logs show successful cleanup:

```bash
kubectl logs -l app=hta-worker -n hta-prod --tail=20
# Shows: "[Cleanup] Scheduled cleanup complete: tokens: 0 deleted..."
# But pod keeps restarting
```

**Cause:** Startup probe pattern doesn't match the actual process name.

Check the startup probe:
```bash
kubectl get deployment hta-worker -n hta-prod -o jsonpath='{.spec.template.spec.containers[0].startupProbe}'
```

The probe pattern must match the actual CMD in the Dockerfile:
- **Dockerfile CMD:** `node apps/worker/dist/index.js`
- **Probe pattern:** `pgrep -f "node apps/worker/dist/index.js"`

If they don't match, fix the deployment:
```bash
kubectl patch deployment hta-worker -n hta-prod --type='json' \
  -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/startupProbe/exec/command", "value": ["/bin/sh", "-c", "pgrep -f \"node apps/worker/dist/index.js\" > /dev/null"]}]'
```

### Database Connection Failed

```bash
# Test from a pod
kubectl run -it --rm debug --image=postgres:15 -n hta-prod -- \
  psql "postgresql://hta_app:PASSWORD@CLOUD_SQL_IP:5432/hta_prod?sslmode=require"

# Check Cloud SQL
gcloud sql instances describe production-postgres --project=$PROJECT_ID

# Common issues:
# - Wrong IP (use private IP)
# - Firewall blocking
# - Wrong credentials
# - Missing ?sslmode=require in DATABASE_URL
```

#### SSL/TLS Errors

**Error:** `connection requires a valid client certificate`

This means Cloud SQL has `TRUSTED_CLIENT_CERTIFICATE_REQUIRED` mode enabled (mTLS). Fix by changing to `ENCRYPTED_ONLY`:

```bash
gcloud sql instances patch production-postgres \
  --project=$PROJECT_ID \
  --ssl-mode=ENCRYPTED_ONLY
```

**Error:** `User was denied access on the database "(not available)"`

This Prisma error usually means:
1. DATABASE_URL is missing `?sslmode=require`
2. SSL connection failed silently

Fix by updating the secret:
```bash
# Add ?sslmode=require to DATABASE_URL
echo -n "postgresql://user:pass@host:5432/db?sslmode=require" | \
  gcloud secrets versions add database-url --data-file=-

# Force External Secrets to resync
kubectl annotate externalsecret worker-secrets -n hta-prod force-sync=$(date +%s) --overwrite

# Restart pods to pick up new secret
kubectl rollout restart deployment/hta-worker -n hta-prod
```

### Redis Connection Failed

```bash
# Test from a pod (note: rediss:// for TLS)
kubectl run -it --rm debug --image=redis:7 -n hta-prod -- \
  redis-cli -h REDIS_IP -p 6378 --tls --insecure ping

# Check Memorystore
gcloud redis instances describe production-redis --region=$REGION
```

#### BullMQ Eviction Policy Warning

**Warning:** `IMPORTANT! Eviction policy is volatile-lru. It should be "noeviction"`

BullMQ requires `noeviction` policy to prevent job data loss. Fix:

```bash
gcloud redis instances update production-redis \
  --region=asia-south1 \
  --update-redis-config=maxmemory-policy=noeviction

# Restart workers to clear the warning
kubectl rollout restart deployment/hta-worker -n hta-prod
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

### External Secrets Not Syncing

```bash
# Check ExternalSecret status
kubectl get externalsecrets -n hta-prod
# Look for STATUS: SecretSyncedError

# Get detailed error message
kubectl describe externalsecret api-secrets -n hta-prod | tail -20

# Common issues and fixes:

# 1. Permission denied - operator SA needs Secret Manager access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:external-secrets@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 2. Workload Identity not working - check SA annotation
kubectl get sa external-secrets -n external-secrets -o yaml | grep annotations -A2

# 3. Secret has no version (empty) - add a value
gcloud secrets versions list SECRET_NAME --project=$PROJECT_ID
# If "Listed 0 items", add a value:
echo -n "your-secret-value" | gcloud secrets versions add SECRET_NAME --data-file=-

# 4. Force resync after fixing
kubectl annotate externalsecret api-secrets -n hta-prod force-sync=$(date +%s) --overwrite

# 5. Restart operator if still stuck
kubectl rollout restart deployment external-secrets -n external-secrets
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
kubectl get secret api-secrets -n hta-prod -o jsonpath='{.data.DATABASE_URL}' | base64 -d

# --- External Secrets ---
kubectl get externalsecrets -n hta-prod                    # Check sync status
kubectl describe externalsecret api-secrets -n hta-prod    # Debug sync issues
kubectl annotate externalsecret api-secrets -n hta-prod force-sync=$(date +%s) --overwrite  # Force resync
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
