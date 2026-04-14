output "policy_id" {
  description = "Cloud Armor policy ID"
  value       = google_compute_security_policy.main.id
}

output "policy_name" {
  description = "Cloud Armor policy name"
  value       = google_compute_security_policy.main.name
}

output "policy_self_link" {
  description = "Cloud Armor policy self link"
  value       = google_compute_security_policy.main.self_link
}

output "ingress_ip_address" {
  description = "Static IP address for GKE Ingress"
  value       = google_compute_global_address.ingress_ip.address
}

output "ingress_ip_name" {
  description = "Static IP name for GKE Ingress annotation"
  value       = google_compute_global_address.ingress_ip.name
}
