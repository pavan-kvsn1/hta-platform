output "argocd_ip_address" {
  description = "Static IP address for Argo CD"
  value       = google_compute_global_address.argocd.address
}

output "argocd_ip_name" {
  description = "Static IP name (for K8s Gateway)"
  value       = google_compute_global_address.argocd.name
}

output "iap_client_id" {
  description = "OAuth2 Client ID"
  value       = google_iap_client.main.client_id
  sensitive   = true
}

output "iap_client_secret" {
  description = "OAuth2 Client Secret"
  value       = google_iap_client.main.secret
  sensitive   = true
}

output "ssl_certificate_name" {
  description = "Managed SSL certificate name"
  value       = google_compute_managed_ssl_certificate.argocd.name
}
