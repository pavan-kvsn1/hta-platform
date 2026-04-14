# GitHub Secrets Configuration

This document lists all secrets required for CI/CD workflows.

## Required Secrets

### Google Cloud Platform

| Secret | Description | How to get |
|--------|-------------|------------|
| `GCP_PROJECT_ID` | GCP project ID | `gcloud config get-value project` |
| `GKE_CLUSTER_NAME` | GKE cluster name | `gcloud container clusters list` |
| `GKE_ZONE` | GKE cluster zone/region | e.g., `asia-south1-a` |
| `WIF_PROVIDER` | Workload Identity Federation provider | See setup below |
| `WIF_SERVICE_ACCOUNT` | Service account for WIF | e.g., `github-actions@PROJECT.iam.gserviceaccount.com` |

### Optional Secrets

| Secret | Description | Used by |
|--------|-------------|---------|
| `API_HEALTH_URL` | API health check URL | Post-deploy verification |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | Failure alerts |

## Workload Identity Federation Setup

1. Create a service account:
```bash
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"
```

2. Grant permissions:
```bash
# Artifact Registry
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# GKE
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/container.developer"
```

3. Create Workload Identity Pool:
```bash
gcloud iam workload-identity-pools create "github-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

4. Allow GitHub repo to impersonate SA:
```bash
gcloud iam service-accounts add-iam-policy-binding \
  github-actions@$PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_ORG/hta-platform"
```

5. Get the WIF provider string:
```bash
echo "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
```

## Adding Secrets to GitHub

1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add each secret from the tables above

## Verifying Setup

Run the deploy workflow manually to verify:

1. Go to Actions → Deploy to GKE
2. Click "Run workflow"
3. Check logs for any authentication errors
