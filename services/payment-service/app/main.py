"""
DevMeet Payment Service - Microservice Application Entry Point
==============================================================
This module configures the FastAPI HTTP application runtime for subscription billing,
mock payment processing, and candidate plan management.
"""

import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .routes import router, close_payment_http_client
from .database import db
from .middleware import RequestIDMiddleware
from .config import PAYMENT_MODE

# Load environment variables from .env file if present
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the lifecycle events of the payment service application.
    Connects to the database on boot and releases connections on shutdown.
    """
    await db.connect()
    yield
    await close_payment_http_client()
    await db.disconnect()


app = FastAPI(
    title="DevMeet Payment Service",
    version="1.0.0",
    description="Subscription lifecycle, mock payment sandbox, and plan management",
    lifespan=lifespan,
)

# Cross-Origin Resource Sharing (CORS) security policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000"), "*"],
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
    """
    return {
        "status": "healthy",
        "service": "payment-service",
        "db_connected": not db._use_memory,
        "payment_mode": PAYMENT_MODE,
        "mock_payment": True,
    }


@app.get("/")
def root():
    """
    Root discovery endpoint providing service identity and designated default port.
    """
    return {"message": "DevMeet Payment Service (Mock Payment Enabled)", "port": 8012}
