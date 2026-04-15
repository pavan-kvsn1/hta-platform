# HTA Calibr8s SLO Dashboard
#
# Service Level Objectives tracking for key metrics

resource "google_monitoring_dashboard" "slo" {
  project        = var.project_id
  dashboard_json = jsonencode({
    displayName = "HTA Calibr8s - SLO Dashboard (${var.environment})"
    labels      = local.labels
    gridLayout = {
      columns = 2
      widgets = [
        # API Availability Scorecard
        {
          title = "API Availability (Target: ${var.availability_slo}%)"
          scorecard = {
            timeSeriesQuery = {
              timeSeriesFilterRatio = {
                numerator = {
                  filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-api\" AND metric.type=\"custom.googleapis.com/api/request/count\" AND metric.labels.status_class=\"2xx\""
                  aggregation = {
                    alignmentPeriod   = "3600s"
                    perSeriesAligner  = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
                denominator = {
                  filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-api\" AND metric.type=\"custom.googleapis.com/api/request/count\""
                  aggregation = {
                    alignmentPeriod   = "3600s"
                    perSeriesAligner  = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
              }
            }
            thresholds = [
              { value = var.availability_slo, color = "GREEN", direction = "ABOVE" },
              { value = var.availability_slo - 0.4, color = "YELLOW", direction = "ABOVE" },
              { value = 0, color = "RED", direction = "ABOVE" }
            ]
            sparkChartView = {
              sparkChartType = "SPARK_LINE"
            }
          }
        },
        # API Latency P95
        {
          title = "API Latency P95 (Target: <${var.latency_slo_ms}ms)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-api\" AND metric.type=\"custom.googleapis.com/api/request/latency\""
                  aggregation = {
                    alignmentPeriod  = "300s"
                    perSeriesAligner = "ALIGN_PERCENTILE_95"
                  }
                }
              }
              plotType = "LINE"
            }]
            yAxis = {
              label = "Latency (ms)"
              scale = "LINEAR"
            }
            thresholds = [
              { value = var.latency_slo_ms, color = "GREEN", direction = "BELOW" },
              { value = var.latency_slo_ms * 1.5, color = "YELLOW", direction = "BELOW" },
              { value = var.latency_slo_ms * 2, color = "RED", direction = "BELOW" }
            ]
          }
        },
        # Error Budget Remaining (Monthly)
        {
          title = "Error Budget Remaining (Monthly)"
          scorecard = {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "metric.type=\"custom.googleapis.com/slo/error_budget_remaining\""
                aggregation = {
                  alignmentPeriod  = "3600s"
                  perSeriesAligner = "ALIGN_MEAN"
                }
              }
            }
            thresholds = [
              { value = 50, color = "GREEN", direction = "ABOVE" },
              { value = 25, color = "YELLOW", direction = "ABOVE" },
              { value = 0, color = "RED", direction = "ABOVE" }
            ]
            sparkChartView = {
              sparkChartType = "SPARK_LINE"
            }
          }
        },
        # Worker Job Success Rate
        {
          title = "Worker Job Success Rate (Target: 99%)"
          scorecard = {
            timeSeriesQuery = {
              timeSeriesFilterRatio = {
                numerator = {
                  filter = "metric.type=\"custom.googleapis.com/worker/job/count\" AND metric.labels.success=\"true\""
                  aggregation = {
                    alignmentPeriod   = "3600s"
                    perSeriesAligner  = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
                denominator = {
                  filter = "metric.type=\"custom.googleapis.com/worker/job/count\""
                  aggregation = {
                    alignmentPeriod   = "3600s"
                    perSeriesAligner  = "ALIGN_SUM"
                    crossSeriesReducer = "REDUCE_SUM"
                  }
                }
              }
            }
            thresholds = [
              { value = 99, color = "GREEN", direction = "ABOVE" },
              { value = 95, color = "YELLOW", direction = "ABOVE" },
              { value = 90, color = "RED", direction = "ABOVE" }
            ]
            sparkChartView = {
              sparkChartType = "SPARK_LINE"
            }
          }
        },
        # Availability Over Time
        {
          title = "Availability Over Time (7 days)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilterRatio = {
                  numerator = {
                    filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-api\" AND metric.type=\"custom.googleapis.com/api/request/count\" AND metric.labels.status_class=\"2xx\""
                    aggregation = {
                      alignmentPeriod   = "3600s"
                      perSeriesAligner  = "ALIGN_SUM"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                  denominator = {
                    filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-api\" AND metric.type=\"custom.googleapis.com/api/request/count\""
                    aggregation = {
                      alignmentPeriod   = "3600s"
                      perSeriesAligner  = "ALIGN_SUM"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
              }
              plotType = "LINE"
            }]
            yAxis = {
              label = "Availability (%)"
              scale = "LINEAR"
            }
            thresholds = [{
              value     = var.availability_slo
              color     = "GREEN"
              direction = "ABOVE"
            }]
          }
        },
        # Error Budget Burn Rate
        {
          title = "Error Budget Burn Rate"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"custom.googleapis.com/slo/error_budget_burn_rate\""
                  aggregation = {
                    alignmentPeriod  = "3600s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
              plotType = "LINE"
            }]
            yAxis = {
              label = "Burn Rate"
              scale = "LINEAR"
            }
            thresholds = [
              { value = 1, color = "GREEN", direction = "BELOW" },
              { value = 2, color = "YELLOW", direction = "BELOW" },
              { value = 10, color = "RED", direction = "BELOW" }
            ]
          }
        }
      ]
    }
  })
}

# Error Budget Alert
resource "google_monitoring_alert_policy" "error_budget_burn" {
  project      = var.project_id
  display_name = "Error Budget Burn Rate High (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Error budget burn rate > 10x"
    condition_threshold {
      filter          = "metric.type=\"custom.googleapis.com/slo/error_budget_burn_rate\""
      comparison      = "COMPARISON_GT"
      threshold_value = 10
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
    auto_close = "1800s"
  }

  documentation {
    content   = "Error budget is being consumed faster than sustainable (>10x normal rate).\n\n**Action Required:**\n1. Identify the source of errors\n2. Consider rolling back recent changes\n3. Engage on-call support if needed"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}

# Low Error Budget Alert
resource "google_monitoring_alert_policy" "error_budget_low" {
  project      = var.project_id
  display_name = "Error Budget Low (${var.environment})"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Error budget < 25%"
    condition_threshold {
      filter          = "metric.type=\"custom.googleapis.com/slo/error_budget_remaining\""
      comparison      = "COMPARISON_LT"
      threshold_value = 25
      duration        = "0s"

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
    auto_close = "86400s" # 24 hours
  }

  documentation {
    content   = "Monthly error budget is below 25%.\n\n**Action Required:**\n1. Review recent incidents\n2. Prioritize reliability work\n3. Consider feature freeze if budget exhausted"
    mime_type = "text/markdown"
  }

  user_labels = local.labels
}
