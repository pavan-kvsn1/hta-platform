# =============================================================================
# Cloud SQL Automated Export to GCS
# =============================================================================
# GCP's built-in backup retention maxes at 365 days.
# This module exports the database daily to GCS for long-term retention.
# Uses Cloud Workflows + Cloud Scheduler (serverless, no code to maintain).
# =============================================================================

# GCS bucket for SQL exports
resource "google_storage_bucket" "sql_exports" {
  name     = var.bucket_name
  project  = var.project_id
  location = var.region

  uniform_bucket_level_access = true
  storage_class               = "NEARLINE"  # Cost-effective for infrequent access

  lifecycle_rule {
    condition {
      age = var.retention_days
    }
    action {
      type = "Delete"
    }
  }

  labels = var.labels
}

# Service account for the export workflow
resource "google_service_account" "sql_export" {
  account_id   = "sql-export"
  display_name = "Cloud SQL Export Workflow"
  project      = var.project_id
}

# Workflow SA needs cloudsql.admin to trigger exports
resource "google_project_iam_member" "workflow_sql_admin" {
  project = var.project_id
  role    = "roles/cloudsql.admin"
  member  = "serviceAccount:${google_service_account.sql_export.email}"
}

# Cloud SQL's own service agent needs write access to the bucket
resource "google_storage_bucket_iam_member" "sql_sa_writer" {
  bucket = google_storage_bucket.sql_exports.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.sql_instance_sa_email}"
}

# Cloud Workflow that performs the export
resource "google_workflows_workflow" "sql_export" {
  name            = "sql-daily-export"
  project         = var.project_id
  region          = var.region
  service_account = google_service_account.sql_export.id

  source_contents = <<-YAML
    main:
      steps:
        - init:
            assign:
              - projectId: "${var.project_id}"
              - instanceName: "${var.sql_instance_name}"
              - bucketName: "${var.bucket_name}"
              - databaseName: "${var.database_name}"
        - getDate:
            call: sys.now
            result: currentTime
        - formatDate:
            assign:
              - exportDate: $${text.substring(time.format(currentTime, "UTC"), 0, 10)}
              - exportUri: $${"gs://" + bucketName + "/daily/" + exportDate + ".sql.gz"}
        - exportDatabase:
            call: googleapis.sqladmin.v1.instances.export
            args:
              project: $${projectId}
              instance: $${instanceName}
              body:
                exportContext:
                  fileType: SQL
                  uri: $${exportUri}
                  databases:
                    - $${databaseName}
            result: exportResult
        - returnResult:
            return: $${exportResult}
  YAML
}

# Cloud Scheduler triggers the workflow daily
resource "google_cloud_scheduler_job" "sql_export" {
  name      = "sql-daily-export"
  project   = var.project_id
  region    = var.region
  schedule  = var.schedule
  time_zone = var.time_zone

  http_target {
    uri         = "https://workflowexecutions.googleapis.com/v1/${google_workflows_workflow.sql_export.id}/executions"
    http_method = "POST"
    body        = base64encode("{}")

    oauth_token {
      service_account_email = google_service_account.sql_export.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
}

# Workflow SA needs invoker permission (for scheduler to trigger it)
resource "google_project_iam_member" "workflow_invoker" {
  project = var.project_id
  role    = "roles/workflows.invoker"
  member  = "serviceAccount:${google_service_account.sql_export.email}"
}
