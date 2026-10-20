"""
================================================================================
DevMeet v2.0 - Auth Service Entry Point (`main.py`)
================================================================================
Responsibility:
    Initializes and boots the FastAPI server for the Authentication Service.
    Configures database lifecycle connections, Cross-Origin Resource Sharing (CORS),
    request tracking middleware, and route mounting.

Port:
    Runs on internal container port 8001 (proxied via API Gateway on port 8000).

Architectural Role:
    The Auth Service is the central security authority of the microservices ecosystem.
    Every candidate and administrator authenticates here to obtain cryptographically
    signed JSON Web Tokens (JWTs). All other services verify tokens issued by this service.
================================================================================
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import db
from .routes import router
from .middleware import RequestIDMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application startup and shutdown lifecycle events.

    Startup:
        - Establishes a connection pool to the PostgreSQL database (`devmeet` database).
        - If PostgreSQL is temporarily down, the database manager initializes an in-memory
          mock database so the service can still boot without crashing.

    Shutdown:
        - Gracefully closes open database connections to prevent connection leaks.

    Args:
        app (FastAPI): The running FastAPI application instance.
    """
    # ── 1. Startup phase: initialize persistent resources ──────────────────────
    await db.connect()
    yield
    # ── 2. Shutdown phase: cleanup and close connection pools ───────────────────
    await db.disconnect()


# Initialize the primary FastAPI application with metadata for OpenAPI documentation
app = FastAPI(
    title="Auth Service",
    description="Authentication, JWT token lifecycle, OAuth2, and Role-Based Access Control (RBAC)",
    version="1.0.0",
    lifespan=lifespan
)

# ── Middleware Configuration ──────────────────────────────────────────────────
# Configure Cross-Origin Resource Sharing (CORS) so the Next.js frontend can communicate
# with this service during direct development calls. In production, requests flow through Nginx.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inject unique X-Request-ID headers for distributed telemetry and request tracking
app.add_middleware(RequestIDMiddleware)

# Mount all authentication endpoint routes under /api/v1/auth
app.include_router(router)


@app.get("/health")
async def health_check():
    """
    Health check probe endpoint.

    Used by Docker Compose and Kubernetes liveness/readiness probes to determine
    if the Auth Service container is alive and accepting incoming HTTP traffic.

    Returns:
        dict: Status message confirming health and service name.
    """
    return {"status": "healthy", "service": "auth-service"}


@app.get("/")
async def root():
    """
    Root informational endpoint.

    Returns:
        dict: Welcome confirmation message.
    """
    return {"message": "Auth Service API"}


# Allow direct execution via python -m app.main
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
