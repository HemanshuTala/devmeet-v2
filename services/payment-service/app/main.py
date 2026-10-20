"""
DevMeet Payment Service - Microservice Application Entry Point
==============================================================
This module configures the FastAPI HTTP application runtime for subscription billing,
Razorpay order creation, payment signature verification, and entitlement management.

Key Architectural Responsibilities:
1. Lifespan Management:
   - Initializes asynchronous PostgreSQL connection pooling on startup (`lifespan`).
   - Closes open connection pools cleanly on application shutdown.
2. HTTP Middleware Pipeline:
   - Configures Cross-Origin Resource Sharing (CORS) restricted to authorized frontend origins.
   - Attaches `RequestIDMiddleware` for distributed request correlation and latency tracking.
3. API Routing:
   - Mounts payment, subscription, and webhook routes under `/api/v1/payment`.
4. Operational Telemetry & Liveness Probes:
   - `/health` endpoint exposes relational database status, Razorpay configuration validity,
     and gateway key verification for Kubernetes/Docker container health probes.
"""

import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routes import router
from .database import db
from .middleware import RequestIDMiddleware
from .config import razorpay_enabled, RAZORPAY_KEY_ID

# Load environment variables from .env file if present
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the lifecycle events of the payment service application.
    Connects to the database on boot and releases connections on shutdown.
    """
    # Initialize database pool on service start
    await db.connect()
    yield
    # Safely drain and disconnect pool connections on shutdown
    await db.disconnect()


# Instantiate FastAPI application instance
app = FastAPI(
    title="DevMeet Payment Service",
    version="1.0.0",
    description="Razorpay billing, subscription lifecycle, and plan management",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS) security policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Distributed correlation tracing and latency header middleware
app.add_middleware(RequestIDMiddleware)

# Register REST endpoints for payment operations
app.include_router(router)


@app.get("/health")
async def health():
    """
    Liveness and operational readiness diagnostic probe for orchestrators.

    Returns:
        dict: Service health status, database connection mode, and Razorpay setup state.
    """
    return {
        "status": "healthy",
        "service": "payment-service",
        "db_connected": not db._use_memory,
        "razorpay_configured": razorpay_enabled(),
        "razorpay_key_prefix": RAZORPAY_KEY_ID[:12] + "..." if RAZORPAY_KEY_ID else None,
    }


@app.get("/")
def root():
    """
    Root discovery endpoint providing service identity and designated default port.

    Returns:
        dict: Service title and port metadata.
    """
    return {"message": "DevMeet Payment Service", "port": 8012}
