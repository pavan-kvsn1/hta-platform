#!/bin/bash
# =============================================================================
# HTA Platform - Local Development Secrets Setup
# =============================================================================
#
# Creates .env.local files for local development by either:
#   1. Fetching secrets from Google Secret Manager (if authenticated)
#   2. Generating random local secrets (fallback)
#
# Usage:
#   ./scripts/setup-local-secrets.sh              # Auto-detect mode
#   ./scripts/setup-local-secrets.sh --gcp        # Force GCP mode
#   ./scripts/setup-local-secrets.sh --local      # Force local generation
#   ./scripts/setup-local-secrets.sh --app web    # Specific app only
#
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-hta-calibration-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
MODE="auto"
TARGET_APP=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --gcp)
      MODE="gcp"
      shift
      ;;
    --local)
      MODE="local"
      shift
      ;;
    --app)
      TARGET_APP="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--gcp|--local] [--app APP_NAME]"
      echo ""
      echo "Options:"
      echo "  --gcp      Force fetch from Google Secret Manager"
      echo "  --local    Force local secret generation"
      echo "  --app APP  Only setup specific app (web-hta, api, worker)"
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check GCP authentication
check_gcp_auth() {
  if gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1 | grep -q "@"; then
    return 0
  fi
  return 1
}

# Generate a random secret
generate_secret() {
  openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64
}

# Fetch secret from GCP Secret Manager
fetch_secret() {
  local secret_id="$1"
  gcloud secrets versions access latest --secret="$secret_id" --project="$PROJECT_ID" 2>/dev/null
}

# Create .env.local for web-hta
setup_web_hta() {
  local env_file="$ROOT_DIR/apps/web-hta/.env.local"
  local env_example="$ROOT_DIR/apps/web-hta/.env.example"

  log_info "Setting up web-hta secrets..."

  if [[ "$MODE" == "gcp" ]] || { [[ "$MODE" == "auto" ]] && check_gcp_auth; }; then
    log_info "Fetching secrets from Secret Manager..."

    cat > "$env_file" << EOF
# Auto-generated from Secret Manager on $(date)
# DO NOT COMMIT THIS FILE

DATABASE_URL=$(fetch_secret "database-url" || echo "postgresql://postgres:postgres@localhost:5432/hta_calibration")
NEXTAUTH_SECRET=$(fetch_secret "hta-web-nextauth-secret" || generate_secret)
NEXTAUTH_URL=http://localhost:3000
RESEND_API_KEY=$(fetch_secret "resend-api-key" || echo "re_test_key")
EOF
    log_success "web-hta: Secrets fetched from GCP"
  else
    log_warn "GCP not authenticated, generating local secrets..."

    cat > "$env_file" << EOF
# Auto-generated local secrets on $(date)
# DO NOT COMMIT THIS FILE

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hta_calibration
NEXTAUTH_SECRET=$(generate_secret)
NEXTAUTH_URL=http://localhost:3000
RESEND_API_KEY=re_test_local_key
EOF
    log_success "web-hta: Local secrets generated"
  fi
}

# Create .env.local for API
setup_api() {
  local env_file="$ROOT_DIR/apps/api/.env.local"

  log_info "Setting up api secrets..."

  if [[ "$MODE" == "gcp" ]] || { [[ "$MODE" == "auto" ]] && check_gcp_auth; }; then
    cat > "$env_file" << EOF
# Auto-generated from Secret Manager on $(date)
# DO NOT COMMIT THIS FILE

DATABASE_URL=$(fetch_secret "database-url" || echo "postgresql://postgres:postgres@localhost:5432/hta_calibration")
REDIS_URL=$(fetch_secret "redis-url" || echo "redis://localhost:6379")
JWT_SECRET=$(fetch_secret "hta-api-jwt-secret" || generate_secret)
ENCRYPTION_KEY=$(fetch_secret "hta-api-encryption-key" || generate_secret)
EOF
    log_success "api: Secrets fetched from GCP"
  else
    cat > "$env_file" << EOF
# Auto-generated local secrets on $(date)
# DO NOT COMMIT THIS FILE

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hta_calibration
REDIS_URL=redis://localhost:6379
JWT_SECRET=$(generate_secret)
ENCRYPTION_KEY=$(generate_secret)
EOF
    log_success "api: Local secrets generated"
  fi
}

# Create .env.local for Worker
setup_worker() {
  local env_file="$ROOT_DIR/apps/worker/.env.local"

  log_info "Setting up worker secrets..."

  if [[ "$MODE" == "gcp" ]] || { [[ "$MODE" == "auto" ]] && check_gcp_auth; }; then
    cat > "$env_file" << EOF
# Auto-generated from Secret Manager on $(date)
# DO NOT COMMIT THIS FILE

DATABASE_URL=$(fetch_secret "database-url" || echo "postgresql://postgres:postgres@localhost:5432/hta_calibration")
REDIS_URL=$(fetch_secret "redis-url" || echo "redis://localhost:6379")
RESEND_API_KEY=$(fetch_secret "resend-api-key" || echo "re_test_key")
EOF
    log_success "worker: Secrets fetched from GCP"
  else
    cat > "$env_file" << EOF
# Auto-generated local secrets on $(date)
# DO NOT COMMIT THIS FILE

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hta_calibration
REDIS_URL=redis://localhost:6379
RESEND_API_KEY=re_test_local_key
EOF
    log_success "worker: Local secrets generated"
  fi
}

# Main
main() {
  echo ""
  echo "=============================================="
  echo "  HTA Platform - Local Secrets Setup"
  echo "=============================================="
  echo ""

  # Auto-detect mode
  if [[ "$MODE" == "auto" ]]; then
    if check_gcp_auth; then
      log_info "GCP authentication detected"
      MODE="gcp"
    else
      log_warn "No GCP authentication, using local generation"
      MODE="local"
    fi
  fi

  echo "Mode: $MODE"
  echo ""

  # Setup apps
  if [[ -z "$TARGET_APP" ]] || [[ "$TARGET_APP" == "web-hta" ]]; then
    setup_web_hta
  fi

  if [[ -z "$TARGET_APP" ]] || [[ "$TARGET_APP" == "api" ]]; then
    setup_api
  fi

  if [[ -z "$TARGET_APP" ]] || [[ "$TARGET_APP" == "worker" ]]; then
    setup_worker
  fi

  echo ""
  log_success "Local secrets setup complete!"
  echo ""
  echo "Next steps:"
  echo "  1. Review the generated .env.local files"
  echo "  2. Start the development servers: pnpm dev"
  echo ""

  if [[ "$MODE" == "local" ]]; then
    log_warn "Using locally generated secrets - these won't work with production services"
  fi
}

main "$@"
