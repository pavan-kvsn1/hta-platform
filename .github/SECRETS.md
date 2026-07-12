# GitHub Production Deployment Configuration

The production deployment is manual and is defined in `.github/workflows/deploy.yml`.
It builds API, web, worker, and database migrator images, runs Prisma migrations,
and then deploys all application workloads to GKE.

## Required Repository Secrets

| Secret | Value |
| --- | --- |
| `WIF_PROVIDER` | Full Google Workload Identity Provider resource name |
| `WIF_SERVICE_ACCOUNT` | GitHub Actions service account email |

Do not store service account JSON keys. The workflow uses Workload Identity
Federation and requests an OIDC token through `id-token: write`.

## Repository Variables

The workflow has the current production values as defaults. Add repository
variables only when a value needs to differ from these defaults.

| Variable | Default |
| --- | --- |
| `GCP_PROJECT_ID` | `hta-platform-prod` |
| `GKE_CLUSTER_NAME` | `production-cluster` |
| `GKE_LOCATION` | `asia-south1-b` |
| `GAR_LOCATION` | `asia-south1` |
| `GAR_REPOSITORY` | `production-docker` |
| `K8S_NAMESPACE` | `hta-platform` |
| `CLOUD_SQL_INSTANCE` | `hta-platform-prod:asia-south1:production-postgres` |
| `API_HEALTH_URL` | Optional external API health endpoint; the existing secret is also supported |

## Production Environment

The GitHub environment `production` is configured with a `main`-only deployment branch policy. Also configure:

1. Required reviewers for production approval.
2. Deployment branch rule restricted to `main`.
3. Prevent administrators from bypassing protection rules where appropriate.

The workflow also rejects non-`main` runs and requires the
`confirm_production` checkbox.

## Google Cloud Access

The WIF service account needs:

- Artifact Registry write access to `production-docker`.
- GKE credentials and Kubernetes RBAC for the `hta-platform` namespace.
- Permission to create and inspect Jobs and patch Deployments.
- Workload Identity binding from the Kubernetes `api` service account to a
  Google service account with Cloud SQL Client access.

The existing `api-secrets` Kubernetes Secret must contain the production
`DATABASE_URL`. The migration image connects through Cloud SQL Auth Proxy.

## Running A Deployment

1. Merge and push the intended commit to `main`.
2. Open GitHub Actions and select `Deploy to GKE`.
3. Select the `main` branch.
4. Check `Confirm deployment to production`.
5. Run the workflow and approve the `production` environment gate.

A successful run builds immutable SHA-tagged images, completes database
migrations, deploys API, worker, and web, and waits for every rollout. The
workflow also publishes `latest` tags for operator convenience, but GKE is
deployed with the immutable commit SHA.
