# =============================================================================
# Cloud Armor Security Policy
# =============================================================================

resource "google_compute_security_policy" "main" {
  name        = var.policy_name
  project     = var.project_id
  description = "Cloud Armor security policy for ${var.policy_name}"

  # Default rule - allow all traffic
  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default rule - allow all"
  }

  # Rate limiting rule
  rule {
    action   = "throttle"
    priority = "1000"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Rate limit all IPs"
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.rate_limit_requests_per_interval
        interval_sec = var.rate_limit_interval_sec
      }
    }
  }

  # Block known bad IPs (optional - populated via var)
  dynamic "rule" {
    for_each = length(var.blocked_ip_ranges) > 0 ? [1] : []
    content {
      action   = "deny(403)"
      priority = "100"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.blocked_ip_ranges
        }
      }
      description = "Block known bad IPs"
    }
  }

  # OWASP ModSecurity Core Rule Set
  dynamic "rule" {
    for_each = var.enable_owasp_rules ? [1] : []
    content {
      action   = "deny(403)"
      priority = "2000"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('sqli-v33-stable')"
        }
      }
      description = "SQL injection protection"
    }
  }

  dynamic "rule" {
    for_each = var.enable_owasp_rules ? [1] : []
    content {
      action   = "deny(403)"
      priority = "2001"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('xss-v33-stable')"
        }
      }
      description = "XSS protection"
    }
  }

  dynamic "rule" {
    for_each = var.enable_owasp_rules ? [1] : []
    content {
      action   = "deny(403)"
      priority = "2002"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('lfi-v33-stable')"
        }
      }
      description = "Local file inclusion protection"
    }
  }

  dynamic "rule" {
    for_each = var.enable_owasp_rules ? [1] : []
    content {
      action   = "deny(403)"
      priority = "2003"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('rfi-v33-stable')"
        }
      }
      description = "Remote file inclusion protection"
    }
  }

  dynamic "rule" {
    for_each = var.enable_owasp_rules ? [1] : []
    content {
      action   = "deny(403)"
      priority = "2004"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('rce-v33-stable')"
        }
      }
      description = "Remote code execution protection"
    }
  }
}

# Static IP for GKE Ingress to reference
resource "google_compute_global_address" "ingress_ip" {
  name        = "${var.policy_name}-ip"
  project     = var.project_id
  description = "Static IP for GKE Ingress"
}
