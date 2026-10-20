"""
================================================================================
FEEDBACK SERVICE — APPLICATION LIFECYCLE & ENTRY POINT (PORT 8007)
================================================================================
Role & Responsibility:
  This module serves as the primary ASGI application entry point for the Feedback Service.
  It coordinates:
    1. Post-Interview Evaluation: Aggregates interview conversation logs, code submissions,
       and proctoring signals to compute multi-dimensional scores (technical, communication,
       problem-solving).
    2. Executive PDF Report Generation: Renders production-quality, styled PDF scorecards
       complete with percentile rank benchmarks and candidate recommendations.
    3. Asynchronous Lifespan Management: Connects to the PostgreSQL connection pool on startup
       and gracefully drains active database clients on shutdown.
    4. Observability & Tracing: Propagates distributed correlation IDs (`X-Request-ID`)
       for cross-service diagnostics.
================================================================================
"""

import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router, close_feedback_http_client
from .database import db
from .middleware import RequestIDMiddleware

# Initialize FastAPI application instance with service documentation metadata
app = FastAPI(
    title="Feedback Service",
    description="AI-generated post-interview evaluation reports and PDF generation",
    version="1.0.0",
)

# ==============================================================================
# MIDDLEWARE PIPELINE CONFIGURATION
# ==============================================================================

# CORS Middleware: Restricts browser cross-origin calls to the Next.js frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Distributed Tracing Middleware: Injects X-Request-ID into request context and response headers
app.add_middleware(RequestIDMiddleware)


# ==============================================================================
# LIFECYCLE EVENT HANDLERS (STARTUP & SHUTDOWN)
# ==============================================================================

@app.on_event("startup")
async def startup_event():
    """
    Application startup event handler.
    Initializes PostgreSQL connection pool and verifies table schemas.
    """
    await db.connect()


@app.on_event("shutdown")
async def shutdown_event():
    """
    Application shutdown event handler.
    Gracefully terminates database connections and pooled HTTP clients to prevent socket leaks.
    """
    await close_feedback_http_client()
    await db.disconnect()


# Attach all API endpoints under standard /api/v1 prefix
app.include_router(router)


# ==============================================================================
# HEALTH & DIAGNOSTIC ENDPOINTS
# ==============================================================================

@app.get("/health")
async def health_check():
    """
    Liveness and readiness probe for Docker Compose / Kubernetes.

    Returns:
      dict: Service status, identifier, and boolean PostgreSQL connectivity state.
    """
    return {
        "status": "healthy",
        "service": "feedback-service",
        "postgres_connected": db.use_db,
    }


@app.get("/")
async def root():
    """
    Root discovery endpoint confirming API presence.

    Returns:
      dict: Welcome message.
    """
    return {"message": "Feedback Service API"}


# Local standalone execution for development/debugging
if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8007, reload=True)
