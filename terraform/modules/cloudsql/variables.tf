variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "instance_name" {
  description = "Cloud SQL instance name"
  type        = string
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_16"
}

variable "tier" {
  description = "Machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "availability_type" {
  description = "Availability type (REGIONAL or ZONAL)"
  type        = string
  default     = "ZONAL"
}

variable "disk_size" {
  description = "Disk size in GB"
  type        = number
  default     = 20
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of backups to retain"
  type        = number
  default     = 7
}

variable "vpc_network_id" {
  description = "VPC network ID for private IP"
  type        = string
}

variable "database_name" {
  description = "Database name"
  type        = string
}

variable "database_user" {
  description = "Database user"
  type        = string
}

variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "enable_public_ip" {
  description = "Enable public IP on Cloud SQL instance"
  type        = bool
  default     = false
}

variable "enable_query_insights" {
  description = "Enable Query Insights (requires dedicated-core tier, not supported on db-f1-micro/db-g1-small)"
  type        = bool
  default     = true
}

variable "enable_iam_auth" {
  description = "Enable IAM authentication for Cloud SQL Auth Proxy"
  type        = bool
  default     = false
}

variable "api_service_account_name" {
  description = "Name of the API service account (without @project.iam.gserviceaccount.com)"
  type        = string
  default     = ""
}

variable "worker_service_account_name" {
  description = "Name of the Worker service account (without @project.iam.gserviceaccount.com)"
  type        = string
  default     = ""
}

# =============================================================================
# Replica Configuration
# =============================================================================

variable "enable_replica" {
  description = "Enable cross-region read replica for DR"
  type        = bool
  default     = false
}

variable "replica_region" {
  description = "Region for the read replica (should differ from primary)"
  type        = string
  default     = "asia-south2"  # Delhi
}

variable "replica_tier" {
  description = "Machine tier for replica (defaults to same as primary)"
  type        = string
  default     = null
}

variable "replica_vpc_network_id" {
  description = "VPC network ID for replica (defaults to same as primary)"
  type        = string
  default     = null
}
