# HTA Calibr8s Monitoring Dashboards
#
# Services Overview Dashboard - shows key metrics across all services
#
# Note: Using GKE Standard metrics. For Cloud Run:
# - Replace resource.type="k8s_container" with resource.type="cloud_run_revision"
# - Replace kubernetes.io metrics with run.googleapis.com metrics

resource "google_monitoring_dashboard" "services_overview" {
  project        = var.project_id
  dashboard_json = jsonencode({
    displayName = "HTA Calibr8s - Services Overview (${var.environment})"
    labels      = local.labels
    gridLayout = {
      columns = 3
      widgets = concat(
        # Request Rate per Service
        [{
          title = "Request Rate by Service"
          xyChart = {
            dataSets = [for service in var.services : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-${service}\" AND metric.type=\"kubernetes.io/container/cpu/core_usage_time\""
                  aggregation = {
                    alignmentPeriod   = "60s"
                    perSeriesAligner  = "ALIGN_RATE"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields     = ["resource.labels.container_name"]
                  }
                }
              }
              plotType = "LINE"
              legendTemplate = "hta-${service}"
            }]
            timeshiftDuration = "0s"
            yAxis = {
              label = "Requests/sec"
              scale = "LINEAR"
            }
          }
        }],
        # Latency by Service (P95)
        [{
          title = "P95 Latency by Service"
          xyChart = {
            dataSets = [for service in ["web", "api"] : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-${service}\" AND metric.type=\"custom.googleapis.com/api/request/latency\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_PERCENTILE_95"
                  }
                }
              }
              plotType = "LINE"
              legendTemplate = "hta-${service}"
            }]
            yAxis = {
              label = "Latency (ms)"
              scale = "LINEAR"
            }
            thresholds = [{
              value     = var.latency_threshold_ms
              color     = "YELLOW"
              direction = "ABOVE"
            }]
          }
        }],
        # Error Rate
        [{
          title = "Error Rate (%)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilterRatio = {
                  numerator = {
                    filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/api/request/count\" AND metric.labels.status_class!=\"2xx\""
                    aggregation = {
                      alignmentPeriod   = "60s"
                      perSeriesAligner  = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                  denominator = {
                    filter = "resource.type=\"k8s_container\" AND metric.type=\"custom.googleapis.com/api/request/count\""
                    aggregation = {
                      alignmentPeriod   = "60s"
                      perSeriesAligner  = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                    }
                  }
                }
              }
              plotType = "LINE"
            }]
            yAxis = {
              label = "Error Rate (%)"
              scale = "LINEAR"
            }
            thresholds = [{
              value     = var.error_rate_threshold * 100
              color     = "RED"
              direction = "ABOVE"
            }]
          }
        }],
        # Pod/Instance Count
        [{
          title = "Active Pods"
          xyChart = {
            dataSets = [for service in var.services : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"k8s_pod\" AND resource.labels.pod_name=monitoring.regex.full_match(\"hta-${service}-.*\")"
                  aggregation = {
                    alignmentPeriod   = "60s"
                    perSeriesAligner  = "ALIGN_COUNT"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields     = ["resource.labels.pod_name"]
                  }
                }
              }
              plotType = "STACKED_AREA"
              legendTemplate = "hta-${service}"
            }]
          }
        }],
        # Database Connections
        [{
          title = "Database Connections"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
              plotType = "LINE"
            }]
            yAxis = {
              label = "Connections"
              scale = "LINEAR"
            }
            thresholds = [{
              value     = var.db_connection_threshold
              color     = "YELLOW"
              direction = "ABOVE"
            }]
          }
        }],
        # Worker Queue Depth
        [{
          title = "Worker Queue Depth"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"custom.googleapis.com/worker/queue/depth\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
              plotType = "LINE"
            }]
            yAxis = {
              label = "Queue Depth"
              scale = "LINEAR"
            }
            thresholds = [{
              value     = var.queue_depth_threshold
              color     = "YELLOW"
              direction = "ABOVE"
            }]
          }
        }],
        # Memory Usage
        [{
          title = "Memory Usage by Service"
          xyChart = {
            dataSets = [for service in var.services : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-${service}\" AND metric.type=\"kubernetes.io/container/memory/used_bytes\""
                  aggregation = {
                    alignmentPeriod   = "60s"
                    perSeriesAligner  = "ALIGN_MEAN"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields     = ["resource.labels.container_name"]
                  }
                }
              }
              plotType = "LINE"
              legendTemplate = "hta-${service}"
            }]
            yAxis = {
              label = "Memory (bytes)"
              scale = "LINEAR"
            }
          }
        }],
        # CPU Usage
        [{
          title = "CPU Usage by Service"
          xyChart = {
            dataSets = [for service in var.services : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-${service}\" AND metric.type=\"kubernetes.io/container/cpu/core_usage_time\""
                  aggregation = {
                    alignmentPeriod   = "60s"
                    perSeriesAligner  = "ALIGN_RATE"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields     = ["resource.labels.container_name"]
                  }
                }
              }
              plotType = "LINE"
              legendTemplate = "hta-${service}"
            }]
            yAxis = {
              label = "CPU Cores"
              scale = "LINEAR"
            }
          }
        }],
        # Container Restarts
        [{
          title = "Container Restarts"
          xyChart = {
            dataSets = [for service in var.services : {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"k8s_container\" AND resource.labels.container_name=\"hta-${service}\" AND metric.type=\"kubernetes.io/container/restart_count\""
                  aggregation = {
                    alignmentPeriod   = "300s"
                    perSeriesAligner  = "ALIGN_DELTA"
                    crossSeriesReducer = "REDUCE_SUM"
                    groupByFields     = ["resource.labels.container_name"]
                  }
                }
              }
              plotType = "LINE"
              legendTemplate = "hta-${service}"
            }]
          }
        }]
      )
    }
  })
}
