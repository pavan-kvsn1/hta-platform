# =============================================================================
# Secret Manager Module
# =============================================================================

resource "google_secret_manager_secret" "secrets" {
  for_each = var.secrets

  secret_id = each.key
  project   = var.project_id

  replication {
    auto {}
  }

  labels = merge(var.labels, lookup(each.value, "labels", {}))
}

resource "google_secret_manager_secret_version" "versions" {
  for_each = { for k, v in var.secrets : k => v if lookup(v, "value", null) != null }

  secret      = google_secret_manager_secret.secrets[each.key].id
  secret_data = each.value.value
}

# IAM bindings for secret access
resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each = { for item in local.secret_accessors : "${item.secret_id}-${item.member}" => item }

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value.secret_id].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}

locals {
  secret_accessors = flatten([
    for secret_id, secret in var.secrets : [
      for member in lookup(secret, "accessors", []) : {
        secret_id = secret_id
        member    = member
      }
    ]
  ])
}
