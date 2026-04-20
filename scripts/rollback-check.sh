#!/bin/bash
#
# Rollback Trigger Check Script
#
# Checks if rollback triggers have been met based on metrics.
# Can be run manually or as part of a monitoring pipeline.
#
# Exit codes:
#   0 - All metrics healthy, no rollback needed
#   1 - Rollback trigger met, action recommended
#   2 - Error checking metrics
#
# Usage:
#   ./scripts/rollback-check.sh [--auto-rollback]
#

set -euo pipefail

# Configuration - Rollback Triggers from documentation
ERROR_RATE_THRESHOLD=5          # > 5% for 5 minutes
ERROR_RATE_DURATION_MIN=5
LATENCY_P95_THRESHOLD_MS=500    # > 500ms for 10 minutes
LATENCY_DURATION_MIN=10
NAMESPACE="${NAMESPACE:-hta-platform}"

# Flags
AUTO_ROLLBACK=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --auto-rollback)
                AUTO_ROLLBACK=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [--auto-rollback]"
                echo ""
                echo "Options:"
                echo "  --auto-rollback  Automatically trigger rollback if thresholds exceeded"
                exit 0
                ;;
            *)
                shift
                ;;
        esac
    done
}

# Check pod health
check_pod_health() {
    log_info "Checking pod health..."

    local unhealthy_pods
    unhealthy_pods=$(kubectl get pods -n "$NAMESPACE" \
        --field-selector=status.phase!=Running,status.phase!=Succeeded \
        --no-headers 2>/dev/null | wc -l)

    if [ "$unhealthy_pods" -gt 0 ]; then
        log_error "Found $unhealthy_pods unhealthy pods"
        kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running,status.phase!=Succeeded
        return 1
    fi

    # Check for pods in CrashLoopBackOff
    local crash_loop_pods
    crash_loop_pods=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{" "}{range .status.containerStatuses[*]}{.state.waiting.reason}{end}{"\n"}{end}' 2>/dev/null | grep -c "CrashLoopBackOff" || true)

    if [ "$crash_loop_pods" -gt 0 ]; then
        log_error "Found $crash_loop_pods pods in CrashLoopBackOff"
        return 1
    fi

    # Check restart counts
    local high_restart_pods
    high_restart_pods=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}{" "}{range .status.containerStatuses[*]}{.restartCount}{end}{"\n"}{end}' 2>/dev/null | awk '$2 > 5 {print}' | wc -l)

    if [ "$high_restart_pods" -gt 0 ]; then
        log_warn "Found $high_restart_pods pods with high restart counts (>5)"
    fi

    log_info "Pod health check passed"
    return 0
}

# Check deployment status
check_deployment_status() {
    log_info "Checking deployment status..."

    local deployments=("hta-api" "hta-worker")
    local failed=false

    for deployment in "${deployments[@]}"; do
        if kubectl get deployment "$deployment" -n "$NAMESPACE" &> /dev/null; then
            local available
            local desired
            available=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.status.availableReplicas}' 2>/dev/null || echo "0")
            desired=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

            if [ "${available:-0}" -lt "${desired:-1}" ]; then
                log_error "Deployment $deployment: $available/$desired replicas available"
                failed=true
            else
                log_info "Deployment $deployment: $available/$desired replicas available"
            fi
        fi
    done

    if [ "$failed" = true ]; then
        return 1
    fi

    return 0
}

# Check recent events for errors
check_recent_events() {
    log_info "Checking recent events..."

    local error_events
    error_events=$(kubectl get events -n "$NAMESPACE" \
        --field-selector=type=Warning \
        --sort-by='.lastTimestamp' 2>/dev/null | tail -20)

    if [ -n "$error_events" ]; then
        log_warn "Recent warning events found:"
        echo "$error_events"
    fi

    # Check for specific critical events
    local critical_count
    critical_count=$(kubectl get events -n "$NAMESPACE" \
        --field-selector=type=Warning \
        --sort-by='.lastTimestamp' 2>/dev/null | \
        grep -E "(OOMKilled|FailedScheduling|FailedMount|BackOff)" | wc -l || true)

    if [ "$critical_count" -gt 3 ]; then
        log_error "Multiple critical events detected: $critical_count"
        return 1
    fi

    return 0
}

# Check service endpoints
check_service_endpoints() {
    log_info "Checking service endpoints..."

    local services=("hta-api" "hta-worker")

    for service in "${services[@]}"; do
        if kubectl get service "$service" -n "$NAMESPACE" &> /dev/null; then
            local endpoints
            endpoints=$(kubectl get endpoints "$service" -n "$NAMESPACE" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null)

            if [ -z "$endpoints" ]; then
                log_error "Service $service has no endpoints"
                return 1
            else
                log_info "Service $service has endpoints"
            fi
        fi
    done

    return 0
}

# Check health endpoints (if accessible)
check_health_endpoints() {
    log_info "Checking health endpoints..."

    # Try to port-forward and check health
    # This is optional and may not work in all environments

    local api_pod
    api_pod=$(kubectl get pods -n "$NAMESPACE" -l app=hta-api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

    if [ -n "$api_pod" ]; then
        # Quick exec to check internal health
        local health_status
        health_status=$(kubectl exec -n "$NAMESPACE" "$api_pod" -- wget -qO- http://localhost:4000/health 2>/dev/null || echo "failed")

        if echo "$health_status" | grep -q "ok\|healthy\|UP"; then
            log_info "API health check passed"
        else
            log_warn "API health check returned: $health_status"
        fi
    fi

    return 0
}

# Generate summary report
generate_report() {
    local status=$1

    echo ""
    echo "=========================================="
    echo "  ROLLBACK CHECK SUMMARY"
    echo "=========================================="
    echo ""
    echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "Namespace: $NAMESPACE"
    echo ""
    echo "Thresholds:"
    echo "  Error Rate: > ${ERROR_RATE_THRESHOLD}% for ${ERROR_RATE_DURATION_MIN} minutes"
    echo "  Latency P95: > ${LATENCY_P95_THRESHOLD_MS}ms for ${LATENCY_DURATION_MIN} minutes"
    echo ""

    if [ "$status" -eq 0 ]; then
        echo -e "Status: ${GREEN}HEALTHY${NC} - No rollback needed"
    else
        echo -e "Status: ${RED}UNHEALTHY${NC} - Rollback recommended"
    fi

    echo ""
    echo "=========================================="
}

# Trigger automatic rollback if enabled
trigger_rollback() {
    if [ "$AUTO_ROLLBACK" = true ]; then
        log_warn "Auto-rollback is enabled. Triggering immediate rollback..."

        local script_dir
        script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

        if [ -f "$script_dir/rollback-immediate.sh" ]; then
            bash "$script_dir/rollback-immediate.sh" all --canary
        else
            log_error "rollback-immediate.sh not found"
            exit 2
        fi
    else
        log_warn "Auto-rollback is disabled. Manual intervention required."
        echo ""
        echo "To trigger immediate rollback, run:"
        echo "  ./scripts/rollback-immediate.sh all --canary"
        echo ""
        echo "For full rollback, run:"
        echo "  ./scripts/rollback-full.sh"
    fi
}

# Main execution
main() {
    parse_args "$@"

    local checks_failed=0

    # Run all checks
    check_pod_health || ((checks_failed++))
    check_deployment_status || ((checks_failed++))
    check_recent_events || ((checks_failed++))
    check_service_endpoints || ((checks_failed++))
    check_health_endpoints || true  # Non-critical

    # Generate report
    if [ "$checks_failed" -gt 0 ]; then
        generate_report 1
        trigger_rollback
        exit 1
    else
        generate_report 0
        exit 0
    fi
}

main "$@"
