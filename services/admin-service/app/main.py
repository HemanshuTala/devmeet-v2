"""
================================================================================
ADMIN SERVICE — APPLICATION LIFECYCLE & ENTRY POINT (PORT 8009)
================================================================================
Role & Responsibility:
  This module serves as the primary ASGI entry point for the Admin Service.
  It provides centralized back-office administration, role-based access control (RBAC),
  user moderation, subscription management, security audit logging, and system health checks:
    1. Candidate & User Management: User status toggles (active, suspended, banned),
       tier overrides (free, pro, enterprise), and manual quota resets.
    2. Session & Proctoring Auditing: Real-time inspection of active interview sessions,
       proctoring violation flags (multiple faces, look-aways, tab switching), and code replays.
    3. Asynchronous Connection Lifespan: Automatically initializes `asyncpg` connection
       pool on startup and drains sockets on shutdown.
    4. Tracing & Observability: Mounts `RequestIDMiddleware` for cross-service distributed tracing.
================================================================================
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .database import db
from .middleware import RequestIDMiddleware

# Initialize FastAPI application instance with metadata
app = FastAPI(
    title="DevMeet Admin Service",
    description="Back-office user moderation, subscription overrides, and proctoring audit administration",
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
    Establishes connection pool with the PostgreSQL cluster.
    """
    await db.connect()


@app.on_event("shutdown")
async def shutdown_event():
    """
    Application shutdown event handler.
    Gracefully drains all active database connection pool clients.
    """
    await db.disconnect()


# Attach all admin endpoints under standard /api/v1 prefix
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
        "service": "admin-service",
        "postgres_connected": db.use_db,
    }


@app.get("/")
def read_root():
    """
    Root discovery endpoint confirming API presence.

    Returns:
      dict: Welcome message.
    """
    return {"message": "DevMeet Admin Service API"}
