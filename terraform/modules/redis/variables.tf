variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "instance_name" {
  description = "Redis instance name"
  type        = string
}

variable "tier" {
  description = "Service tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "STANDARD_HA"
}

variable "memory_size_gb" {
  description = "Memory size in GB"
  type        = number
  default     = 1
}

variable "vpc_network_id" {
  description = "VPC network ID for private connection"
  type        = string
}

variable "redis_version" {
  description = "Redis version"
  type        = string
  default     = "REDIS_7_0"
}

variable "auth_enabled" {
  description = "Enable Redis AUTH"
  type        = bool
  default     = true
}

variable "transit_encryption_mode" {
  description = "Transit encryption mode (DISABLED or SERVER_AUTHENTICATION)"
  type        = string
  default     = "SERVER_AUTHENTICATION"
}

variable "labels" {
  description = "Labels to apply to the instance"
  type        = map(string)
  default     = {}
}
