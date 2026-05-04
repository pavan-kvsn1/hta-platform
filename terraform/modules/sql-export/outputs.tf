output "bucket_name" {
  description = "GCS bucket name for SQL exports"
  value       = google_storage_bucket.sql_exports.name
}

output "workflow_id" {
  description = "Cloud Workflow ID"
  value       = google_workflows_workflow.sql_export.id
}

output "scheduler_job_name" {
  description = "Cloud Scheduler job name"
  value       = google_cloud_scheduler_job.sql_export.name
}
