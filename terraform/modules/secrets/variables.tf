variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "secrets" {
  description = "Map of secrets to create"
  type = map(object({
    value     = optional(string)
    labels    = optional(map(string), {})
    accessors = optional(list(string), [])
  }))
  default = {}
}

variable "labels" {
  description = "Labels to apply to all secrets"
  type        = map(string)
  default     = {}
}
