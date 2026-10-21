"""
DevMeet Search Service - Microservice Application Entry Point
=============================================================
This module configures the FastAPI HTTP application runtime for full-text problem discovery,
keyword autocomplete, question bank queries, and company-specific interview prep.

Key Architectural Responsibilities:
1. HTTP Middleware Stack:
   - Configures CORS policies for trusted frontend endpoints.
   - Attaches `RequestIDMiddleware` for distributed request correlation and latency tracking.
2. API Routing:
   - Registers all search endpoints under `/api/v1/search`.
3. Operational Telemetry:
   - Exposes `/health` with the loaded question count.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .middleware import RequestIDMiddleware

# Create FastAPI application instance
app = FastAPI(title="DevMeet Search Service", version="1.0.0")

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

# Mount REST endpoints for search queries
app.include_router(router)


@app.get("/health")
def health_check():
    """
    Diagnostic probe returning service status and the number of loaded questions.

    Returns:
        dict: Health status, service name, and question count.
    """
    from .search_engine import search_engine
    return {
        "status": "healthy",
        "service": "search-service",
        "question_count": len(search_engine.local_db),
    }


@app.get("/")
def read_root():
    """
    Root discovery endpoint providing service identity banner.

    Returns:
        dict: Service title message.
    """
    return {"message": "DevMeet Search Service API"}
