variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "support_email" {
  description = "Support email for OAuth consent screen"
  type        = string
}

variable "application_title" {
  description = "Application title shown on OAuth consent screen"
  type        = string
  default     = "HTA Platform"
}

variable "client_display_name" {
  description = "Display name for OAuth client"
  type        = string
  default     = "Argo CD IAP Client"
}

variable "authorized_members" {
  description = "List of members authorized to access via IAP (e.g., user:email@example.com)"
  type        = list(string)
}
