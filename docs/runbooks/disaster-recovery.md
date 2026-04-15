# Disaster Recovery Runbook

**Last Updated:** 2024-04-15  
**Owner:** Platform Team  
**Review Cycle:** Quarterly

---

## Quick Reference

| Item | Value |
|------|-------|
| **RTO** | 1 hour |
| **RPO** | 1 hour (5 min with PITR) |
| **Primary Region** | asia-south1 |
| **DR Region** | us-west1 |
| **Backup Schedule** | Daily at 03:00 UTC |
| **PITR Window** | 7 days |
| **Backup Retention** | 30 days |

---

## Contact Information

| Role | Contact |
|------|---------|
| On-Call Engineer | PagerDuty (hta-platform service) |
| Platform Lead | [Insert contact] |
| Database Admin | [Insert contact] |
| Incident Commander | [Insert contact] |

---

## Scenario Playbooks

### 1. Database Corruption

**Symptoms:**
- Application errors mentioning data integrity
- PostgreSQL error logs showing corruption
- Unexpected null values or missing data

**Response:**

```bash
# 1. Assess impact
gcloud sql operations list --instance=production-postgres --limit=10

# 2. Identify last known good state
gcloud sql backups list --instance=production-postgres --limit=5

# 3. Restore to point-in-time (before corruption)
./scripts/dr-restore.sh --pitr "2024-01-15T10:30:00Z"

# 4. Verify restored data
# Connect via Cloud SQL Proxy and run verification queries

# 5. Update application configuration to new instance (if needed)
```

**Estimated Recovery Time:** 30-45 minutes

---

### 2. Region Failure

**Symptoms:**
- All services in primary region unavailable
- GCP status page shows region incident
- Monitoring shows complete loss of connectivity

**Response:**

```bash
# 1. Confirm region failure (check GCP status)
# https://status.cloud.google.com/

# 2. Promote replica to primary
gcloud sql instances promote-replica production-postgres-replica \
  --project=hta-calibration-prod

# 3. Update DNS / Load Balancer to point to DR region
# (This should be automated via Cloud DNS health checks)

# 4. Deploy application to DR region GKE cluster
kubectl config use-context gke_hta-calibration-prod_us-west1_production-dr
kubectl apply -f k8s/

# 5. Verify services
curl https://api-dr.htacalibr8s.com/health
```

**Estimated Recovery Time:** 15-30 minutes

---

### 3. Accidental Data Deletion

**Symptoms:**
- User reports missing data
- Audit logs show delete operation
- Data not in expected tables

**Response:**

```bash
# 1. Stop the bleeding - identify and revoke access if malicious

# 2. For GCS objects - restore from versioning
gsutil ls -a gs://hta-calibr8s-certificates/path/to/deleted/file
gsutil cp gs://hta-calibr8s-certificates/path/to/file#<version> gs://hta-calibr8s-certificates/path/to/file

# 3. For database records - restore to test instance
./scripts/dr-restore.sh --test <backup_id>

# 4. Connect to test instance, export needed records
pg_dump -h <test-instance-ip> -U hta_app -t certificates --data-only hta_platform > recovery.sql

# 5. Import to production (carefully!)
psql -h <production-ip> -U hta_app hta_platform < recovery.sql
```

**Estimated Recovery Time:** 10-30 minutes (depending on data volume)

---

### 4. Security Breach

**Symptoms:**
- Unusual access patterns in logs
- Unauthorized data access detected
- Security alert from monitoring

**Response:**

```bash
# 1. IMMEDIATELY - Isolate affected systems
gcloud sql instances patch production-postgres \
  --activation-policy=NEVER

# 2. Rotate all credentials
# - Database passwords
# - API keys
# - JWT secrets
./scripts/rotate-secrets.sh  # If available

# 3. Review audit logs
gcloud logging read "resource.type=cloudsql_database" --limit=1000

# 4. Identify breach timeline

# 5. Restore from backup BEFORE breach occurred
./scripts/dr-restore.sh --pitr "<timestamp-before-breach>"

# 6. Document incident for post-mortem
```

**Estimated Recovery Time:** 2-4 hours (including investigation)

---

## DR Drill Procedure

Monthly drills are required to validate DR capability.

### Pre-Drill Checklist

- [ ] Schedule drill (avoid peak hours)
- [ ] Notify stakeholders
- [ ] Document current data counts for verification
- [ ] Ensure backup is recent (< 24 hours)

### Drill Execution

```bash
# Run automated drill
./scripts/dr-drill.sh

# Or run manually:
# 1. List backups
./scripts/dr-restore.sh --list

# 2. Restore to test instance
./scripts/dr-restore.sh --test <latest_backup_id>

# 3. Verify data counts match
# 4. Test application connectivity
# 5. Document results
```

### Post-Drill Checklist

- [ ] Review drill report in `dr-reports/`
- [ ] Update this runbook if issues found
- [ ] File any remediation tickets
- [ ] Record drill completion in audit log

---

## Infrastructure Details

### Cloud SQL

| Setting | Value |
|---------|-------|
| Instance | production-postgres |
| Version | PostgreSQL 16 |
| Tier | db-custom-2-4096 |
| HA | REGIONAL (automatic failover) |
| Backups | Daily, 30-day retention |
| PITR | Enabled, 7-day window |
| Replica | production-postgres-replica (us-west1) |

### GCS Buckets

| Bucket | Location | Versioning |
|--------|----------|------------|
| hta-calibr8s-certificates | US (multi-region) | Enabled |
| hta-calibr8s-uploads | ASIA (multi-region) | Enabled |

### Monitoring Alerts

| Alert | Threshold | Action |
|-------|-----------|--------|
| Backup Failure | Any | Page on-call |
| Replica Lag | > 60s | Investigate |
| Disk Usage | > 80% | Scale/archive |
| No Backup | > 25 hours | Page + manual backup |

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/dr-restore.sh` | Restore from backup or PITR |
| `scripts/dr-drill.sh` | Automated DR drill |

### Environment Variables

```bash
export PROJECT_ID="hta-calibration-prod"
export INSTANCE_NAME="production-postgres"
export DATABASE_NAME="hta_platform"
export REGION="asia-south1"
```

---

## Escalation Matrix

| Severity | Response Time | Escalation |
|----------|---------------|------------|
| SEV1 (Complete outage) | Immediate | Page all + incident commander |
| SEV2 (Degraded service) | 15 minutes | Page on-call engineer |
| SEV3 (Potential issue) | 1 hour | Slack notification |

---

## Post-Incident

After any DR event:

1. **Incident Report** - Document timeline, impact, root cause
2. **Post-Mortem** - Schedule within 48 hours
3. **Action Items** - Create tickets for improvements
4. **Runbook Update** - Update this document if needed
5. **Communication** - Notify affected customers if applicable

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2024-04-15 | Platform Team | Initial version |
