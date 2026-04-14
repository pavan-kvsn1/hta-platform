variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "bucket_name" {
  description = "Storage bucket name (must be globally unique)"
  type        = string
}

variable "location" {
  description = "Bucket location"
  type        = string
  default     = "US"
}

variable "storage_class" {
  description = "Storage class"
  type        = string
  default     = "STANDARD"
}

variable "versioning_enabled" {
  description = "Enable object versioning"
  type        = bool
  default     = true
}

variable "lifecycle_rules" {
  description = "Lifecycle rules for the bucket"
  type = list(object({
    action_type           = string
    storage_class         = optional(string)
    age                   = optional(number)
    num_newer_versions    = optional(number)
    with_state            = optional(string)
    matches_storage_class = optional(list(string))
  }))
  default = []
}

variable "cors_config" {
  description = "CORS configuration"
  type = object({
    origins          = list(string)
    methods          = list(string)
    response_headers = list(string)
    max_age_seconds  = number
  })
  default = null
}

variable "admin_members" {
  description = "List of members with storage admin access"
  type        = list(string)
  default     = []
}

variable "viewer_members" {
  description = "List of members with storage viewer access"
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels to apply to the bucket"
  type        = map(string)
  default     = {}
}
