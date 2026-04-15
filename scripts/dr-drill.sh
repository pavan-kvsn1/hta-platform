#!/bin/bash
# =============================================================================
# HTA Calibr8s - Disaster Recovery Drill Script
# =============================================================================
#
# Automated DR drill that tests backup restore and data integrity.
# Should be run monthly as per DR checklist.
#
# Usage:
#   ./dr-drill.sh                    # Interactive drill
#   ./dr-drill.sh --automated        # Non-interactive (for CI/CD)
#   ./dr-drill.sh --report-only      # Generate report from last drill
#
# =============================================================================

set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-hta-calibration-prod}"
INSTANCE_NAME="${INSTANCE_NAME:-hta-main}"
DATABASE_NAME="${DATABASE_NAME:-hta_calibration}"
REPORT_DIR="./dr-reports"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Drill state
DRILL_ID="dr-drill-$(date +%Y%m%d-%H%M%S)"
DRILL_START=""
DRILL_INSTANCE=""
DRILL_RESULTS=()

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; DRILL_RESULTS+=("PASS: $1"); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; DRILL_RESULTS+=("FAIL: $1"); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; DRILL_RESULTS+=("WARN: $1"); }

# Initialize drill
init_drill() {
  DRILL_START=$(date +%s)
  mkdir -p "$REPORT_DIR"

  echo ""
  echo "=============================================="
  echo "  HTA Calibr8s - DR Drill"
  echo "  ID: $DRILL_ID"
  echo "  Date: $(date)"
  echo "=============================================="
  echo ""
}

# Step 1: Check prerequisites
check_prerequisites() {
  log_info "Step 1: Checking prerequisites..."

  # Check gcloud
  if command -v gcloud &> /dev/null; then
    log_success "gcloud CLI available"
  else
    log_fail "gcloud CLI not found"
    return 1
  fi

  # Check authentication
  if gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1 &> /dev/null; then
    log_success "gcloud authenticated"
  else
    log_fail "gcloud not authenticated"
    return 1
  fi

  # Check project access
  if gcloud projects describe "$PROJECT_ID" &> /dev/null; then
    log_success "Project $PROJECT_ID accessible"
  else
    log_fail "Cannot access project $PROJECT_ID"
    return 1
  fi

  # Check instance exists
  if gcloud sql instances describe "$INSTANCE_NAME" --project="$PROJECT_ID" &> /dev/null; then
    log_success "Instance $INSTANCE_NAME exists"
  else
    log_fail "Instance $INSTANCE_NAME not found"
    return 1
  fi
}

# Step 2: Get latest backup
get_latest_backup() {
  log_info "Step 2: Identifying latest backup..."

  local backup_info
  backup_info=$(gcloud sql backups list \
    --instance="$INSTANCE_NAME" \
    --project="$PROJECT_ID" \
    --filter="status=SUCCESSFUL" \
    --format="value(id,windowStartTime)" \
    --limit=1)

  if [[ -n "$backup_info" ]]; then
    local backup_id
    backup_id=$(echo "$backup_info" | cut -f1)
    local backup_time
    backup_time=$(echo "$backup_info" | cut -f2)
    log_success "Latest backup: $backup_id ($backup_time)"
    echo "$backup_id"
  else
    log_fail "No successful backups found"
    return 1
  fi
}

# Step 3: Create test instance
create_test_instance() {
  local backup_id="$1"

  log_info "Step 3: Creating test instance..."

  DRILL_INSTANCE="hta-drill-$(date +%Y%m%d%H%M)"

  # Clone instance
  log_info "Cloning instance structure..."
  if gcloud sql instances clone "$INSTANCE_NAME" "$DRILL_INSTANCE" \
    --project="$PROJECT_ID" 2>/dev/null; then
    log_success "Instance $DRILL_INSTANCE created"
  else
    log_fail "Failed to create test instance"
    return 1
  fi

  # Wait for instance to be ready
  log_info "Waiting for instance to be ready..."
  local max_wait=600  # 10 minutes
  local waited=0

  while [[ $waited -lt $max_wait ]]; do
    local status
    status=$(gcloud sql instances describe "$DRILL_INSTANCE" \
      --project="$PROJECT_ID" \
      --format="value(state)" 2>/dev/null || echo "PENDING")

    if [[ "$status" == "RUNNABLE" ]]; then
      log_success "Instance ready"
      break
    fi

    sleep 10
    waited=$((waited + 10))
  done

  if [[ $waited -ge $max_wait ]]; then
    log_fail "Instance creation timed out"
    return 1
  fi
}

# Step 4: Restore backup
restore_backup() {
  local backup_id="$1"

  log_info "Step 4: Restoring backup $backup_id..."

  local restore_start
  restore_start=$(date +%s)

  if gcloud sql backups restore "$backup_id" \
    --restore-instance="$DRILL_INSTANCE" \
    --project="$PROJECT_ID" \
    --quiet 2>/dev/null; then

    # Wait for restore
    log_info "Waiting for restore to complete..."
    local max_wait=1800  # 30 minutes
    local waited=0

    while [[ $waited -lt $max_wait ]]; do
      local status
      status=$(gcloud sql operations list \
        --instance="$DRILL_INSTANCE" \
        --project="$PROJECT_ID" \
        --filter="operationType=RESTORE_VOLUME" \
        --format="value(status)" \
        --limit=1 2>/dev/null || echo "PENDING")

      if [[ "$status" == "DONE" ]]; then
        local restore_end
        restore_end=$(date +%s)
        local restore_duration=$((restore_end - restore_start))
        log_success "Backup restored in ${restore_duration}s"
        return 0
      fi

      sleep 30
      waited=$((waited + 30))
    done

    log_fail "Restore timed out after ${max_wait}s"
    return 1
  else
    log_fail "Failed to start restore"
    return 1
  fi
}

# Step 5: Verify data (basic checks)
verify_data() {
  log_info "Step 5: Verifying data integrity..."

  # Note: Full verification requires Cloud SQL Proxy connection
  # This is a placeholder for basic connectivity check

  local connection_name
  connection_name=$(gcloud sql instances describe "$DRILL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format="value(connectionName)" 2>/dev/null)

  if [[ -n "$connection_name" ]]; then
    log_success "Instance accessible: $connection_name"
    log_warn "Manual data verification required - connect via Cloud SQL Proxy"
  else
    log_fail "Cannot get connection name"
    return 1
  fi

  # Check instance is serving
  local status
  status=$(gcloud sql instances describe "$DRILL_INSTANCE" \
    --project="$PROJECT_ID" \
    --format="value(state)" 2>/dev/null)

  if [[ "$status" == "RUNNABLE" ]]; then
    log_success "Instance is serving"
  else
    log_fail "Instance not serving (status: $status)"
    return 1
  fi
}

# Step 6: Cleanup
cleanup() {
  log_info "Step 6: Cleaning up test instance..."

  if [[ -n "${DRILL_INSTANCE:-}" ]]; then
    if gcloud sql instances delete "$DRILL_INSTANCE" \
      --project="$PROJECT_ID" \
      --quiet 2>/dev/null; then
      log_success "Test instance $DRILL_INSTANCE deleted"
    else
      log_warn "Failed to delete test instance - manual cleanup required"
    fi
  fi
}

# Generate report
generate_report() {
  local drill_end
  drill_end=$(date +%s)
  local total_duration=$((drill_end - DRILL_START))
  local minutes=$((total_duration / 60))
  local seconds=$((total_duration % 60))

  local report_file="$REPORT_DIR/$DRILL_ID.md"

  # Count results
  local pass_count=0
  local fail_count=0
  local warn_count=0

  for result in "${DRILL_RESULTS[@]}"; do
    case "$result" in
      PASS:*) ((pass_count++)) ;;
      FAIL:*) ((fail_count++)) ;;
      WARN:*) ((warn_count++)) ;;
    esac
  done

  local overall_status="PASS"
  [[ $fail_count -gt 0 ]] && overall_status="FAIL"

  cat > "$report_file" << EOF
# DR Drill Report

**Drill ID:** $DRILL_ID
**Date:** $(date)
**Duration:** ${minutes}m ${seconds}s
**Overall Status:** $overall_status

## Summary

| Metric | Value |
|--------|-------|
| Tests Passed | $pass_count |
| Tests Failed | $fail_count |
| Warnings | $warn_count |
| Total Duration | ${minutes}m ${seconds}s |

## RTO Verification

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Instance Creation | 15 min | TBD | - |
| Backup Restore | 30 min | TBD | - |
| Total RTO | 1 hour | ${minutes}m ${seconds}s | $([ $total_duration -lt 3600 ] && echo "PASS" || echo "FAIL") |

## Detailed Results

EOF

  for result in "${DRILL_RESULTS[@]}"; do
    echo "- $result" >> "$report_file"
  done

  cat >> "$report_file" << EOF

## Action Items

<!-- Fill in any issues discovered during the drill -->

1. _None identified_

## Sign-off

**Conducted by:** $(whoami)
**Date:** $(date)
EOF

  log_info "Report saved to $report_file"
  echo ""
  echo "=============================================="
  echo "  DR Drill Complete"
  echo "  Status: $overall_status"
  echo "  Duration: ${minutes}m ${seconds}s"
  echo "  Report: $report_file"
  echo "=============================================="
}

# Main drill flow
run_drill() {
  local automated="${1:-false}"

  init_drill

  # Confirmation (unless automated)
  if [[ "$automated" != "true" ]]; then
    echo "This drill will:"
    echo "  1. Create a temporary Cloud SQL instance"
    echo "  2. Restore the latest backup"
    echo "  3. Verify data integrity"
    echo "  4. Clean up the test instance"
    echo ""
    echo "Estimated time: 30-60 minutes"
    echo "Estimated cost: ~\$5 (for temporary instance)"
    echo ""
    read -p "Proceed with DR drill? (yes/no) " -r
    if [[ ! $REPLY == "yes" ]]; then
      log_info "Drill cancelled"
      exit 0
    fi
  fi

  # Run drill steps
  local backup_id=""

  if check_prerequisites; then
    backup_id=$(get_latest_backup) || true
  fi

  if [[ -n "$backup_id" ]]; then
    create_test_instance "$backup_id" || true
  fi

  if [[ -n "${DRILL_INSTANCE:-}" ]]; then
    restore_backup "$backup_id" || true
    verify_data || true
    cleanup || true
  fi

  generate_report
}

# Parse arguments
case "${1:-}" in
  --automated)
    run_drill "true"
    ;;
  --report-only)
    log_info "Listing previous drill reports..."
    ls -la "$REPORT_DIR"/*.md 2>/dev/null || echo "No reports found"
    ;;
  -h|--help)
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  --automated     Run drill without prompts (for CI/CD)
  --report-only   List previous drill reports
  -h, --help      Show this help

Environment Variables:
  PROJECT_ID      GCP project ID
  INSTANCE_NAME   Cloud SQL instance name
  DATABASE_NAME   Database name
EOF
    ;;
  *)
    run_drill "false"
    ;;
esac
