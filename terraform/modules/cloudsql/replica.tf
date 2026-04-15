# =============================================================================
# Cloud SQL Cross-Region Read Replica
# =============================================================================
#
# Creates a read replica in a different region for disaster recovery.
# The replica can be promoted to primary if the main instance fails.
#
# Promotion command (manual failover):
#   gcloud sql instances promote-replica REPLICA_NAME --project=PROJECT_ID
#
# =============================================================================

resource "google_sql_database_instance" "replica" {
  count = var.enable_replica ? 1 : 0

  name                 = "${var.instance_name}-replica"
  master_instance_name = google_sql_database_instance.main.name
  region               = var.replica_region
  project              = var.project_id
  database_version     = var.database_version

  deletion_protection = var.deletion_protection

  replica_configuration {
    failover_target = true
  }

  settings {
    tier              = var.replica_tier != null ? var.replica_tier : var.tier
    availability_type = "ZONAL" # Replicas are typically ZONAL to save costs
    disk_size         = var.disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    # Replicas don't need their own backups
    backup_configuration {
      enabled = false
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.replica_vpc_network_id != null ? var.replica_vpc_network_id : var.vpc_network_id
      require_ssl     = true
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }
  }

  depends_on = [google_sql_database_instance.main]
}

# =============================================================================
# Outputs
# =============================================================================

output "replica_connection_name" {
  description = "Connection name of the replica instance"
  value       = var.enable_replica ? google_sql_database_instance.replica[0].connection_name : null
}

output "replica_ip_address" {
  description = "Private IP address of the replica"
  value       = var.enable_replica ? google_sql_database_instance.replica[0].private_ip_address : null
}

output "replica_self_link" {
  description = "Self link of the replica instance"
  value       = var.enable_replica ? google_sql_database_instance.replica[0].self_link : null
}
