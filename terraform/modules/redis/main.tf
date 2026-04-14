# =============================================================================
# Memorystore Redis Module
# =============================================================================

resource "google_redis_instance" "main" {
  name           = var.instance_name
  project        = var.project_id
  region         = var.region
  tier           = var.tier
  memory_size_gb = var.memory_size_gb

  authorized_network = var.vpc_network_id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_version = var.redis_version

  # Maintenance window
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 3
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  # Auth
  auth_enabled = var.auth_enabled

  # Transit encryption
  transit_encryption_mode = var.transit_encryption_mode

  labels = var.labels
}
