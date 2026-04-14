variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "policy_name" {
  description = "Name for the security policy"
  type        = string
}

variable "rate_limit_requests_per_interval" {
  description = "Number of requests allowed per interval"
  type        = number
  default     = 100
}

variable "rate_limit_interval_sec" {
  description = "Rate limit interval in seconds"
  type        = number
  default     = 60
}

variable "blocked_ip_ranges" {
  description = "List of IP ranges to block"
  type        = list(string)
  default     = []
}

variable "enable_owasp_rules" {
  description = "Enable OWASP ModSecurity Core Rule Set"
  type        = bool
  default     = true
}
