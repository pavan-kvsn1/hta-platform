#!/bin/bash
# =============================================================================
# HTA Calibr8s - Disaster Recovery Restore Script
# =============================================================================
#
# Usage:
#   ./dr-restore.sh <backup_id>           # Restore from specific backup
#   ./dr-restore.sh --pitr <timestamp>    # Point-in-time recovery
#   ./dr-restore.sh --list                # List available backups
#   ./dr-restore.sh --test                # Run in test mode (creates temp instance)
#
# Prerequisites:
#   - gcloud CLI authenticated with appropriate permissions
#   - PROJECT_ID environment variable set (or uses default)
#
# =============================================================================

set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-hta-calibration-prod}"
INSTANCE_NAME="${INSTANCE_NAME:-hta-main}"
DATABASE_NAME="${DATABASE_NAME:-hta_calibration}"
REGION="${REGION:-asia-south1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Print header
print_header() {
  echo ""
  echo "=============================================="
  echo "  HTA Calibr8s - Disaster Recovery Restore"
  echo "=============================================="
  echo "  Project:  $PROJECT_ID"
  echo "  Instance: $INSTANCE_NAME"
  echo "  Region:   $REGION"
  echo "=============================================="
  echo ""
}

# List available backups
list_backups() {
  log_info "Fetching available backups for $INSTANCE_NAME..."
  echo ""

  gcloud sql backups list \
    --instance="$INSTANCE_NAME" \
    --project="$PROJECT_ID" \
    --format="table(id,windowStartTime,status,type)" \
    --limit=20

  echo ""
  log_info "To restore from a backup, run: ./dr-restore.sh <backup_id>"
}

# Validate backup exists
validate_backup() {
  local backup_id="$1"

  log_info "Validating backup $backup_id..."

  if ! gcloud sql backups describe "$backup_id" \
    --instance="$INSTANCE_NAME" \
    --project="$PROJECT_ID" &>/dev/null; then
    log_error "Backup $backup_id not found"
    exit 1
  fi

  log_success "Backup $backup_id validated"
}

# Create restore instance
create_restore_instance() {
  local target_instance="$1"

  log_info "Creating restore instance: $target_instance..."

  # Clone the instance structure (without data)
  gcloud sql instances clone "$INSTANCE_NAME" "$target_instance" \
    --project="$PROJECT_ID" \
    --async

  # Wait for clone to complete
  log_info "Waiting for instance creation..."
  while true; do
    local status
    status=$(gcloud sql instances describe "$target_instance" \
      --project="$PROJECT_ID" \
      --format="value(state)" 2>/dev/null || echo "PENDING")

    if [[ "$status" == "RUNNABLE" ]]; then
      break
    fi

    echo -n "."
    sleep 10
  done
  echo ""

  log_success "Instance $target_instance created"
}

# Restore from backup
restore_from_backup() {
  local backup_id="$1"
  local target_instance="$2"

  log_info "Restoring backup $backup_id to $target_instance..."

  gcloud sql backups restore "$backup_id" \
    --restore-instance="$target_instance" \
    --project="$PROJECT_ID" \
    --async

  # Wait for restore to complete
  log_info "Waiting for restore to complete (this may take several minutes)..."
  while true; do
    local op_status
    op_status=$(gcloud sql operations list \
      --instance="$target_instance" \
      --project="$PROJECT_ID" \
      --filter="operationType=RESTORE_VOLUME" \
      --format="value(status)" \
      --limit=1 2>/dev/null || echo "PENDING")

    if [[ "$op_status" == "DONE" ]]; then
      break
    fi

    echo -n "."
    sleep 30
  done
  echo ""

  log_success "Restore completed"
}

# Point-in-time recovery
restore_pitr() {
  local timestamp="$1"
  local target_instance="$2"

  log_info "Performing point-in-time recovery to $timestamp..."

  gcloud sql instances clone "$INSTANCE_NAME" "$target_instance" \
    --project="$PROJECT_ID" \
    --point-in-time="$timestamp"

  log_success "PITR completed"
}

# Verify data integrity
verify_data_integrity() {
  local target_instance="$1"

  log_info "Verifying data integrity..."

  # Get connection details
  local connection_name
  connection_name=$(gcloud sql instances describe "$target_instance" \
    --project="$PROJECT_ID" \
    --format="value(connectionName)")

  echo ""
  echo "Data verification queries:"
  echo "=========================="

  # These would need to be run via Cloud SQL Proxy or direct connection
  cat << EOF
Run these queries to verify data integrity:

-- Certificate count
SELECT COUNT(*) as certificate_count FROM "Certificate";

-- Active users
SELECT COUNT(*) as active_users FROM "User" WHERE "isActive" = true;

-- Recent certificates (last 7 days)
SELECT COUNT(*) as recent_certs
FROM "Certificate"
WHERE "createdAt" > NOW() - INTERVAL '7 days';

-- Audit log entries
SELECT COUNT(*) as audit_entries FROM "AuditLog";

-- Check for data consistency
SELECT
  (SELECT COUNT(*) FROM "Certificate") as certificates,
  (SELECT COUNT(*) FROM "User") as users,
  (SELECT COUNT(*) FROM "Customer") as customers;
EOF

  echo ""
  log_warn "Manual verification required. Connect to $target_instance and run the above queries."
}

# Cleanup test instance
cleanup_instance() {
  local target_instance="$1"

  read -p "Delete test instance $target_instance? (y/n) " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Deleting instance $target_instance..."
    gcloud sql instances delete "$target_instance" \
      --project="$PROJECT_ID" \
      --quiet
    log_success "Instance deleted"
  else
    log_info "Instance $target_instance preserved"
    log_info "Remember to delete it manually when done: gcloud sql instances delete $target_instance --project=$PROJECT_ID"
  fi
}

# Record restore metrics
record_metrics() {
  local start_time="$1"
  local end_time="$2"
  local backup_id="$3"
  local target_instance="$4"

  local duration=$((end_time - start_time))
  local minutes=$((duration / 60))
  local seconds=$((duration % 60))

  echo ""
  echo "=============================================="
  echo "  Restore Summary"
  echo "=============================================="
  echo "  Backup ID:       $backup_id"
  echo "  Target Instance: $target_instance"
  echo "  Duration:        ${minutes}m ${seconds}s"
  echo "  Completed:       $(date)"
  echo "=============================================="
  echo ""

  # Log to file for audit
  local log_file="dr-restore-$(date +%Y%m%d-%H%M%S).log"
  cat > "$log_file" << EOF
DR Restore Log
==============
Date: $(date)
Backup ID: $backup_id
Target Instance: $target_instance
Duration: ${minutes}m ${seconds}s
Project: $PROJECT_ID
Source Instance: $INSTANCE_NAME
EOF

  log_info "Restore log saved to $log_file"
}

# Main restore flow
do_restore() {
  local backup_id="$1"
  local test_mode="${2:-false}"

  local target_instance
  if [[ "$test_mode" == "true" ]]; then
    target_instance="hta-dr-test-$(date +%Y%m%d%H%M)"
  else
    target_instance="hta-restored-$(date +%Y%m%d%H%M)"
  fi

  local start_time
  start_time=$(date +%s)

  print_header

  log_warn "This will create a new Cloud SQL instance: $target_instance"

  if [[ "$test_mode" != "true" ]]; then
    read -p "Are you sure you want to proceed? (yes/no) " -r
    if [[ ! $REPLY == "yes" ]]; then
      log_info "Restore cancelled"
      exit 0
    fi
  fi

  # Validate backup
  validate_backup "$backup_id"

  # Create and restore
  create_restore_instance "$target_instance"
  restore_from_backup "$backup_id" "$target_instance"

  local end_time
  end_time=$(date +%s)

  # Record metrics
  record_metrics "$start_time" "$end_time" "$backup_id" "$target_instance"

  # Verify data
  verify_data_integrity "$target_instance"

  # Cleanup if test mode
  if [[ "$test_mode" == "true" ]]; then
    cleanup_instance "$target_instance"
  else
    log_success "Restore complete!"
    log_info "New instance: $target_instance"
    log_info "Update your application configuration to point to this instance if needed."
  fi
}

# Show usage
usage() {
  cat << EOF
Usage: $0 [OPTIONS] [BACKUP_ID]

Options:
  --list              List available backups
  --pitr TIMESTAMP    Point-in-time recovery (ISO 8601 format)
  --test              Run in test mode (creates temporary instance)
  -h, --help          Show this help message

Examples:
  $0 --list
  $0 1234567890
  $0 --test 1234567890
  $0 --pitr "2024-01-15T10:30:00Z"

Environment Variables:
  PROJECT_ID      GCP project ID (default: hta-calibration-prod)
  INSTANCE_NAME   Cloud SQL instance name (default: hta-main)
  DATABASE_NAME   Database name (default: hta_calibration)
  REGION          GCP region (default: asia-south1)
EOF
}

# Parse arguments
main() {
  if [[ $# -eq 0 ]]; then
    usage
    exit 1
  fi

  case "$1" in
    --list)
      print_header
      list_backups
      ;;
    --pitr)
      if [[ -z "${2:-}" ]]; then
        log_error "PITR requires a timestamp"
        exit 1
      fi
      print_header
      local target="hta-pitr-$(date +%Y%m%d%H%M)"
      restore_pitr "$2" "$target"
      verify_data_integrity "$target"
      ;;
    --test)
      if [[ -z "${2:-}" ]]; then
        log_error "Test mode requires a backup ID"
        exit 1
      fi
      do_restore "$2" "true"
      ;;
    -h|--help)
      usage
      ;;
    *)
      do_restore "$1" "false"
      ;;
  esac
}

main "$@"
