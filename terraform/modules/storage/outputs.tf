output "bucket_name" {
  description = "Storage bucket name"
  value       = google_storage_bucket.main.name
}

output "bucket_url" {
  description = "Storage bucket URL"
  value       = google_storage_bucket.main.url
}

output "bucket_self_link" {
  description = "Storage bucket self link"
  value       = google_storage_bucket.main.self_link
}
