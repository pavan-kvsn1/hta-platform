output "host" {
  description = "Redis host IP"
  value       = google_redis_instance.main.host
}

output "port" {
  description = "Redis port"
  value       = google_redis_instance.main.port
}

output "auth_string" {
  description = "Redis AUTH string"
  value       = google_redis_instance.main.auth_string
  sensitive   = true
}

output "current_location_id" {
  description = "Current zone where instance is located"
  value       = google_redis_instance.main.current_location_id
}

output "connection_string" {
  description = "Redis connection string"
  value       = "redis://:${google_redis_instance.main.auth_string}@${google_redis_instance.main.host}:${google_redis_instance.main.port}"
  sensitive   = true
}
