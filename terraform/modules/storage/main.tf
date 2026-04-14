# =============================================================================
# Cloud Storage Module
# =============================================================================

resource "google_storage_bucket" "main" {
  name          = var.bucket_name
  project       = var.project_id
  location      = var.location
  storage_class = var.storage_class

  uniform_bucket_level_access = true

  versioning {
    enabled = var.versioning_enabled
  }

  dynamic "lifecycle_rule" {
    for_each = var.lifecycle_rules
    content {
      action {
        type          = lifecycle_rule.value.action_type
        storage_class = lookup(lifecycle_rule.value, "storage_class", null)
      }
      condition {
        age                   = lookup(lifecycle_rule.value, "age", null)
        num_newer_versions    = lookup(lifecycle_rule.value, "num_newer_versions", null)
        with_state            = lookup(lifecycle_rule.value, "with_state", null)
        matches_storage_class = lookup(lifecycle_rule.value, "matches_storage_class", null)
      }
    }
  }

  dynamic "cors" {
    for_each = var.cors_config != null ? [var.cors_config] : []
    content {
      origin          = cors.value.origins
      method          = cors.value.methods
      response_header = cors.value.response_headers
      max_age_seconds = cors.value.max_age_seconds
    }
  }

  labels = var.labels
}

# IAM binding for service account access
resource "google_storage_bucket_iam_member" "admin" {
  for_each = toset(var.admin_members)

  bucket = google_storage_bucket.main.name
  role   = "roles/storage.admin"
  member = each.value
}

resource "google_storage_bucket_iam_member" "viewer" {
  for_each = toset(var.viewer_members)

  bucket = google_storage_bucket.main.name
  role   = "roles/storage.objectViewer"
  member = each.value
}
