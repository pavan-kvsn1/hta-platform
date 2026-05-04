# =============================================================================
# Cloud SQL PostgreSQL Module
# =============================================================================

resource "google_sql_database_instance" "main" {
  name             = var.instance_name
  database_version = var.database_version
  region           = var.region
  project          = var.project_id

  deletion_protection = var.deletion_protection

  settings {
    tier              = var.tier
    availability_type = var.availability_type
    disk_size         = var.disk_size
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = var.backup_retention_days
      }
    }

    ip_configuration {
      ipv4_enabled    = var.enable_public_ip
      private_network = var.vpc_network_id
      # mTLS - requires client certificates (handled by Cloud SQL Auth Proxy)
      require_ssl = true
      ssl_mode    = "TRUSTED_CLIENT_CERTIFICATE_REQUIRED"
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 3
      update_track = "stable"
    }

    dynamic "insights_config" {
      for_each = var.enable_query_insights ? [1] : []
      content {
        query_insights_enabled  = true
        query_string_length     = 1024
        record_application_tags = true
        record_client_address   = true
      }
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    # Enable IAM authentication for Cloud SQL Auth Proxy
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }
}

# Database
resource "google_sql_database" "main" {
  name     = var.database_name
  instance = google_sql_database_instance.main.name
  project  = var.project_id
}

# User (password-based - kept for backward compatibility)
resource "google_sql_user" "main" {
  name     = var.database_user
  instance = google_sql_database_instance.main.name
  project  = var.project_id
  password = var.database_password
}

# =============================================================================
# IAM Users for Cloud SQL Auth Proxy
# These allow pods to authenticate using Workload Identity instead of passwords
# Format: {service-account-name}@{project-id}.iam (without .gserviceaccount.com)
# =============================================================================

resource "google_sql_user" "api_iam" {
  count    = var.enable_iam_auth ? 1 : 0
  name     = "${var.api_service_account_name}@${var.project_id}.iam"
  instance = google_sql_database_instance.main.name
  project  = var.project_id
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_sql_user" "worker_iam" {
  count    = var.enable_iam_auth ? 1 : 0
  name     = "${var.worker_service_account_name}@${var.project_id}.iam"
  instance = google_sql_database_instance.main.name
  project  = var.project_id
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}
