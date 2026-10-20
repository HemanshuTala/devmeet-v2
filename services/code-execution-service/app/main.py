"""
================================================================================
CODE EXECUTION SERVICE — APPLICATION LIFECYCLE & ENTRY POINT
================================================================================
Role & Responsibility:
  This module serves as the primary ASGI entry point for the Code Execution Service (Port 8005).
  It isolates candidate code execution within secured, resource-limited Docker containers
  or subprocess sandboxes, preventing malicious code from exploiting host resources.

Key Capabilities:
  - Docker Sandbox Isolation: Executes user code with strictly capped CPU, memory,
    and network isolation (no internet access inside container).
  - Background Queue Worker: Initializes an asynchronous Redis queue consumer on startup
    to process heavy code submissions asynchronously without blocking HTTP threads.
  - Request ID Correlation: Tracks execution workflows across distributed service calls.
  - Cross-Origin Resource Sharing (CORS): Configured for Next.js frontend communication.
================================================================================
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .middleware import RequestIDMiddleware

# Initialize FastAPI application instance with metadata
app = FastAPI(
    title="Code Execution Service",
    description="Secure code execution using Docker containers and sandboxed runtimes",
    version="1.0.0",
)

# ==============================================================================
# MIDDLEWARE STACK CONFIGURATION
# ==============================================================================

# CORS Middleware: Allows frontend browser access while restricting arbitrary origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Correlation Tracking Middleware: Injects X-Request-ID into request context and response headers
app.add_middleware(RequestIDMiddleware)

# Attach API endpoints under /api/v1 prefix
app.include_router(router)


# ==============================================================================
# LIFECYCLE EVENTS
# ==============================================================================

@app.on_event("startup")
async def startup_event():
    """
    Application startup event handler.

    Responsibilities:
      Spawns the background Redis Queue Worker thread to consume asynchronous
      code submission jobs (`submission_runner.py`) from Redis queues.
    """
    from .queue_manager import start_queue_worker
    start_queue_worker()


# ==============================================================================
# HEALTH & DIAGNOSTIC ENDPOINTS
# ==============================================================================

@app.get("/health")
async def health_check():
    """
    Liveness and readiness health check probe for Docker Compose / Kubernetes.

    Returns:
      dict: Service health status and identifier.
    """
    return {"status": "healthy", "service": "code-execution-service"}


@app.get("/")
async def root():
    """
    Root discovery endpoint confirming API presence.

    Returns:
      dict: Welcome message.
    """
    return {"message": "Code Execution Service API"}


# Local standalone execution for development/debugging
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
