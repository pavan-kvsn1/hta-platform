# HTA Calibr8s Alert Policies
#
# Critical alerts for service health monitoring

locals {
  # Combine configured notification channels with PagerDuty if enabled
  all_notification_channels = concat(
    var.notification_channels,
    var.enable_pagerduty ? [google_monitoring_notification_channel.pagerduty[0].name] : []
  )
}

# High Error Rate Alert (per service)
resource "google_monitoring_alert_policy" "high_error_rate" {
  for_each = toset(var.services)

  project      = var.project_id
  display_name = "High Error Rate - hta-${each.key} (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Error rate > ${var.error_rate_threshold * 100}%"
    condition_threshold {
      filter          = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-${each.key}\" AND metric.type=\"custom.googleapis.com/api/request/count\" AND metric.labels.status_class!=\"2xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.error_rate_threshold
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "1800s" # 30 minutes
  }

  documentation {
    content   = "Service hta-${each.key} is experiencing elevated error rates above ${var.error_rate_threshold * 100}%.\n\n**Troubleshooting:**\n1. Check recent deployments\n2. Review application logs\n3. Check database connectivity\n4. Verify external service dependencies"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# High Latency Alert
resource "google_monitoring_alert_policy" "high_latency" {
  project      = var.project_id
  display_name = "High API Latency (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "P95 latency > ${var.latency_threshold_ms}ms"
    condition_threshold {
      filter          = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-api\" AND metric.type=\"custom.googleapis.com/api/request/latency\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.latency_threshold_ms
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "API service P95 latency exceeds ${var.latency_threshold_ms}ms.\n\n**Troubleshooting:**\n1. Check database query performance\n2. Review slow query logs\n3. Check for resource contention\n4. Verify cache hit rates"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# Database Connection Pool Warning
resource "google_monitoring_alert_policy" "db_connection_pool" {
  project      = var.project_id
  display_name = "Database Connection Pool Warning (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Connections > ${var.db_connection_threshold}% of max"
    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.db_connection_threshold
      duration        = "120s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Database connection pool usage exceeds ${var.db_connection_threshold}% of maximum capacity.\n\n**Troubleshooting:**\n1. Check for connection leaks\n2. Review long-running queries\n3. Consider scaling database resources\n4. Check application connection pool settings"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# Worker Queue Backlog
resource "google_monitoring_alert_policy" "worker_backlog" {
  project      = var.project_id
  display_name = "Worker Queue Backlog (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Queue depth > ${var.queue_depth_threshold}"
    condition_threshold {
      filter          = "metric.type=\"custom.googleapis.com/worker/queue/depth\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.queue_depth_threshold
      duration        = "600s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "3600s" # 1 hour
  }

  documentation {
    content   = "Worker queue depth exceeds ${var.queue_depth_threshold} for more than 10 minutes.\n\n**Troubleshooting:**\n1. Check worker pod health\n2. Scale worker replicas\n3. Identify slow/stuck jobs\n4. Check for job processing errors"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# Container Restart Alert
resource "google_monitoring_alert_policy" "container_restarts" {
  for_each = toset(var.services)

  project      = var.project_id
  display_name = "Container Restarts - hta-${each.key} (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "More than 3 restarts in 15 minutes"
    condition_threshold {
      filter          = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-${each.key}\" AND metric.type=\"kubernetes.io/container/restart_count\""
      comparison      = "COMPARISON_GT"
      threshold_value = 3
      duration        = "0s"

      aggregations {
        alignment_period     = "900s" # 15 minutes
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = "Service hta-${each.key} containers are restarting frequently.\n\n**Troubleshooting:**\n1. Check container logs for crash reasons\n2. Review memory limits (OOMKilled)\n3. Check liveness probe configuration\n4. Review recent deployments"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# Health Check Failure Alert
resource "google_monitoring_alert_policy" "health_check_failure" {
  for_each = toset(var.services)

  project      = var.project_id
  display_name = "Health Check Failure - hta-${each.key} (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Health check failing"
    condition_threshold {
      filter          = "metric.type=\"custom.googleapis.com/health/status\" AND metric.labels.service=\"hta-${each.key}\" AND metric.labels.status=\"unhealthy\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "120s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_COUNT"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "600s" # 10 minutes
  }

  documentation {
    content   = "Service hta-${each.key} health check is failing.\n\n**Troubleshooting:**\n1. Check /health endpoint response\n2. Verify database connectivity\n3. Check cache connectivity\n4. Review service logs"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}
