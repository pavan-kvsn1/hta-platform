# =============================================================================
# WireGuard Gateway Module
# =============================================================================
# Provisions a lightweight (e2-micro, free-tier) WireGuard VPN gateway inside
# the production VPC. Engineers connect from their Windows laptops to reach
# the private API at 10.8.3.226 without exposing it to the public internet.
#
# Peer management is file-based via GCS:
#   gs://<bucket>/peers.conf  — list of authorised engineer public keys
#   gs://<bucket>/server-public.key  — server public key (read by provisioning API)
#   gs://<bucket>/server-private.key — server private key (VM only, survives recreation)
#
# The VM polls GCS every 30s and applies changes live via `wg syncconf`.
# =============================================================================

locals {
  zone        = var.zone != "" ? var.zone : "${var.region}-a"
  bucket_name = "${var.project_id}-wireguard"
}

# ─── Service Account ──────────────────────────────────────────────────────────

resource "google_service_account" "wireguard_vm" {
  project      = var.project_id
  account_id   = "${var.environment}-wireguard-vm"
  display_name = "WireGuard Gateway VM"
}

# VM SA needs to read/write its own bucket (keys + peers)
resource "google_storage_bucket_iam_member" "vm_bucket_admin" {
  bucket = google_storage_bucket.wireguard.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.wireguard_vm.email}"
}

# API SA needs to read server-public.key and write peers.conf
resource "google_storage_bucket_iam_member" "api_bucket_admin" {
  bucket = google_storage_bucket.wireguard.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.api_sa_email}"
}

# ─── GCS Bucket (peer management) ─────────────────────────────────────────────

resource "google_storage_bucket" "wireguard" {
  name          = local.bucket_name
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  # Private — no public access
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions = 10 # Keep last 10 versions of peers.conf
    }
  }

  labels = var.labels
}

# ─── Static External IP ───────────────────────────────────────────────────────

resource "google_compute_address" "wireguard" {
  name    = "${var.environment}-wireguard"
  project = var.project_id
  region  = var.region

  labels = var.labels
}

# ─── VM Instance ──────────────────────────────────────────────────────────────

resource "google_compute_instance" "wireguard" {
  name         = "${var.environment}-wireguard-gateway"
  project      = var.project_id
  zone         = local.zone
  machine_type = var.machine_type

  # Allow VM recreation without destroying peers (key is in GCS)
  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 10 # GB — minimal, OS only
      type  = "pd-standard"
    }
  }

  network_interface {
    network    = var.network
    subnetwork = var.subnetwork

    access_config {
      nat_ip = google_compute_address.wireguard.address
    }
  }

  service_account {
    email  = google_service_account.wireguard_vm.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    startup-script = templatefile("${path.module}/startup.sh.tpl", {
      project_id  = var.project_id
      bucket_name = local.bucket_name
      wg_subnet   = var.wg_subnet
      server_ip   = var.server_ip
    })
  }

  tags = ["wireguard-gateway"]

  labels = var.labels

  lifecycle {
    # Allow replacement when startup script changes (keys persist in GCS)
    replace_triggered_by = [null_resource.startup_script_hash]
  }
}

# Trigger VM replacement when startup script changes
resource "null_resource" "startup_script_hash" {
  triggers = {
    script_hash = md5(templatefile("${path.module}/startup.sh.tpl", {
      project_id  = var.project_id
      bucket_name = local.bucket_name
      wg_subnet   = var.wg_subnet
      server_ip   = var.server_ip
    }))
  }
}

# ─── Firewall Rules ───────────────────────────────────────────────────────────

# Allow WireGuard handshake from anywhere (UDP 51820)
resource "google_compute_firewall" "wireguard_ingress" {
  name    = "${var.environment}-allow-wireguard"
  project = var.project_id
  network = var.network

  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "udp"
    ports    = ["51820"]
  }

  target_tags   = ["wireguard-gateway"]
  source_ranges = ["0.0.0.0/0"]

  description = "Allow WireGuard VPN handshakes from engineer laptops"
}

# Allow VPN clients (10.100.0.0/24) to reach the API (10.8.3.226:4000)
# Traffic arrives masqueraded as the WireGuard VM's internal IP (NAT PostUp rule).
# GKE nodes have no custom network tags, so we target by GKE node service account.
resource "google_compute_firewall" "wireguard_to_api" {
  name    = "${var.environment}-wireguard-to-api"
  project = var.project_id
  network = var.network

  direction = "INGRESS"
  priority  = 900

  allow {
    protocol = "tcp"
    ports    = ["4000"]
  }

  source_service_accounts = [google_service_account.wireguard_vm.email]
  target_service_accounts = [var.gke_nodes_sa_email]

  description = "Allow WireGuard gateway to forward traffic to GKE nodes on API port"
}

# Allow SSH to WireGuard VM from internal network only (for debugging)
resource "google_compute_firewall" "wireguard_ssh" {
  name    = "${var.environment}-wireguard-ssh-internal"
  project = var.project_id
  network = var.network

  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  target_tags   = ["wireguard-gateway"]
  source_ranges = ["10.0.0.0/20"] # VPC subnet only — no public SSH

  description = "Allow SSH to WireGuard VM from VPC only"
}
