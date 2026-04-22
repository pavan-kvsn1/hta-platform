# HTA Calibr8s Monitoring Module
#
# Provides comprehensive monitoring for the HTA platform:
# - Service overview dashboards
# - Alert policies for critical issues
# - SLO/SLA tracking dashboards
#
# Note: These use GKE Standard metrics. For Cloud Run, replace:
# - resource.type="k8s_container" -> resource.type="cloud_run_revision"
# - Use run.googleapis.com metrics instead of kubernetes.io metrics

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 4.0"
    }
  }
}

locals {
  # Common labels for all resources
  labels = {
    environment = var.environment
    managed_by  = "terraform"
    project     = "hta-calibr8s"
  }

  # Service name mapping for resources
  service_names = {
    for svc in var.services : svc => "hta-${svc}"
  }
}

# Notification channel for PagerDuty (if enabled)
resource "google_monitoring_notification_channel" "pagerduty" {
  count        = var.enable_pagerduty && var.pagerduty_service_key != "" ? 1 : 0
  display_name = "HTA Calibr8s PagerDuty - ${var.environment}"
  type         = "pagerduty"
  project      = var.project_id

  labels = {
    service_key = var.pagerduty_service_key
  }

  user_labels = local.labels
}

# Outputs
output "dashboard_urls" {
  description = "URLs to the monitoring dashboards"
  value = {
    services_overview = "https://console.cloud.google.com/monitoring/dashboards/builder/${google_monitoring_dashboard.services_overview.id}?project=${var.project_id}"
    # slo dashboard disabled until custom metrics exist
    # slo               = "https://console.cloud.google.com/monitoring/dashboards/builder/${google_monitoring_dashboard.slo.id}?project=${var.project_id}"
  }
}

output "alert_policy_ids" {
  description = "IDs of created alert policies"
  value = {
    # Note: Some alerts disabled until custom metrics exist
    # high_error_rate = { for k, v in google_monitoring_alert_policy.high_error_rate : k => v.name }
    # high_latency    = google_monitoring_alert_policy.high_latency.name
    db_connections  = google_monitoring_alert_policy.db_connection_pool.name
    # queue_backlog   = google_monitoring_alert_policy.worker_backlog.name
  }
}

output "pagerduty_channel_id" {
  description = "PagerDuty notification channel ID"
  value       = var.enable_pagerduty ? google_monitoring_notification_channel.pagerduty[0].name : null
}
