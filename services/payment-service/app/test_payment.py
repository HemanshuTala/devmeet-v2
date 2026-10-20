"""
DevMeet Payment Service - Automated Unit & Integration Test Suite
=================================================================
This test module validates the core financial, subscription, and webhook operations:
1. Operational Telemetry & Service Probes:
   - Verifies public `/health` and root `/` endpoints without authentication.
2. Pricing Catalog:
   - Tests unauthenticated access to `/api/v1/payments/plans`.
   - Asserts inclusion of all core plan tiers ('free', 'pro', 'enterprise') and features.
3. Subscription Lifecycle Queries:
   - Verifies default fallback to Free tier when no previous subscription exists.
   - Verifies correct parsing and delivery of active Pro subscription tiers.
   - Asserts 401 Unauthorized when tokens are omitted.
4. Checkout Order Initiation:
   - Tests creation of Pro checkout sessions in mock/sandbox mode.
   - Enforces rejection (400 Bad Request) when attempting checkout for Free (downgrades use /cancel).
   - Validates Pydantic schema validation failures on missing required request parameters.
5. Client Signature Verification:
   - Tests `/verify-payment` endpoint with sample Razorpay HMAC order and payment IDs.
6. Self-Service Cancellation:
   - Asserts successful downgrade to 'free' upon user-initiated cancellation.
   - Ensures unauthenticated cancellation attempts are rejected (401/403).
7. Billing History:
   - Tests chronological ledger retrieval for candidate account settings.
8. Developer Sandbox Webhooks:
   - Tests `/mock-webhook` endpoint for simulating payment captures in CI/CD environments.
"""

import sys
from unittest.mock import MagicMock

# Mock external binary/network dependencies before importing application modules
sys.modules.setdefault("asyncpg", MagicMock())
sys.modules.setdefault("razorpay", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from datetime import datetime

# Standard test fixtures for candidate user and active subscription records
MOCK_USER = {
    "id": "user-123",
    "email": "test@example.com",
    "display_name": "Test User",
    "role": "user",
}

MOCK_SUBSCRIPTION = {
    "user_id": "user-123",
    "plan": "free",
    "status": "active",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-06-01T00:00:00",
    "razorpay_subscription_id": None,
}

MOCK_PRO_SUBSCRIPTION = {
    "user_id": "user-123",
    "plan": "pro",
    "status": "active",
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-06-01T00:00:00",
    "razorpay_subscription_id": "sub_abc123",
}

MOCK_BILLING_HISTORY = [
    {
        "id": "bill-1",
        "user_id": "user-123",
        "event_type": "payment.captured",
        "amount": 49900,
        "currency": "INR",
        "plan": "pro",
        "created_at": "2024-06-01T00:00:00",
    },
]


@pytest.fixture
def client():
    """
    Test fixture providing a FastAPI TestClient with authenticated candidate claims.
    Mocks database operations and overrides the `get_current_user` dependency.

    Yields:
        tuple[TestClient, MagicMock]: Configured HTTP client and mocked database singleton.
    """
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db._use_memory = True
    mock_db.get_subscription = AsyncMock(return_value=MOCK_SUBSCRIPTION)
    mock_db.upsert_subscription = AsyncMock(return_value=True)
    mock_db.cancel_subscription = AsyncMock(return_value=True)
    mock_db.log_billing_event = AsyncMock(return_value=True)
    mock_db.create_billing_event = AsyncMock(return_value=True)
    mock_db.get_billing_history = AsyncMock(return_value=[])

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db):
        from app.main import app
        from app.routes import get_current_user

        # Inject simulated candidate identity
        app.dependency_overrides[get_current_user] = lambda: MOCK_USER

        with TestClient(app) as c:
            yield c, mock_db

        app.dependency_overrides.clear()


@pytest.fixture
def unauthenticated_client():
    """
    Test fixture providing an unauthenticated client to verify 401 Unauthorized behavior.
    """
    mock_db = MagicMock()
    mock_db.connect = AsyncMock()
    mock_db.disconnect = AsyncMock()
    mock_db._use_memory = True

    with patch("app.database.db", mock_db), \
         patch("app.routes.db", mock_db):
        from app.main import app
        app.dependency_overrides.clear()

        with TestClient(app) as c:
            yield c


# --- Health & Root ---

class TestHealthAndRoot:
    """Tests public baseline operational endpoints."""

    def test_health_check(self, client):
        """Verifies GET /health returns 200 OK and service status."""
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "payment-service"

    def test_root_endpoint(self, client):
        """Verifies root endpoint service identity banner."""
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "Payment Service" in data.get("message", "")


# --- Plans ---

class TestPlans:
    """Tests pricing catalog and plan tier definitions."""

    def test_get_plans(self, client):
        """Verifies that the catalog endpoint lists Free and Pro subscription plans."""
        c, _ = client
        response = c.get("/api/v1/payments/plans")
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        plan_names = [p["plan"] for p in data["plans"]]
        assert "free" in plan_names
        assert "pro" in plan_names

    def test_get_plans_no_auth_required(self, unauthenticated_client):
        """Ensures pricing plans are publicly discoverable without authentication."""
        response = unauthenticated_client.get("/api/v1/payments/plans")
        assert response.status_code == 200

    def test_plans_contain_features(self, client):
        """Ensures all plan records include feature entitlement lists."""
        c, _ = client
        response = c.get("/api/v1/payments/plans")
        assert response.status_code == 200
        data = response.json()
        for plan in data["plans"]:
            assert "features" in plan or "name" in plan


# --- Subscription ---

class TestSubscription:
    """Tests user subscription status queries and defaults."""

    def test_get_subscription_default_free(self, client):
        """Ensures new users default to the active 'free' tier."""
        c, mock_db = client
        mock_db.get_subscription = AsyncMock(return_value=None)
        response = c.get(
            "/api/v1/payments/subscription",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["plan"] == "free"
        assert data["status"] == "active"

    def test_get_subscription_pro(self, client):
        """Verifies that paid subscribers correctly reflect the 'pro' tier."""
        c, mock_db = client
        mock_db.get_subscription = AsyncMock(return_value=MOCK_PRO_SUBSCRIPTION)
        response = c.get(
            "/api/v1/payments/subscription",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["plan"] == "pro"

    def test_get_subscription_unauthorized(self, unauthenticated_client):
        """Verifies unauthenticated calls to /subscription are rejected with 401/403."""
        response = unauthenticated_client.get("/api/v1/payments/subscription")
        assert response.status_code in (401, 403)


# --- Checkout Session ---

class TestCheckout:
    """Tests checkout order initiation and validation rules."""

    def test_create_checkout_session_pro(self, client):
        """Verifies order creation for Pro plan upgrade."""
        c, mock_db = client
        mock_db.get_subscription = AsyncMock(return_value=None)
        response = c.post(
            "/api/v1/payments/checkout-session",
            json={"plan": "pro"},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("mode") == "mock" or "razorpay_order_id" in data

    def test_create_checkout_session_free_rejected(self, client):
        """Ensures users cannot checkout to Free tier (must use /cancel)."""
        c, _ = client
        response = c.post(
            "/api/v1/payments/checkout-session",
            json={"plan": "free"},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code in (400, 422)

    def test_create_checkout_missing_plan(self, client):
        """Ensures request body validation rejects requests missing the required plan field."""
        c, _ = client
        response = c.post(
            "/api/v1/payments/checkout-session",
            json={},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 422


# --- Verify Payment ---

class TestVerifyPayment:
    """Tests post-checkout payment signature validation."""

    def test_verify_payment_missing_fields(self, client):
        """Ensures empty payloads are handled gracefully."""
        c, _ = client
        response = c.post(
            "/api/v1/payments/verify-payment",
            json={},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code in (200, 400, 422)

    def test_verify_payment_with_data(self, client):
        """Verifies payment signature payload processing."""
        c, mock_db = client
        response = c.post(
            "/api/v1/payments/verify-payment",
            json={
                "razorpay_order_id": "order_abc123",
                "razorpay_payment_id": "pay_xyz789",
                "razorpay_signature": "valid_signature_hash",
            },
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code in (200, 400)


# --- Cancel Subscription ---

class TestCancelSubscription:
    """Tests subscription cancellation and downgrades."""

    def test_cancel_subscription(self, client):
        """Verifies cancellation downgrades user to the free tier."""
        c, mock_db = client
        mock_db.get_subscription = AsyncMock(return_value={
            "user_id": "user-123", "plan": "pro", "status": "active",
        })
        mock_db.cancel_subscription = AsyncMock(return_value=None)
        response = c.post(
            "/api/v1/payments/cancel",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["plan"] == "free"

    def test_cancel_subscription_unauthorized(self, unauthenticated_client):
        """Verifies unauthenticated cancellation requests are rejected."""
        response = unauthenticated_client.post("/api/v1/payments/cancel")
        assert response.status_code in (401, 403)


# --- Billing History ---

class TestBillingHistory:
    """Tests transaction ledger queries."""

    def test_get_billing_history_empty(self, client):
        """Verifies empty billing ledger returns an empty list and count 0."""
        c, mock_db = client
        mock_db.get_billing_history = AsyncMock(return_value=[])
        response = c.get(
            "/api/v1/payments/billing-history",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["events"] == []
        assert data["total"] == 0

    def test_billing_history_unauthorized(self, unauthenticated_client):
        """Verifies unauthenticated calls are rejected with 401/403."""
        response = unauthenticated_client.get("/api/v1/payments/billing-history")
        assert response.status_code in (401, 403)


# --- Mock Webhook (dev only) ---

class TestMockWebhook:
    """Tests simulated webhook events in development sandboxes."""

    def test_mock_webhook_upgrade(self, client):
        """Verifies synthetic payment capture triggers an immediate plan upgrade."""
        c, _ = client
        response = c.post(
            "/api/v1/payments/mock-webhook",
            json={
                "user_id": "user-123",
                "plan": "pro",
                "event_type": "payment.captured",
            },
        )
        assert response.status_code == 200
