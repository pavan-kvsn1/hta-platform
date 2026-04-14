variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
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
variable "gke_node_count" {
  description = "Number of nodes per zone"
  type        = number
  default     = 1
}

variable "gke_machine_type" {
  description = "GKE node machine type"
  type        = string
  default     = "e2-standard-4"
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
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-custom-2-4096"
}

variable "cloudsql_disk_size" {
  description = "Cloud SQL disk size in GB"
  type        = number
  default     = 20
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

# Redis
variable "redis_tier" {
  description = "Redis tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "STANDARD_HA"
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
