# =============================================================================
# WireGuard Gateway Module — Variables
# =============================================================================

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g. production, dev)"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "zone" {
  description = "GCP zone for the WireGuard VM (defaults to region-a)"
  type        = string
  default     = ""
}

variable "network" {
  description = "VPC network self_link"
  type        = string
}

variable "subnetwork" {
  description = "VPC subnetwork self_link"
  type        = string
}

variable "machine_type" {
  description = "Compute Engine machine type"
  type        = string
  default     = "e2-micro" # Free tier eligible
}

variable "wg_subnet" {
  description = "WireGuard tunnel subnet CIDR (must not overlap with VPC or GKE subnets)"
  type        = string
  default     = "10.100.0.0/24"
}

variable "server_ip" {
  description = "WireGuard server IP inside the tunnel"
  type        = string
  default     = "10.100.0.1"
}

variable "api_sa_email" {
  description = "API service account email — granted write access to peers bucket"
  type        = string
}

variable "gke_nodes_sa_email" {
  description = "GKE nodes service account email — used to target the wireguard-to-api firewall rule"
  type        = string
}

variable "github_actions_sa_email" {
  description = "GitHub Actions service account email — granted write access to desktop-releases bucket (no VPN access needed here)"
  type        = string
  default     = ""
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}
