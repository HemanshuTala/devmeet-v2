"""
DevMeet Payment Service - Configuration & Gateway Credential Verification
========================================================================
This module handles environment configuration, payment gateway credentials
(specifically Razorpay integration), inter-service endpoint routing, and
fallback sandbox detection.

Key Architectural Responsibilities:
1. Environment Ingestion:
   - Reads Razorpay API keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
   - Ingests HMAC webhook signing secret (`RAZORPAY_WEBHOOK_SECRET`).
   - Configures upstream microservice targets (`USER_SERVICE_URL`, `AUTH_SERVICE_URL`).
2. Gateway Sanity Validation:
   - `razorpay_enabled()` inspects credentials to detect missing or placeholder values.
   - Automatically switches between live gateway communication and local mock simulation.
3. Webhook Secret Resolution:
   - Resolves the HMAC signature verification key, falling back to the API secret
     if a dedicated webhook secret is not explicitly configured.
"""

import os

# Razorpay Merchant Credentials
# In production, injected securely via environment or AWS Secrets Manager / Vault
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()

# Internal microservice routing targets
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8002")
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def razorpay_enabled() -> bool:
    """
    Evaluates whether genuine Razorpay gateway credentials have been supplied.

    Detects dummy placeholder strings commonly used during local staging or testing
    (e.g., 'rzp_test_placeholder', 'dummy_secret').

    Returns:
        bool: True if valid Razorpay API keys are configured, enabling live gateway calls;
              False if running in mock/demo mode.
    """
    # Reject empty or unpopulated environment variables
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        return False
        
    # Detect known test placeholder strings
    if RAZORPAY_KEY_ID.startswith("rzp_test_placeholder") or RAZORPAY_KEY_ID.startswith("rzp_test_dummy"):
        return False
    if RAZORPAY_KEY_SECRET in ("placeholder_secret", "dummy_secret"):
        return False
        
    # Validate standard Razorpay key prefix ('rzp_test_' or 'rzp_live_')
    return RAZORPAY_KEY_ID.startswith("rzp_")


def webhook_secret() -> str:
    """
    Resolves the HMAC SHA256 secret required to authenticate webhook payloads from Razorpay.

    Returns:
        str: Dedicated webhook secret if defined, otherwise falls back to the API Key Secret.
    """
    return RAZORPAY_WEBHOOK_SECRET or RAZORPAY_KEY_SECRET
