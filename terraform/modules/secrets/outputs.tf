output "secret_ids" {
  description = "Map of secret names to their IDs"
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.id }
}

output "secret_names" {
  description = "Map of secret names to their full resource names"
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.name }
}

output "secret_versions" {
  description = "Map of secret names to their latest version IDs"
  value       = { for k, v in google_secret_manager_secret_version.versions : k => v.id }
}
