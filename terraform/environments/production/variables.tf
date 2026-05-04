variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-south1"  # Mumbai - closest to India users
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
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

# GKE
variable "gke_zone" {
  description = "GCP zone for zonal GKE cluster (must be in var.region)"
  type        = string
  default     = "asia-south1-b"
}

variable "gke_node_count" {
  description = "Number of nodes per zone"
  type        = number
  default     = 1
}

variable "gke_machine_type" {
  description = "GKE node machine type"
  type        = string
  default     = "e2-medium"
}

variable "gke_disk_size_gb" {
  description = "GKE node disk size in GB"
  type        = number
  default     = 50
}

variable "gke_node_locations" {
  description = "Zones for GKE nodes"
  type        = list(string)
  default     = []
}

# Cloud SQL
variable "cloudsql_tier" {
  description = "Cloud SQL machine tier (db-custom-1-3840 minimum required for read replicas)"
  type        = string
  default     = "db-custom-1-3840"
}

variable "cloudsql_disk_size" {
  description = "Cloud SQL disk size in GB (cannot shrink — only increase)"
  type        = number
  default     = 100  # Already provisioned at 100, Cloud SQL doesn't allow shrink
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "hta_platform"
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

# Disaster Recovery
variable "enable_dr_replica" {
  description = "Enable cross-region read replica for DR"
  type        = bool
  default     = false
}

variable "dr_replica_region" {
  description = "Region for DR replica (should differ from primary)"
  type        = string
  default     = "asia-south2"  # Delhi - domestic DR, lower latency & egress costs
}

# Redis
variable "redis_tier" {
  description = "Redis tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1
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
  default     = ["https://hta-platform.com"]
}

# Kubernetes
variable "k8s_namespace" {
  description = "Kubernetes namespace"
  type        = string
  default     = "hta-platform"
}

# GitHub
variable "github_repo" {
  description = "GitHub repository (owner/repo)"
  type        = string
}

# IAP (Identity-Aware Proxy) for Argo CD
variable "iap_support_email" {
  description = "Support email for OAuth consent screen"
  type        = string
}

variable "iap_authorized_members" {
  description = "List of members authorized to access Argo CD (e.g., user:you@gmail.com)"
  type        = list(string)
}

# Monitoring
variable "monitoring_notification_channels" {
  description = "List of notification channel IDs for alerts"
  type        = list(string)
  default     = []
}

variable "enable_pagerduty" {
  description = "Enable PagerDuty integration for alerts"
  type        = bool
  default     = false
}

variable "pagerduty_service_key" {
  description = "PagerDuty service integration key"
  type        = string
  default     = ""
  sensitive   = true
}
