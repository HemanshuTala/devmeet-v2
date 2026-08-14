import os

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8002")
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def razorpay_enabled() -> bool:
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        return False
    if RAZORPAY_KEY_ID.startswith("rzp_test_placeholder") or RAZORPAY_KEY_ID.startswith("rzp_test_dummy"):
        return False
    if RAZORPAY_KEY_SECRET in ("placeholder_secret", "dummy_secret"):
        return False
    return RAZORPAY_KEY_ID.startswith("rzp_")


def webhook_secret() -> str:
    return RAZORPAY_WEBHOOK_SECRET or RAZORPAY_KEY_SECRET
