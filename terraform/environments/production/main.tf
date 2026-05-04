# =============================================================================
# HTA Platform - Production Environment
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "hta-platform-terraform-state"
    prefix = "production"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# Locals - Predictable Service Account Emails
# =============================================================================
# Service account emails follow a predictable pattern. Using locals instead of
# resource attributes avoids "computed values in for_each" errors in Terraform.

locals {
  api_sa_email    = "${var.environment}-api@${var.project_id}.iam.gserviceaccount.com"
  worker_sa_email = "${var.environment}-worker@${var.project_id}.iam.gserviceaccount.com"
  web_sa_email    = "${var.environment}-web@${var.project_id}.iam.gserviceaccount.com"
}

# =============================================================================
# VPC Network
# =============================================================================

resource "google_compute_network" "main" {
  name                    = "${var.environment}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "main" {
  name          = "${var.environment}-subnet"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = var.subnet_cidr

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = var.services_cidr
  }

  private_ip_google_access = true
}

# =============================================================================
# Cloud NAT (required for private GKE nodes to pull images)
# =============================================================================

resource "google_compute_router" "main" {
  name    = "${var.environment}-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "main" {
  name                               = "${var.environment}-nat"
  project                            = var.project_id
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Private Service Access for Cloud SQL and Redis
resource "google_compute_global_address" "private_services" {
  name          = "${var.environment}-private-services"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# =============================================================================
# GKE Cluster
# =============================================================================

module "gke" {
  source = "../../modules/gke"

  project_id   = var.project_id
  region       = var.region
  zone         = var.gke_zone  # Zonal cluster = free management fee
  cluster_name = "${var.environment}-cluster"
  environment  = var.environment

  network    = google_compute_network.main.name
  subnetwork = google_compute_subnetwork.main.name

  pods_range_name     = "pods"
  services_range_name = "services"

  min_node_count  = var.gke_node_count
  max_node_count  = var.gke_node_count * 2  # Max 2 nodes
  machine_type    = var.gke_machine_type
  disk_size_gb    = var.gke_disk_size_gb
  node_locations  = var.gke_node_locations
  service_account     = google_service_account.gke_nodes.email
  deletion_protection = true
}

# GKE Node Service Account
resource "google_service_account" "gke_nodes" {
  account_id   = "${var.environment}-gke-nodes"
  display_name = "GKE Node Service Account"
  project      = var.project_id
}

resource "google_project_iam_member" "gke_nodes_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_nodes_artifact_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

# =============================================================================
# Cloud SQL
# =============================================================================

module "cloudsql" {
  source = "../../modules/cloudsql"

  project_id    = var.project_id
  region        = var.region
  instance_name = "${var.environment}-postgres"

  database_version = "POSTGRES_16"
  tier             = var.cloudsql_tier
  disk_size        = var.cloudsql_disk_size

  availability_type     = "ZONAL"    # No HA standby needed at current scale
  deletion_protection   = true
  backup_retention_days = 365       # Max allowed by GCP (use GCS exports for longer retention)

  vpc_network_id = google_compute_network.main.id

  database_name     = var.database_name
  database_user     = var.database_user
  database_password = var.database_password

  # db-f1-micro doesn't support Query Insights (requires dedicated-core)
  enable_query_insights = false
  enable_public_ip      = false

  # Enable IAM authentication for Cloud SQL Auth Proxy
  enable_iam_auth              = true
  api_service_account_name     = "${var.environment}-api"
  worker_service_account_name  = "${var.environment}-worker"

  # Cross-region replica for DR
  enable_replica = var.enable_dr_replica
  replica_region = var.dr_replica_region

  depends_on = [google_service_networking_connection.private_services]
}

# =============================================================================
# Redis
# =============================================================================

module "redis" {
  source = "../../modules/redis"

  project_id    = var.project_id
  region        = var.region
  instance_name = "${var.environment}-redis-basic"

  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  vpc_network_id = google_compute_network.main.id

  auth_enabled            = false
  transit_encryption_mode = "DISABLED"

  labels = {
    environment = var.environment
  }

  depends_on = [google_service_networking_connection.private_services]
}

# =============================================================================
# Cloud Armor + Static IP for GKE Ingress
# =============================================================================

module "cloud_armor" {
  source = "../../modules/cloud-armor"

  project_id  = var.project_id
  policy_name = "${var.environment}-security-policy"

  # Rate limiting: 100 requests per minute per IP
  rate_limit_requests_per_interval = 100
  rate_limit_interval_sec          = 60

  # Enable OWASP rules (SQLi, XSS, LFI, RFI, RCE protection)
  enable_owasp_rules = true

  # Optional: block specific IP ranges
  blocked_ip_ranges = var.blocked_ip_ranges
}

# =============================================================================
# Storage Buckets
# =============================================================================

module "uploads_bucket" {
  source = "../../modules/storage"

  project_id   = var.project_id
  bucket_name  = "${var.project_id}-${var.environment}-uploads"
  location     = var.region
  storage_class = "STANDARD"

  versioning_enabled = true

  lifecycle_rules = [
    {
      action_type        = "Delete"
      age                = 365
      num_newer_versions = 3
    }
  ]

  cors_config = {
    origins          = var.cors_origins
    methods          = ["GET", "PUT", "POST", "DELETE"]
    response_headers = ["Content-Type", "Content-Length"]
    max_age_seconds  = 3600
  }

  admin_members = [
    "serviceAccount:${local.api_sa_email}",
  ]

  labels = {
    environment = var.environment
  }
}

# =============================================================================
# Desktop App Releases Bucket (Electron auto-update)
# =============================================================================
# Public read access so electron-updater can fetch latest.yml + installer.
# GitHub Actions uploads releases here during CI/CD.

module "desktop_releases_bucket" {
  source = "../../modules/storage"

  project_id    = var.project_id
  bucket_name   = "${var.project_id}-desktop-releases"
  location      = var.region
  storage_class = "STANDARD"

  versioning_enabled = true

  lifecycle_rules = [
    {
      action_type        = "Delete"
      num_newer_versions = 5  # Keep last 5 versions
    }
  ]

  admin_members = [
    "serviceAccount:${google_service_account.github_actions.email}",
  ]

  # Public read for electron-updater
  viewer_members = [
    "allUsers",
  ]

  labels = {
    environment = var.environment
  }
}

# =============================================================================
# Secrets
# =============================================================================

module "secrets" {
  source = "../../modules/secrets"

  project_id = var.project_id

  secrets = {
    # DATABASE_URL connects to Cloud SQL Auth Proxy sidecar (localhost:5432)
    # The proxy handles mTLS to Cloud SQL, so no sslmode needed
    "database-url" = {
      value = "postgresql://${var.database_user}:${var.database_password}@localhost:5432/${var.database_name}"
      accessors = [
        "serviceAccount:${local.api_sa_email}",
        "serviceAccount:${local.worker_sa_email}",
      ]
    }
    "redis-url" = {
      value = module.redis.connection_string
      accessors = [
        "serviceAccount:${local.api_sa_email}",
        "serviceAccount:${local.worker_sa_email}",
      ]
    }
    "nextauth-secret" = {
      accessors = [
        "serviceAccount:${local.web_sa_email}",
      ]
    }
    "resend-api-key" = {
      accessors = [
        "serviceAccount:${local.worker_sa_email}",
      ]
    }
  }

  labels = {
    environment = var.environment
  }
}

# =============================================================================
# Workload Service Accounts (for Workload Identity)
# =============================================================================

resource "google_service_account" "api" {
  account_id   = "${var.environment}-api"
  display_name = "API Service Account"
  project      = var.project_id
}

resource "google_service_account" "worker" {
  account_id   = "${var.environment}-worker"
  display_name = "Worker Service Account"
  project      = var.project_id
}

resource "google_service_account" "web" {
  account_id   = "${var.environment}-web"
  display_name = "Web Service Account"
  project      = var.project_id
}

# Workload Identity bindings
resource "google_service_account_iam_member" "api_workload_identity" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.k8s_namespace}/api]"
}

resource "google_service_account_iam_member" "worker_workload_identity" {
  service_account_id = google_service_account.worker.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.k8s_namespace}/worker]"
}

resource "google_service_account_iam_member" "web_workload_identity" {
  service_account_id = google_service_account.web.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.k8s_namespace}/web-hta]"
}

# Cloud SQL Client role for Auth Proxy IAM authentication
resource "google_project_iam_member" "api_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "worker_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_project_iam_member" "web_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.web.email}"
}

# =============================================================================
# Artifact Registry
# =============================================================================

resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "${var.environment}-docker"
  description   = "Docker repository for ${var.environment}"
  format        = "DOCKER"
  project       = var.project_id
}

# =============================================================================
# GitHub Actions Workload Identity Federation
# =============================================================================

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  project                   = var.project_id
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  project                            = var.project_id

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  # Restrict to only your repository
  attribute_condition = "assertion.repository == '${var.github_repo}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_actions" {
  account_id   = "github-actions"
  display_name = "GitHub Actions"
  project      = var.project_id
}

resource "google_service_account_iam_member" "github_actions_workload_identity" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# Grant GitHub Actions SA necessary permissions
resource "google_project_iam_member" "github_actions_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_project_iam_member" "github_actions_gke_developer" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.github_actions.email}"
}

# =============================================================================
# IAP for Argo CD
# =============================================================================

# IAP module disabled - requires GCP Organization
# To enable: add project to a GCP Organization, then uncomment
# module "iap" {
#   source = "../../modules/iap"
#
#   project_id          = var.project_id
#   support_email       = var.iap_support_email
#   application_title   = "HTA Platform"
#   client_display_name = "Argo CD IAP Client"
#
#   # Who can access Argo CD (Google account emails)
#   authorized_members = var.iap_authorized_members
# }

# =============================================================================
# Cloud SQL Long-Term Export (3-year retention)
# =============================================================================
# GCP built-in backups max at 365 days. This exports daily to GCS with a
# 3-year lifecycle rule for audit/compliance retention.
# Estimated cost: ~$1-2/month (Nearline storage)

module "sql_export" {
  source = "../../modules/sql-export"

  project_id            = var.project_id
  region                = var.region
  bucket_name           = "${var.project_id}-sql-exports"
  sql_instance_name     = module.cloudsql.instance_name
  sql_instance_sa_email = module.cloudsql.service_account_email
  database_name         = var.database_name
  retention_days        = 1095  # 3 years

  labels = {
    environment = var.environment
  }
}

# =============================================================================
# Monitoring & Alerting
# =============================================================================
# Note: Some alerts are disabled until custom metrics exist (apps must emit them)
# See modules/monitoring/alerts.tf and modules/monitoring/slo.tf for details

module "monitoring" {
  source = "../../modules/monitoring"

  project_id  = var.project_id
  environment = var.environment

  services = ["web", "api", "worker"]

  # Thresholds
  error_rate_threshold    = 0.05  # 5%
  latency_threshold_ms    = 500
  db_connection_threshold = 80
  queue_depth_threshold   = 100

  # SLO targets
  availability_slo = 99.9
  latency_slo_ms   = 200

  # DR monitoring
  enable_replica_monitoring = var.enable_dr_replica

  # Notifications (configure via tfvars)
  notification_channels = var.monitoring_notification_channels
  enable_pagerduty      = var.enable_pagerduty
  pagerduty_service_key = var.pagerduty_service_key
}
