# Monitoring Module Variables

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
}

variable "services" {
  description = "List of services to monitor"
  type        = list(string)
  default     = ["web", "api", "worker"]
}

variable "notification_channels" {
  description = "List of notification channel IDs for alerts"
  type        = list(string)
  default     = []
}

variable "enable_pagerduty" {
  description = "Enable PagerDuty integration"
  type        = bool
  default     = false
}

variable "pagerduty_service_key" {
  description = "PagerDuty service integration key"
  type        = string
  default     = ""
  sensitive   = true
}

# Alert Thresholds
variable "error_rate_threshold" {
  description = "Error rate threshold percentage (0-1)"
  type        = number
  default     = 0.05 # 5%
}

variable "latency_threshold_ms" {
  description = "P95 latency threshold in milliseconds"
  type        = number
  default     = 500
}

variable "db_connection_threshold" {
  description = "Database connection pool threshold (percentage of max)"
  type        = number
  default     = 80
}

variable "queue_depth_threshold" {
  description = "Worker queue depth threshold"
  type        = number
  default     = 100
}

# SLO Targets
variable "availability_slo" {
  description = "Availability SLO target (percentage)"
  type        = number
  default     = 99.9
}

variable "latency_slo_ms" {
  description = "Latency SLO target in milliseconds"
  type        = number
  default     = 200
}

# Disaster Recovery
variable "enable_replica_monitoring" {
  description = "Enable monitoring alerts for database replica"
  type        = bool
  default     = false
}
