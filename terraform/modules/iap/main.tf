# =============================================================================
# Identity-Aware Proxy (IAP) Module
# =============================================================================
# Protects web applications with Google login
# Only authorized Google accounts can access
# =============================================================================

# OAuth2 Consent Screen (required for IAP)
resource "google_iap_brand" "main" {
  support_email     = var.support_email
  application_title = var.application_title
  project           = var.project_id
}

# OAuth2 Client for IAP
resource "google_iap_client" "main" {
  display_name = var.client_display_name
  brand        = google_iap_brand.main.name
}

# Static IP for Argo CD
resource "google_compute_global_address" "argocd" {
  name    = "argocd-ip"
  project = var.project_id
}

# Managed SSL Certificate for argocd.hta-calibration.com
resource "google_compute_managed_ssl_certificate" "argocd" {
  name    = "argocd-cert"
  project = var.project_id

  managed {
    domains = ["argocd.hta-calibration.com"]
  }
}

# Certificate Map for Gateway API
resource "google_certificate_manager_certificate_map" "argocd" {
  name    = "argocd-certmap"
  project = var.project_id
}

resource "google_certificate_manager_certificate_map_entry" "argocd" {
  name         = "argocd-certmap-entry"
  map          = google_certificate_manager_certificate_map.argocd.name
  certificates = [google_compute_managed_ssl_certificate.argocd.id]
  hostname     = "argocd.hta-calibration.com"
  project      = var.project_id
}

# IAM policy - who can access via IAP
resource "google_iap_web_iam_member" "members" {
  for_each = toset(var.authorized_members)

  project = var.project_id
  role    = "roles/iap.httpsResourceAccessor"
  member  = each.value
}

# Kubernetes secret with OAuth credentials (for GKE)
# This will be created by applying the K8s manifest
output "oauth_client_id" {
  description = "OAuth2 Client ID for IAP"
  value       = google_iap_client.main.client_id
  sensitive   = true
}

output "oauth_client_secret" {
  description = "OAuth2 Client Secret for IAP"
  value       = google_iap_client.main.secret
  sensitive   = true
}
