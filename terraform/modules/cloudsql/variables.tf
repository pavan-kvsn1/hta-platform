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
  default     = "db-custom-2-4096"
}

variable "availability_type" {
  description = "Availability type (REGIONAL or ZONAL)"
  type        = string
  default     = "REGIONAL"
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
