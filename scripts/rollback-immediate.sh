#!/bin/bash
#
# Immediate Rollback Script (< 5 minutes)
#
# Usage:
#   ./scripts/rollback-immediate.sh [service] [option]
#
# Services: api, worker, web, all
# Options:
#   --canary     Shift traffic away from canary (default)
#   --rollback   Rollback to previous deployment revision
#   --scale-down Scale down canary to 0 replicas
#
# Examples:
#   ./scripts/rollback-immediate.sh api --canary
#   ./scripts/rollback-immediate.sh all --rollback
#

set -euo pipefail

# Configuration
NAMESPACE="${NAMESPACE:-hta-platform}"
TIMEOUT="${TIMEOUT:-300s}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check kubectl is available
check_prerequisites() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi

    # Verify cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi

    log_info "Connected to cluster: $(kubectl config current-context)"
}

# Shift canary traffic to 0%
rollback_canary_traffic() {
    local service=$1
    log_info "Shifting traffic away from ${service} canary..."

    # Check if HTTPRoute exists
    if kubectl get httproute "hta-${service}-canary" -n "$NAMESPACE" &> /dev/null; then
        kubectl patch httproute "hta-${service}-canary" -n "$NAMESPACE" --type=merge -p '
{
  "spec": {
    "rules": [{
      "backendRefs": [
        {"name": "hta-'${service}'-canary", "weight": 0},
        {"name": "hta-'${service}'", "weight": 100}
      ]
    }]
  }
}'
        log_info "Traffic shifted: 0% canary, 100% stable for ${service}"
    else
        log_warn "HTTPRoute hta-${service}-canary not found, skipping traffic shift"
    fi
}

# Rollback deployment to previous revision
rollback_deployment() {
    local service=$1
    local revision=${2:-""}

    log_info "Rolling back ${service} deployment..."

    if [ -n "$revision" ]; then
        kubectl rollout undo deployment/"hta-${service}" -n "$NAMESPACE" --to-revision="$revision"
    else
        kubectl rollout undo deployment/"hta-${service}" -n "$NAMESPACE"
    fi

    log_info "Waiting for rollout to complete..."
    kubectl rollout status deployment/"hta-${service}" -n "$NAMESPACE" --timeout="$TIMEOUT"

    log_info "Rollback complete for ${service}"
}

# Scale down canary deployment
scale_down_canary() {
    local service=$1
    log_info "Scaling down ${service} canary..."

    if kubectl get deployment "hta-${service}-canary" -n "$NAMESPACE" &> /dev/null; then
        kubectl scale deployment "hta-${service}-canary" -n "$NAMESPACE" --replicas=0
        log_info "Canary scaled down for ${service}"
    else
        log_warn "Canary deployment hta-${service}-canary not found"
    fi
}

# Show current status
show_status() {
    echo ""
    log_info "=== Current Deployment Status ==="
    kubectl get deployments -n "$NAMESPACE" -o wide
    echo ""
    log_info "=== Pod Status ==="
    kubectl get pods -n "$NAMESPACE" -o wide
    echo ""
    log_info "=== Recent Events ==="
    kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -10
}

# Main execution
main() {
    local service="${1:-all}"
    local option="${2:---canary}"
    local revision="${3:-}"

    echo ""
    log_info "=========================================="
    log_info "  IMMEDIATE ROLLBACK"
    log_info "  Service: ${service}"
    log_info "  Option: ${option}"
    log_info "=========================================="
    echo ""

    check_prerequisites

    # Determine services to rollback
    local services=()
    case "$service" in
        api)
            services=("api")
            ;;
        worker)
            services=("worker")
            ;;
        web)
            services=("web")
            ;;
        all)
            services=("api" "worker")
            ;;
        *)
            log_error "Unknown service: ${service}"
            echo "Valid services: api, worker, web, all"
            exit 1
            ;;
    esac

    # Execute rollback based on option
    for svc in "${services[@]}"; do
        case "$option" in
            --canary)
                rollback_canary_traffic "$svc"
                ;;
            --rollback)
                rollback_deployment "$svc" "$revision"
                ;;
            --scale-down)
                rollback_canary_traffic "$svc"
                scale_down_canary "$svc"
                ;;
            *)
                log_error "Unknown option: ${option}"
                echo "Valid options: --canary, --rollback, --scale-down"
                exit 1
                ;;
        esac
    done

    show_status

    echo ""
    log_info "Immediate rollback completed successfully!"
    log_info "Monitor the deployment and verify functionality."
}

# Run main function
main "$@"
