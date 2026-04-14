# Kubernetes Manifests

## Directory Structure

```
infra/k8s/
├── base/                      # Base resources
│   ├── kustomization.yaml     # Standard deployments
│   ├── gateway.yaml           # GKE Gateway API
│   ├── argo-rollouts/         # Argo Rollouts controller
│   └── rollouts/              # Rollout resources (alternative to deployments)
│
└── overlays/
    └── production/
        ├── kustomization.yaml
        └── canary-httproute.yaml
```

## Deployment Options

### Option 1: Standard Deployments (Manual Canary)

Uses Kubernetes Deployments with manual `kubectl patch` for traffic shifting.

```bash
# Deploy
kubectl apply -k infra/k8s/overlays/production

# Manual canary process
kubectl apply -f infra/k8s/overlays/production/api-canary-deployment.yaml
kubectl apply -f infra/k8s/overlays/production/canary-httproute.yaml
kubectl patch httproute hta-api-canary -n hta-platform --type=merge -p '...'
```

### Option 2: Argo Rollouts (Automated Canary)

Uses Argo Rollouts for automated progressive delivery.

```bash
# 1. Install Argo Rollouts controller
kubectl apply -k infra/k8s/base/argo-rollouts

# 2. Verify installation
kubectl get pods -n argo-rollouts
# Expected: argo-rollouts-xxxxx Running

# 3. Install kubectl plugin (optional but recommended)
# macOS
brew install argoproj/tap/kubectl-argo-rollouts

# Linux
curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
chmod +x kubectl-argo-rollouts-linux-amd64
sudo mv kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo-rollouts

# Windows
# Download from: https://github.com/argoproj/argo-rollouts/releases

# 4. Deploy with Rollouts (instead of standard Deployments)
kubectl apply -k infra/k8s/base/rollouts

# 5. Watch rollout progress
kubectl argo rollouts get rollout hta-api -n hta-platform --watch
```

## Argo Rollouts Commands

```bash
# View rollout status
kubectl argo rollouts get rollout hta-api -n hta-platform

# Watch rollout progress (live)
kubectl argo rollouts get rollout hta-api -n hta-platform --watch

# Manually promote canary to next step
kubectl argo rollouts promote hta-api -n hta-platform

# Skip all remaining steps (full promotion)
kubectl argo rollouts promote hta-api -n hta-platform --full

# Abort rollout (rollback)
kubectl argo rollouts abort hta-api -n hta-platform

# Retry aborted rollout
kubectl argo rollouts retry rollout hta-api -n hta-platform

# Open dashboard (local)
kubectl argo rollouts dashboard -n hta-platform
# Then open http://localhost:3100
```

## Rollout Flow Visualization

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ARGO ROLLOUT FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   kubectl set image rollout/hta-api api=hta-api:v2.0                │
│                          │                                           │
│                          ▼                                           │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  Step 1: setWeight: 10                                    │      │
│   │  ┌─────────┐                           ┌─────────┐       │      │
│   │  │ Stable  │ 90% ◄─── Traffic ───► 10% │ Canary  │       │      │
│   │  │ (v1.0)  │                           │ (v2.0)  │       │      │
│   │  └─────────┘                           └─────────┘       │      │
│   │  pause: 5m (waiting...)                                   │      │
│   └──────────────────────────────────────────────────────────┘      │
│                          │                                           │
│                          ▼ (auto after 5m)                          │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  Step 2: setWeight: 25                                    │      │
│   │  Stable: 75% ◄─── Traffic ───► 25% Canary                │      │
│   │  pause: 10m                                               │      │
│   └──────────────────────────────────────────────────────────┘      │
│                          │                                           │
│                          ▼ (auto after 10m)                         │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  Step 3: setWeight: 50                                    │      │
│   │  Stable: 50% ◄─── Traffic ───► 50% Canary                │      │
│   │  pause: 15m                                               │      │
│   └──────────────────────────────────────────────────────────┘      │
│                          │                                           │
│                          ▼ (auto after 15m)                         │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  Step 4: setWeight: 75                                    │      │
│   │  Stable: 25% ◄─── Traffic ───► 75% Canary                │      │
│   │  pause: 10m                                               │      │
│   └──────────────────────────────────────────────────────────┘      │
│                          │                                           │
│                          ▼ (auto after 10m)                         │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  PROMOTED                                                 │      │
│   │  ┌─────────┐                                             │      │
│   │  │ Stable  │ 100% ◄─── All Traffic                       │      │
│   │  │ (v2.0)  │                                             │      │
│   │  └─────────┘                                             │      │
│   │  (Old v1.0 ReplicaSet scaled down)                       │      │
│   └──────────────────────────────────────────────────────────┘      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

ROLLBACK (if error detected):
┌─────────────────────────────────────────────────────────────────────┐
│  kubectl argo rollouts abort hta-api -n hta-platform                │
│                          │                                           │
│                          ▼                                           │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  ABORTED - Traffic shifted back to stable                 │      │
│   │  Stable: 100% ◄─── All Traffic                           │      │
│   │  Canary: 0% (scaled down)                                 │      │
│   └──────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

## Switching Between Standard and Argo Rollouts

The base kustomization uses standard Deployments. To use Argo Rollouts:

1. Delete the standard API deployment:
   ```bash
   kubectl delete deployment hta-api -n hta-platform
   ```

2. Apply the Rollout:
   ```bash
   kubectl apply -f infra/k8s/base/rollouts/api-rollout.yaml
   ```

**Note:** Don't run both simultaneously for the same service.
