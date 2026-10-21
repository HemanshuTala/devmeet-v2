"""
================================================================================
ANALYTICS SERVICE — APPLICATION LIFECYCLE & ENTRY POINT (PORT 8009)
================================================================================
Role & Responsibility:
  This module serves as the primary ASGI application entry point for the Analytics Service.
  It tracks and aggregates high-level platform intelligence, candidate preparation trends,
  score progression, proctoring violation rates, and system-wide performance:
    1. Candidate Growth Metrics: Tracks historical score trends, interview counts,
       and topic mastery across DSA, System Design, and Behavioral tracks.
    2. Administrative Insights: Surfaces cohort percentiles, platform usage volume,
       and average interview durations for engineering leadership.
    3. Asynchronous Connection Lifespan: Initializes an `asyncpg` connection pool on startup
       and gracefully drains active connections on application shutdown.
    4. Distributed Tracing: Implements `RequestIDMiddleware` for trace propagation.
================================================================================
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router, close_analytics_http_client
from .database import db
from .middleware import RequestIDMiddleware

# Initialize FastAPI application instance with metadata
app = FastAPI(
    title="DevMeet Analytics Service",
    description="Platform-wide metrics, candidate progression analytics, and cohort reporting",
    version="1.0.0",
)

# ==============================================================================
# MIDDLEWARE STACK CONFIGURATION
# ==============================================================================

# CORS Middleware: Restricts access to configured frontend web clients
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
# LIFECYCLE EVENT HANDLERS
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
    Gracefully closes open database pool connections and pooled HTTP client.
    """
    await close_analytics_http_client()
    await db.disconnect()


# Attach all analytics endpoints under standard /api/v1 prefix
app.include_router(router)


# ==============================================================================
# HEALTH & DIAGNOSTIC ENDPOINTS
# ==============================================================================

@app.get("/health")
def health_check():
    """
    Liveness and readiness probe for Docker Compose / Kubernetes.

    Returns:
      dict: Service status, identifier, and boolean PostgreSQL connectivity state.
    """
    return {
        "status": "healthy",
        "service": "analytics-service",
        "postgres_connected": db.use_db,
    }


@app.get("/")
def read_root():
    """
    Root discovery endpoint confirming API presence.

    Returns:
      dict: Welcome message.
    """
    return {"message": "DevMeet Analytics Service API"}
