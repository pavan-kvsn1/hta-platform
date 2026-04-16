variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-south1"  # Mumbai - closest to India
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

# Network
variable "subnet_cidr" {
  description = "Subnet CIDR range"
  type        = string
  default     = "10.0.0.0/20"
}

variable "pods_cidr" {
  description = "Pods secondary range CIDR"
  type        = string
  default     = "10.4.0.0/14"
}

variable "services_cidr" {
  description = "Services secondary range CIDR"
  type        = string
  default     = "10.8.0.0/20"
}

# GKE (Cost-optimized defaults for dev)
variable "gke_node_count" {
  description = "Number of nodes per zone"
  type        = number
  default     = 1
}

variable "gke_machine_type" {
  description = "GKE node machine type"
  type        = string
  default     = "e2-medium"  # 2 vCPU, 4GB RAM - sufficient for dev
}

variable "gke_disk_size_gb" {
  description = "GKE node disk size in GB"
  type        = number
  default     = 30  # Smaller disk for dev
}

variable "gke_node_locations" {
  description = "Zones for GKE nodes (leave empty for single zone)"
  type        = list(string)
  default     = []  # Single zone for dev
}

# Cloud SQL (Cost-optimized defaults for dev)
variable "cloudsql_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-g1-small"  # Shared-core, 1.7GB RAM - ~$25/month
}

variable "cloudsql_disk_size" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 10  # Start small, auto-resize enabled
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "hta_platform_dev"
}

variable "database_user" {
  description = "Database user"
  type        = string
  default     = "hta_app"
}

variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

# Redis (Cost-optimized defaults for dev)
variable "redis_tier" {
  description = "Redis tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"  # No HA for dev - ~$35/month
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1  # 1GB sufficient for dev
}

# Cloud Armor
variable "blocked_ip_ranges" {
  description = "IP ranges to block via Cloud Armor"
  type        = list(string)
  default     = []
}

# Storage
variable "cors_origins" {
  description = "Allowed CORS origins"
  type        = list(string)
  default     = ["https://dev.hta-calibration.com", "http://localhost:3000"]
}

# Kubernetes
variable "k8s_namespace" {
  description = "Kubernetes namespace"
  type        = string
  default     = "hta-dev"
}

# GitHub
variable "github_repo" {
  description = "GitHub repository (owner/repo)"
  type        = string
}

# Monitoring
variable "monitoring_notification_channels" {
  description = "List of notification channel IDs for alerts"
  type        = list(string)
  default     = []
}
