output "gke_cluster_name" {
  description = "GKE cluster name"
  value       = module.gke.cluster_name
}

output "gke_cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = module.gke.cluster_endpoint
  sensitive   = true
}

output "ingress_static_ip" {
  description = "Static IP for GKE Ingress"
  value       = module.cloud_armor.ingress_ip_address
}

output "ingress_ip_name" {
  description = "Static IP name (use in K8s Ingress annotation)"
  value       = module.cloud_armor.ingress_ip_name
}

output "cloud_armor_policy_name" {
  description = "Cloud Armor security policy name"
  value       = module.cloud_armor.policy_name
}

output "cloudsql_connection_name" {
  description = "Cloud SQL connection name"
  value       = module.cloudsql.instance_connection_name
}

output "cloudsql_private_ip" {
  description = "Cloud SQL private IP"
  value       = module.cloudsql.private_ip_address
}

output "redis_host" {
  description = "Redis host"
  value       = module.redis.host
}

output "redis_port" {
  description = "Redis port"
  value       = module.redis.port
}

output "uploads_bucket" {
  description = "Uploads bucket name"
  value       = module.uploads_bucket.bucket_name
}

output "artifact_registry_url" {
  description = "Artifact Registry URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.main.repository_id}"
}

output "github_workload_identity_provider" {
  description = "GitHub Actions Workload Identity provider"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_service_account_email" {
  description = "GitHub Actions service account email"
  value       = google_service_account.github_actions.email
}

output "api_service_account_email" {
  description = "API service account email"
  value       = google_service_account.api.email
}

output "worker_service_account_email" {
  description = "Worker service account email"
  value       = google_service_account.worker.email
}

output "web_service_account_email" {
  description = "Web service account email"
  value       = google_service_account.web.email
}

output "desktop_releases_url" {
  description = "Desktop app releases bucket URL (for electron-updater)"
  value       = "https://storage.googleapis.com/${var.project_id}-desktop-releases"
}

output "wireguard_external_ip" {
  description = "WireGuard gateway static public IP — use in engineer VPN configs and for TLS pinning"
  value       = module.wireguard.external_ip
}

output "wireguard_peers_bucket" {
  description = "GCS bucket for WireGuard peer management"
  value       = module.wireguard.peers_bucket_name
}

output "wireguard_server_pubkey_path" {
  description = "GCS path to server public key — read by provisioning API endpoint"
  value       = module.wireguard.server_public_key_gcs_path
}

# Argo CD / IAP outputs
output "argocd_url" {
  description = "Argo CD URL"
  value       = "https://argocd.hta-calibration.com"
}

# IAP outputs disabled - module requires GCP Organization
# output "argocd_ip_address" {
#   description = "Argo CD static IP (point DNS here)"
#   value       = module.iap.argocd_ip_address
# }

# output "iap_client_id" {
#   description = "IAP OAuth Client ID (needed for K8s secret)"
#   value       = module.iap.iap_client_id
#   sensitive   = true
# }

# output "iap_client_secret" {
#   description = "IAP OAuth Client Secret (needed for K8s secret)"
#   value       = module.iap.iap_client_secret
#   sensitive   = true
# }
