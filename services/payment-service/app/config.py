"""
DevMeet Payment Service - Configuration & Environment Settings
==============================================================
Configures payment gateway simulation parameters and inter-service routing.
Runs in clean mock payment mode for fast, deterministic demo and interview testing.
"""

import os

# Internal microservice routing targets
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8002")
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Payment Mode
PAYMENT_MODE = os.getenv("PAYMENT_MODE", "mock").lower()
