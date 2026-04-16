# =============================================================================
# HTA Platform - Development Environment
# =============================================================================
# Cost-optimized configuration for development/staging
# Target: ~$50-70/month (half of production)
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
    prefix = "dev"
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
# GKE Cluster (Cost-optimized: smaller nodes, single zone)
# =============================================================================

module "gke" {
  source = "../../modules/gke"

  project_id   = var.project_id
  region       = var.region
  cluster_name = "${var.environment}-cluster"
  environment  = var.environment

  network    = google_compute_network.main.name
  subnetwork = google_compute_subnetwork.main.name

  pods_range_name     = "pods"
  services_range_name = "services"

  # Dev: smaller machines, fewer nodes
  node_pool_name  = "default-pool"
  min_node_count  = 1
  max_node_count  = 3
  machine_type    = var.gke_machine_type  # e2-medium for dev
  disk_size_gb    = var.gke_disk_size_gb  # 30GB for dev
  node_locations  = var.gke_node_locations
  service_account = google_service_account.gke_nodes.email

  # Dev: use REGULAR channel for stability
  release_channel = "REGULAR"
}

# GKE Node Service Account
resource "google_service_account" "gke_nodes" {
  account_id   = "${var.environment}-gke-nodes"
  display_name = "GKE Node Service Account (${var.environment})"
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
# Cloud SQL (Cost-optimized: smaller tier, no HA, shorter retention)
# =============================================================================

module "cloudsql" {
  source = "../../modules/cloudsql"

  project_id    = var.project_id
  region        = var.region
  instance_name = "${var.environment}-postgres"

  database_version = "POSTGRES_16"
  tier             = var.cloudsql_tier  # db-f1-micro or db-g1-small for dev
  disk_size        = var.cloudsql_disk_size

  # Dev: No HA, shorter retention, allow deletion
  availability_type     = "ZONAL"
  deletion_protection   = false
  backup_retention_days = 7

  vpc_network_id = google_compute_network.main.id

  database_name     = var.database_name
  database_user     = var.database_user
  database_password = var.database_password

  # Dev: No cross-region replica
  enable_replica = false

  depends_on = [google_service_networking_connection.private_services]
}

# =============================================================================
# Redis (Cost-optimized: BASIC tier, smaller memory)
# =============================================================================

module "redis" {
  source = "../../modules/redis"

  project_id    = var.project_id
  region        = var.region
  instance_name = "${var.environment}-redis"

  # Dev: BASIC tier (no HA), smaller memory
  tier           = "BASIC"
  memory_size_gb = var.redis_memory_size_gb  # 1GB for dev
  vpc_network_id = google_compute_network.main.id

  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  labels = {
    environment = var.environment
  }

  depends_on = [google_service_networking_connection.private_services]
}

# =============================================================================
# Cloud Armor (Same security, different policy name)
# =============================================================================

module "cloud_armor" {
  source = "../../modules/cloud-armor"

  project_id  = var.project_id
  policy_name = "${var.environment}-security-policy"

  # Same rate limiting as production
  rate_limit_requests_per_interval = 100
  rate_limit_interval_sec          = 60

  enable_owasp_rules = true
  blocked_ip_ranges  = var.blocked_ip_ranges
}

# =============================================================================
# Storage Buckets
# =============================================================================

module "uploads_bucket" {
  source = "../../modules/storage"

  project_id    = var.project_id
  bucket_name   = "${var.project_id}-${var.environment}-uploads"
  location      = var.region
  storage_class = "STANDARD"

  versioning_enabled = true

  # Dev: shorter retention
  lifecycle_rules = [
    {
      action_type        = "Delete"
      age                = 90
      num_newer_versions = 2
    }
  ]

  cors_config = {
    origins          = var.cors_origins
    methods          = ["GET", "PUT", "POST", "DELETE"]
    response_headers = ["Content-Type", "Content-Length"]
    max_age_seconds  = 3600
  }

  admin_members = [
    "serviceAccount:${google_service_account.api.email}",
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
    "database-url" = {
      value = "postgresql://${var.database_user}:${var.database_password}@${module.cloudsql.private_ip_address}:5432/${var.database_name}"
      accessors = [
        "serviceAccount:${google_service_account.api.email}",
        "serviceAccount:${google_service_account.worker.email}",
      ]
    }
    "redis-url" = {
      value = module.redis.connection_string
      accessors = [
        "serviceAccount:${google_service_account.api.email}",
        "serviceAccount:${google_service_account.worker.email}",
      ]
    }
    "nextauth-secret" = {
      accessors = [
        "serviceAccount:${google_service_account.web.email}",
      ]
    }
    "resend-api-key" = {
      accessors = [
        "serviceAccount:${google_service_account.worker.email}",
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
  display_name = "API Service Account (${var.environment})"
  project      = var.project_id
}

resource "google_service_account" "worker" {
  account_id   = "${var.environment}-worker"
  display_name = "Worker Service Account (${var.environment})"
  project      = var.project_id
}

resource "google_service_account" "web" {
  account_id   = "${var.environment}-web"
  display_name = "Web Service Account (${var.environment})"
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

# =============================================================================
# Artifact Registry (shared with production, or separate)
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
# Monitoring (Simplified for dev - no PagerDuty, basic alerts only)
# =============================================================================

module "monitoring" {
  source = "../../modules/monitoring"

  project_id  = var.project_id
  environment = var.environment

  services = ["web", "api", "worker"]

  # Relaxed thresholds for dev
  error_rate_threshold    = 0.10  # 10% (more lenient)
  latency_threshold_ms    = 1000  # 1 second
  db_connection_threshold = 90
  queue_depth_threshold   = 200

  # Lower SLO targets for dev
  availability_slo = 99.0
  latency_slo_ms   = 500

  # No DR monitoring in dev
  enable_replica_monitoring = false

  # Basic notifications only
  notification_channels = var.monitoring_notification_channels
  enable_pagerduty      = false
  pagerduty_service_key = ""
}
