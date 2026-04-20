#!/bin/bash
#
# Full Rollback Script (< 30 minutes)
#
# This script performs a complete rollback including:
# - Reverting GKE deployments
# - Reverting database migrations (optional)
# - Redeploying Cloud Run monolith (if needed)
#
# Usage:
#   ./scripts/rollback-full.sh [options]
#
# Options:
#   --migrate-rollback    Also rollback database migrations
#   --to-monolith         Redeploy the monolith on Cloud Run
#   --revision <rev>      Rollback to specific revision
#   --dry-run             Show what would be done without executing
#
# Examples:
#   ./scripts/rollback-full.sh
#   ./scripts/rollback-full.sh --migrate-rollback
#   ./scripts/rollback-full.sh --to-monolith
#

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-hta-platform}"
PROJECT_ID="${PROJECT_ID:-hta-calibration}"
REGION="${REGION:-asia-south1}"
MONOLITH_SERVICE="${MONOLITH_SERVICE:-hta-calibration}"
TIMEOUT="${TIMEOUT:-300s}"

# Flags
MIGRATE_ROLLBACK=false
TO_MONOLITH=false
DRY_RUN=false
REVISION=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --migrate-rollback)
                MIGRATE_ROLLBACK=true
                shift
                ;;
            --to-monolith)
                TO_MONOLITH=true
                shift
                ;;
            --revision)
                REVISION="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat << EOF
Full Rollback Script

Usage: ./scripts/rollback-full.sh [options]

Options:
  --migrate-rollback    Also rollback database migrations
  --to-monolith         Redeploy the monolith on Cloud Run
  --revision <rev>      Rollback to specific revision
  --dry-run             Show what would be done without executing
  -h, --help            Show this help message

Examples:
  ./scripts/rollback-full.sh
  ./scripts/rollback-full.sh --migrate-rollback
  ./scripts/rollback-full.sh --to-monolith --revision 5
EOF
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."

    local missing=()

    if ! command -v kubectl &> /dev/null; then
        missing+=("kubectl")
    fi

    if ! command -v gcloud &> /dev/null; then
        missing+=("gcloud")
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        exit 1
    fi

    # Verify cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

# Create backup of current state
create_state_backup() {
    log_step "Creating state backup..."

    local backup_dir="rollback-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"

    # Backup current deployment specs
    kubectl get deployments -n "$NAMESPACE" -o yaml > "$backup_dir/deployments.yaml" 2>/dev/null || true
    kubectl get services -n "$NAMESPACE" -o yaml > "$backup_dir/services.yaml" 2>/dev/null || true
    kubectl get httproutes -n "$NAMESPACE" -o yaml > "$backup_dir/httproutes.yaml" 2>/dev/null || true

    # Record current image versions
    kubectl get deployments -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}' > "$backup_dir/images.txt" 2>/dev/null || true

    log_info "State backup created in: $backup_dir"
}

# Rollback GKE deployments
rollback_gke_deployments() {
    log_step "Rolling back GKE deployments..."

    local deployments=("hta-api" "hta-worker")

    for deployment in "${deployments[@]}"; do
        if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
            log_info "Rolling back $deployment..."

            if [ "$DRY_RUN" = true ]; then
                echo "[DRY-RUN] kubectl rollout undo deployment/$deployment -n $NAMESPACE"
            else
                if [ -n "$REVISION" ]; then
                    kubectl rollout undo deployment/"$deployment" -n "$NAMESPACE" --to-revision="$REVISION"
                else
                    kubectl rollout undo deployment/"$deployment" -n "$NAMESPACE"
                fi
                kubectl rollout status deployment/"$deployment" -n "$NAMESPACE" --timeout="$TIMEOUT"
            fi
        else
            log_warn "Deployment $deployment not found, skipping"
        fi
    done
}

# Shift all traffic away from canary
disable_canary_traffic() {
    log_step "Disabling canary traffic..."

    local routes=("hta-api-canary" "hta-worker-canary")

    for route in "${routes[@]}"; do
        if kubectl get httproute "$route" -n "$NAMESPACE" &> /dev/null; then
            local service_name="${route%-canary}"

            log_info "Shifting traffic for $route..."

            if [ "$DRY_RUN" = true ]; then
                echo "[DRY-RUN] Shift traffic: 0% canary, 100% stable for $service_name"
            else
                kubectl patch httproute "$route" -n "$NAMESPACE" --type=merge -p "
{
  \"spec\": {
    \"rules\": [{
      \"backendRefs\": [
        {\"name\": \"${service_name}-canary\", \"weight\": 0},
        {\"name\": \"${service_name}\", \"weight\": 100}
      ]
    }]
  }
}"
            fi
        fi
    done
}

# Rollback database migrations
rollback_migrations() {
    log_step "Rolling back database migrations..."

    if [ "$DRY_RUN" = true ]; then
        echo "[DRY-RUN] pnpm db:migrate:rollback"
        return
    fi

    # Check if we have the pnpm command available
    if ! command -v pnpm &> /dev/null; then
        log_warn "pnpm not available, skipping migration rollback"
        log_warn "Please run manually: pnpm db:migrate:rollback"
        return
    fi

    # Navigate to project root and run migration rollback
    local project_root
    project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

    cd "$project_root"

    log_info "Running migration rollback..."
    pnpm db:migrate:rollback || {
        log_error "Migration rollback failed"
        log_warn "You may need to manually rollback migrations"
        return 1
    }

    log_info "Migration rollback completed"
}

# Redeploy monolith on Cloud Run
redeploy_monolith() {
    log_step "Redeploying monolith on Cloud Run..."

    # Get the last known good image
    local last_good_image
    last_good_image=$(gcloud run revisions list \
        --service="$MONOLITH_SERVICE" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(spec.containers[0].image)" \
        --sort-by="~metadata.creationTimestamp" \
        --limit=2 | tail -1)

    if [ -z "$last_good_image" ]; then
        log_error "Could not find last known good image for monolith"
        return 1
    fi

    log_info "Deploying image: $last_good_image"

    if [ "$DRY_RUN" = true ]; then
        echo "[DRY-RUN] gcloud run deploy $MONOLITH_SERVICE --image $last_good_image"
        return
    fi

    gcloud run deploy "$MONOLITH_SERVICE" \
        --image "$last_good_image" \
        --region "$REGION" \
        --project "$PROJECT_ID" \
        --quiet

    log_info "Monolith redeployed successfully"
}

# Update DNS/routing to point to monolith
switch_to_monolith() {
    log_step "Switching traffic to monolith..."

    if [ "$DRY_RUN" = true ]; then
        echo "[DRY-RUN] Would update DNS/routing to point to Cloud Run monolith"
        return
    fi

    # Scale down GKE API service
    log_info "Scaling down GKE API deployment..."
    kubectl scale deployment hta-api -n "$NAMESPACE" --replicas=0 || true
    kubectl scale deployment hta-api-canary -n "$NAMESPACE" --replicas=0 || true

    log_warn "DNS/routing update may need to be done manually"
    log_warn "Update your load balancer or DNS to point to the Cloud Run service"
    log_info "Cloud Run service URL can be found with:"
    echo "  gcloud run services describe $MONOLITH_SERVICE --region $REGION --format='value(status.url)'"
}

# Show final status
show_status() {
    log_step "Current status..."

    echo ""
    echo "=== GKE Deployments ==="
    kubectl get deployments -n "$NAMESPACE" -o wide 2>/dev/null || echo "No GKE deployments found"

    echo ""
    echo "=== GKE Pods ==="
    kubectl get pods -n "$NAMESPACE" 2>/dev/null || echo "No pods found"

    if [ "$TO_MONOLITH" = true ]; then
        echo ""
        echo "=== Cloud Run Service ==="
        gcloud run services describe "$MONOLITH_SERVICE" \
            --region "$REGION" \
            --project "$PROJECT_ID" \
            --format="table(status.url,status.conditions[0].status)" 2>/dev/null || echo "Service not found"
    fi
}

# Main execution
main() {
    parse_args "$@"

    echo ""
    log_info "=========================================="
    log_info "  FULL ROLLBACK"
    log_info "  Migrate Rollback: ${MIGRATE_ROLLBACK}"
    log_info "  To Monolith: ${TO_MONOLITH}"
    log_info "  Dry Run: ${DRY_RUN}"
    if [ -n "$REVISION" ]; then
        log_info "  Revision: ${REVISION}"
    fi
    log_info "=========================================="
    echo ""

    if [ "$DRY_RUN" = false ]; then
        read -p "Are you sure you want to proceed with full rollback? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Rollback cancelled"
            exit 0
        fi
    fi

    check_prerequisites
    create_state_backup

    # Step 1: Disable canary traffic
    disable_canary_traffic

    # Step 2: Rollback GKE deployments
    rollback_gke_deployments

    # Step 3: Rollback migrations if requested
    if [ "$MIGRATE_ROLLBACK" = true ]; then
        rollback_migrations
    fi

    # Step 4: Redeploy monolith if requested
    if [ "$TO_MONOLITH" = true ]; then
        redeploy_monolith
        switch_to_monolith
    fi

    show_status

    echo ""
    log_info "=========================================="
    log_info "  FULL ROLLBACK COMPLETED"
    log_info "=========================================="
    echo ""
    log_warn "Please verify the following:"
    echo "  1. Application is accessible and functional"
    echo "  2. Health checks are passing"
    echo "  3. No errors in logs"
    echo "  4. Metrics look normal"
    echo ""
    log_info "If issues persist, check the backup directory for previous state"
}

# Run main function
main "$@"
