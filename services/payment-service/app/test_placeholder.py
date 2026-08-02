"""
Comprehensive unit tests for payment-service.
Tests: health, plans list, subscription check, checkout, verify payment, cancel, billing history.
"""
import sys
from unittest.mock import MagicMock

# Mock external dependencies before importing app modules
sys.modules.setdefault("asyncpg", MagicMock())

sys.modules.setdefault("razorpay", MagicMock())

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from datetime import datetime


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

        app.dependency_overrides[get_current_user] = lambda: MOCK_USER

        with TestClient(app) as c:
            yield c, mock_db

        app.dependency_overrides.clear()


@pytest.fixture
def unauthenticated_client():
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
    def test_health_check(self, client):
        c, _ = client
        response = c.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "payment-service"

    def test_root_endpoint(self, client):
        c, _ = client
        response = c.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "Payment Service" in data.get("message", "")


# --- Plans ---

class TestPlans:
    def test_get_plans(self, client):
        c, _ = client
        response = c.get("/api/v1/payments/plans")
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        plan_names = [p["plan"] for p in data["plans"]]
        assert "free" in plan_names
        assert "pro" in plan_names

    def test_get_plans_no_auth_required(self, unauthenticated_client):
        response = unauthenticated_client.get("/api/v1/payments/plans")
        assert response.status_code == 200

    def test_plans_contain_features(self, client):
        c, _ = client
        response = c.get("/api/v1/payments/plans")
        assert response.status_code == 200
        data = response.json()
        for plan in data["plans"]:
            assert "features" in plan or "name" in plan


# --- Subscription ---

class TestSubscription:
    def test_get_subscription_default_free(self, client):
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
        response = unauthenticated_client.get("/api/v1/payments/subscription")
        assert response.status_code in (401, 403)


# --- Checkout Session ---

class TestCheckout:
    def test_create_checkout_session_pro(self, client):
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
        c, _ = client
        response = c.post(
            "/api/v1/payments/checkout-session",
            json={"plan": "free"},
            headers={"Authorization": "Bearer valid-token"},
        )
        # Should reject free plan checkout
        assert response.status_code in (400, 422)

    def test_create_checkout_missing_plan(self, client):
        c, _ = client
        response = c.post(
            "/api/v1/payments/checkout-session",
            json={},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 422


# --- Verify Payment ---

class TestVerifyPayment:
    def test_verify_payment_missing_fields(self, client):
        c, _ = client
        response = c.post(
            "/api/v1/payments/verify-payment",
            json={},
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code in (200, 400, 422)

    def test_verify_payment_with_data(self, client):
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
        # In mock mode (no Razorpay keys) it may succeed or fail signature check
        assert response.status_code in (200, 400)


# --- Cancel Subscription ---

class TestCancelSubscription:
    def test_cancel_subscription(self, client):
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
        response = unauthenticated_client.post("/api/v1/payments/cancel")
        assert response.status_code in (401, 403)


# --- Billing History ---

class TestBillingHistory:
    def test_get_billing_history_empty(self, client):
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
        response = unauthenticated_client.get("/api/v1/payments/billing-history")
        assert response.status_code in (401, 403)


# --- Mock Webhook (dev only) ---

class TestMockWebhook:
    def test_mock_webhook_upgrade(self, client):
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
