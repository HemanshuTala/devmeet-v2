"""
Orchestrator Service Sub-Routers Package.
========================================
Modular router components for interview session orchestration:
- `deps`: Shared dependencies, authentication, caching, and guards.
- `sessions`: Session creation, listing, retrieval, start, complete, cancel, and heartbeat.
- `turns`: Conversation dialogue turns transcription and session pause/resume.
- `proctoring`: Code submissions, anti-cheating violations, and recording consent.
- `snapshots`: S3 snapshot backups, restore, and presigned download URLs.
"""
