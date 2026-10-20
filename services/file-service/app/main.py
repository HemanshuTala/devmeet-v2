"""
DevMeet File Service - Microservice Application Entry Point
===========================================================
This module configures the FastAPI HTTP application runtime for document uploads,
binary streaming, static asset serving, and cloud storage management.

Key Architectural Responsibilities:
1. Static File Serving:
   - Mounts the local `uploads/` directory under `/uploads` using Starlette's `StaticFiles`.
   - Ensures zero-configuration fallback when cloud object storage (S3) is not enabled.
2. Middleware Infrastructure:
   - Restricts CORS access to trusted frontend client origins.
   - Enforces `RequestIDMiddleware` for distributed request correlation and latency tracking.
3. API Routing:
   - Registers all file management endpoints under `/api/v1/files`.
4. Operational Probes:
   - `/health` diagnostic probe reports operational status and active storage mode ('s3' or 'local').
"""

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from .routes import router
from .middleware import RequestIDMiddleware

# Create FastAPI application instance
app = FastAPI(title="DevMeet File Service", version="1.0.0")

# Cross-Origin Resource Sharing (CORS) security configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Distributed correlation tracing and latency header middleware
app.add_middleware(RequestIDMiddleware)

# Ensure local disk upload directory exists
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount local uploads directory for static file access in local mode
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Mount REST endpoints for file upload and retrieval
app.include_router(router)


@app.get("/health")
def health_check():
    """
    Health check diagnostic probe returning service status and storage backend mode.

    Returns:
        dict: Service health, identifier, and active storage mode ('s3' vs 'local').
    """
    return {
        "status": "healthy",
        "service": "file-service",
        "storage_mode": "s3" if os.getenv("AWS_ACCESS_KEY_ID") else "local"
    }


@app.get("/")
def read_root():
    """
    Root discovery endpoint providing service identity banner.

    Returns:
        dict: Welcome message.
    """
    return {"message": "DevMeet File Service API"}
