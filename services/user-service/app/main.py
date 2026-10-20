"""
User Service Application Entry Point.
=====================================
Port: 8002
Service Responsibility:
-----------------------
The User Service manages user profiles, candidate settings/preferences, subscription
tiers (Free, Pro, Enterprise), and interview quota enforcement.

Architectural Placement:
------------------------
- Upstream: Proxied by Nginx API Gateway (`/api/v1/users`).
- Downstream: Communicates with PostgreSQL database (`devmeet` database).
- Inter-service Interaction:
  - Called by `orchestrator-service` to check and decrement daily/monthly interview quotas
    before an AI interview session begins.
  - Called by `payment-service` via internal webhooks to upgrade user plans upon successful Stripe checkout.
  - Used by Next.js frontend to fetch and update candidate avatar, bio, target job roles, and experience levels.
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
    Manages the lifecycle of the User Service application.
    
    Startup:
    - Establishes the asynchronous PostgreSQL connection pool via `asyncpg`.
    
    Shutdown:
    - Gracefully drains and closes all active database connections in the pool
      to prevent connection leaks or abrupt client drops.
    """
    # ─── Startup Phase ───
    await db.connect()
    yield
    # ─── Shutdown Phase ───
    await db.disconnect()


# Initialize the FastAPI application instance
app = FastAPI(
    title="User Service",
    description="User profile, settings, subscription tiers, and interview quota management",
    version="1.0.0",
    lifespan=lifespan
)

# ─── Cross-Origin Resource Sharing (CORS) ─────────────────────────────────────
# Restricts browser cross-origin requests to trusted frontend domains while allowing
# credentials (cookies, authorization headers) across microservices.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Distributed Tracing Middleware ───────────────────────────────────────────
# Injects or propagates `X-Request-ID` across HTTP headers and logs request duration
app.add_middleware(RequestIDMiddleware)

# Mount all user, profile, preference, and quota routes under `/api/v1/users`
app.include_router(router)


@app.get("/health")
async def health_check():
    """
    Standard container health check endpoint.
    
    Queried by Docker healthchecks, Kubernetes liveness probes, and the API Gateway.
    Returns HTTP 200 with service status metadata when the process is responsive.
    """
    return {"status": "healthy", "service": "user-service"}


@app.get("/")
async def root():
    """
    Root informational endpoint for diagnostic verification.
    """
    return {"message": "User Service API"}


if __name__ == "__main__":
    # Local development runner using Uvicorn ASGI server
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
