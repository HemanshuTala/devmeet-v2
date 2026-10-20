"""
DevMeet File & Storage Service Package
======================================
This microservice manages candidate resume uploads, interview coding snapshots,
audio/video recording attachments, avatar storage, and secure presigned URL generation.

Key Components:
- `storage`: S3/MinIO cloud object storage driver with automatic local directory fallback.
- `routes`: Endpoints for uploading, streaming, generating download URLs, and deleting files.
- `middleware`: Distributed correlation tracing and latency instrumentation.
"""
