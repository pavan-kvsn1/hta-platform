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

# =============================================================================
# Disaster Recovery Alerts
# =============================================================================

# Database Backup Failure Alert
resource "google_monitoring_alert_policy" "backup_failure" {
  project      = var.project_id
  display_name = "Database Backup Failure (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Backup operation failed"
    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/auto_failover_request_count\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "86400s" # 24 hours
  }

  documentation {
    content   = "Database automatic backup has failed.\n\n**Severity:** CRITICAL - RPO at risk\n\n**Troubleshooting:**\n1. Check Cloud SQL operations log\n2. Verify disk space availability\n3. Check for ongoing maintenance\n4. Manually trigger backup if needed:\n   `gcloud sql backups create --instance=hta-main`\n\n**Escalation:**\n- Immediately notify on-call engineer\n- If backup cannot be restored within 1 hour, escalate to platform team"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# Database Replica Lag Alert
resource "google_monitoring_alert_policy" "replica_lag" {
  count = var.enable_replica_monitoring ? 1 : 0

  project      = var.project_id
  display_name = "Database Replica Lag (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Replica lag > 60 seconds"
    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/replication/replica_lag\""
      comparison      = "COMPARISON_GT"
      threshold_value = 60
      duration        = "300s"

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
    auto_close = "1800s" # 30 minutes
  }

  documentation {
    content   = "Database replica lag exceeds 60 seconds.\n\n**Severity:** HIGH - DR capability degraded\n\n**Impact:**\n- Failover would result in data loss\n- RPO target at risk\n\n**Troubleshooting:**\n1. Check primary instance CPU/memory usage\n2. Check network connectivity between regions\n3. Review ongoing write load\n4. Check replica instance health\n\n**If lag persists > 5 minutes:**\n- Reduce write load if possible\n- Consider scaling replica instance"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# Database Disk Usage Alert (for DR - need space for PITR)
resource "google_monitoring_alert_policy" "db_disk_usage" {
  project      = var.project_id
  display_name = "Database Disk Usage Warning (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Disk usage > 80%"
    condition_threshold {
      filter          = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/disk/utilization\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "300s"

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
    auto_close = "3600s"
  }

  documentation {
    content   = "Database disk usage exceeds 80%.\n\n**Severity:** MEDIUM - DR capability may be impacted\n\n**Impact:**\n- PITR transaction logs may be truncated\n- Backup operations may fail\n\n**Troubleshooting:**\n1. Review data growth trends\n2. Check for unused indexes\n3. Archive old data if applicable\n4. Enable disk autoresize if not already\n\n**Command to increase disk:**\n`gcloud sql instances patch hta-main --disk-size=<new_size>`"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# No Recent Backup Alert (backup age check)
resource "google_monitoring_alert_policy" "backup_age" {
  project      = var.project_id
  display_name = "No Recent Database Backup (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "No backup in last 25 hours"
    condition_absent {
      filter   = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/disk/bytes_used\""
      duration = "90000s" # 25 hours

      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = local.all_notification_channels

  alert_strategy {
    auto_close = "86400s"
  }

  documentation {
    content   = "No database backup has completed in the last 25 hours.\n\n**Severity:** CRITICAL - RPO violated\n\n**Impact:**\n- Recovery would lose more than 24 hours of data\n- SLA violation\n\n**Immediate Actions:**\n1. Check backup schedule configuration\n2. Review Cloud SQL operations for errors\n3. Manually trigger backup:\n   `gcloud sql backups create --instance=hta-main --project=hta-calibration-prod`\n\n**Escalation:**\n- Page on-call immediately\n- Notify engineering leadership if not resolved within 30 minutes"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}
