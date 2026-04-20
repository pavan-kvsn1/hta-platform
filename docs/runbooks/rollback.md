# Rollback Runbook

**Last Updated:** 2026-04-16

This runbook describes how to perform rollbacks for the HTA Platform.

## Quick Reference

| Scenario | Time | Command/Action |
|----------|------|----------------|
| Canary issues | < 2 min | `./scripts/rollback-immediate.sh all --canary` |
| Bad deployment | < 5 min | `./scripts/rollback-immediate.sh all --rollback` |
| Full rollback | < 30 min | `./scripts/rollback-full.sh` |
| Migration issues | < 30 min | `./scripts/rollback-full.sh --migrate-rollback` |

## Rollback Triggers

Initiate rollback if ANY of these conditions are met:

| Condition | Threshold | Duration |
|-----------|-----------|----------|
| Error rate | > 5% | 5 minutes |
| API latency p95 | > 500ms | 10 minutes |
| Critical functionality broken | Any | Immediate |
| Data integrity issues | Any | Immediate |
| Pod crash loops | > 3 pods | 5 minutes |

## Decision Tree

```
Is it a canary deployment issue?
├── Yes → Shift traffic away from canary
│         ./scripts/rollback-immediate.sh all --canary
│
└── No → Is the deployment itself broken?
         ├── Yes → Rollback to previous revision
         │         ./scripts/rollback-immediate.sh all --rollback
         │
         └── No → Is it a database/migration issue?
                  ├── Yes → Full rollback with migration
                  │         ./scripts/rollback-full.sh --migrate-rollback
                  │
                  └── No → Need to go back to monolith?
                           ├── Yes → ./scripts/rollback-full.sh --to-monolith
                           └── No → Investigate further
```

## Immediate Rollback (< 5 minutes)

### Option 1: Shift Canary Traffic

Use when: Canary deployment is causing issues, stable deployment is healthy.

```bash
# Via script
./scripts/rollback-immediate.sh all --canary

# Or via GitHub Actions
# Go to Actions → Rollback → Run workflow
# Select: rollback_type=canary-only, service=all
```

Manual kubectl commands:
```bash
# Shift API traffic
kubectl patch httproute hta-api-canary -n hta-platform --type=merge -p '
{
  "spec": {
    "rules": [{
      "backendRefs": [
        {"name": "hta-api-canary", "weight": 0},
        {"name": "hta-api", "weight": 100}
      ]
    }]
  }
}'

# Scale down canary
kubectl scale deployment hta-api-canary -n hta-platform --replicas=0
```

### Option 2: Rollback Deployment

Use when: Current deployment is broken, need to revert to previous version.

```bash
# Via script
./scripts/rollback-immediate.sh all --rollback

# Or via kubectl
kubectl rollout undo deployment/hta-api -n hta-platform
kubectl rollout undo deployment/hta-worker -n hta-platform

# Rollback to specific revision
kubectl rollout undo deployment/hta-api -n hta-platform --to-revision=5
```

### Option 3: Scale Down Completely

Use when: Need to stop all traffic immediately.

```bash
# Scale down canary and shift traffic
./scripts/rollback-immediate.sh all --scale-down

# Or manually
kubectl scale deployment hta-api-canary -n hta-platform --replicas=0
kubectl scale deployment hta-worker-canary -n hta-platform --replicas=0
```

## Full Rollback (< 30 minutes)

### Standard Full Rollback

```bash
./scripts/rollback-full.sh
```

This will:
1. Create a state backup
2. Shift all canary traffic to 0%
3. Rollback all GKE deployments
4. Verify health

### With Migration Rollback

```bash
./scripts/rollback-full.sh --migrate-rollback
```

This additionally:
- Runs `pnpm db:migrate:rollback`

### To Monolith

Use when: Need to completely abandon the separated architecture.

```bash
./scripts/rollback-full.sh --to-monolith
```

This additionally:
- Redeploys the Cloud Run monolith
- Scales down GKE API
- Requires manual DNS update

## Verification Steps

After any rollback, verify:

### 1. Check Pod Health
```bash
kubectl get pods -n hta-platform
# All pods should be Running/Ready
```

### 2. Check Deployments
```bash
kubectl get deployments -n hta-platform
# All deployments should show desired = available
```

### 3. Check Logs
```bash
# API logs
kubectl logs -n hta-platform -l app=hta-api --tail=100

# Worker logs
kubectl logs -n hta-platform -l app=hta-worker --tail=100
```

### 4. Health Endpoints
```bash
# Port forward and check health
kubectl port-forward -n hta-platform svc/hta-api 4000:4000 &
curl http://localhost:4000/health
```

### 5. Functional Test
- Log into the application
- Create a test certificate (or use staging data)
- Verify core workflows

## Monitoring During Rollback

Keep these dashboards open:
- **GCP Console**: GKE Workloads
- **Sentry**: Error tracking
- **Cloud Logging**: Application logs

Key queries:
```
# Errors in Cloud Logging
resource.type="k8s_container"
resource.labels.namespace_name="hta-platform"
severity>=ERROR

# API requests
resource.type="k8s_container"
labels."k8s-pod/app"="hta-api"
```

## Rollback History

View deployment history:
```bash
kubectl rollout history deployment/hta-api -n hta-platform
kubectl rollout history deployment/hta-worker -n hta-platform
```

## Escalation

If rollback fails or issues persist:

1. **On-call Engineer**: Attempt manual rollback
2. **Platform Lead**: If automated rollback fails
3. **CTO**: If data integrity issues or extended outage

Contact channels:
- Slack: #hta-platform-alerts
- Email: platform-oncall@htacalibration.com

## Post-Incident

After successful rollback:

1. **Communicate**: Update status page, notify stakeholders
2. **Document**: Create incident report
3. **Investigate**: Root cause analysis
4. **Prevent**: Add tests/monitoring to catch similar issues

## Common Issues

### Rollback Stuck

```bash
# Force rollout restart
kubectl rollout restart deployment/hta-api -n hta-platform

# Or delete problematic pods
kubectl delete pods -n hta-platform -l app=hta-api --force
```

### Migration Rollback Fails

```bash
# Check migration status
pnpm prisma migrate status

# Manual rollback
pnpm prisma migrate resolve --rolled-back <migration_name>
```

### Cannot Connect to Cluster

```bash
# Re-authenticate
gcloud auth login
gcloud container clusters get-credentials <cluster> --zone <zone>
```

## Related Documentation

- [Disaster Recovery](../dr/README.md)
- [Monitoring & Alerting](../monitoring.md)
- [Deployment Guide](../deployment.md)
