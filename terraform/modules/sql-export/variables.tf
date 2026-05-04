variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "bucket_name" {
  description = "GCS bucket name for SQL exports"
  type        = string
}

variable "sql_instance_name" {
  description = "Cloud SQL instance name"
  type        = string
}

variable "sql_instance_sa_email" {
  description = "Cloud SQL instance service account email (writes exports to GCS)"
  type        = string
}

variable "database_name" {
  description = "Database name to export"
  type        = string
}

variable "retention_days" {
  description = "Days to retain exports in GCS (1095 = 3 years)"
  type        = number
  default     = 1095
}

variable "schedule" {
  description = "Cron schedule for exports"
  type        = string
  default     = "0 4 * * *"  # 4 AM daily
}

variable "time_zone" {
  description = "Time zone for scheduler"
  type        = string
  default     = "Asia/Kolkata"
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
