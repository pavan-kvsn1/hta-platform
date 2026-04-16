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

# =============================================================================
# Cost Estimate (Dev Environment)
# =============================================================================
# GKE: e2-medium (1 node) = ~$25/month
# Cloud SQL: db-g1-small (10GB) = ~$25/month
# Redis: BASIC 1GB = ~$35/month
# Cloud NAT: ~$5/month
# GCS: ~$1/month
# Cloud Armor: ~$5/month
# Static IP: ~$3/month
# -----------------------------------------
# TOTAL: ~$100/month (~₹8,300/month)
# =============================================================================
