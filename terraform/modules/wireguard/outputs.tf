# =============================================================================
# WireGuard Gateway Module — Outputs
# =============================================================================

output "external_ip" {
  description = "Static public IP of the WireGuard gateway — used in engineer configs and for TLS pinning"
  value       = google_compute_address.wireguard.address
}

output "peers_bucket_name" {
  description = "GCS bucket name for WireGuard peer management"
  value       = google_storage_bucket.wireguard.name
}

output "server_public_key_gcs_path" {
  description = "GCS path to the server's WireGuard public key — read by provisioning API"
  value       = "gs://${google_storage_bucket.wireguard.name}/server-public.key"
}

output "vm_sa_email" {
  description = "Service account email of the WireGuard VM"
  value       = google_service_account.wireguard_vm.email
}

output "vm_name" {
  description = "Compute instance name"
  value       = google_compute_instance.wireguard.name
}
