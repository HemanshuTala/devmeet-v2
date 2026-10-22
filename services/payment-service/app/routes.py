"""
DevMeet Payment Service - REST API Endpoints (Mock Payment Engine)
=================================================================
Coordinates candidate subscription plans, instant mock payment fulfillment,
quota synchronization with user-service, and financial audit ledger logging.

Interview & Demo Ready:
- Deterministic, zero external network dependency.
- Instant plan upgrades directly updating PostgreSQL/in-memory database and User Service.
"""

import uuid
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .database import db
from .config import (
    USER_SERVICE_URL,
    AUTH_SERVICE_URL,
    FRONTEND_URL,
    PAYMENT_MODE,
)
from .models import (
    CheckoutSessionRequest, CheckoutSessionResponse,
    MockWebhookRequest, SubscriptionResponse,
    BillingHistoryResponse, BillingEventRecord,
    Plan, PLAN_PRICES
)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])
security = HTTPBearer()

_payment_http_client: Optional[httpx.AsyncClient] = None


def get_payment_http_client() -> httpx.AsyncClient:
    """Returns or initializes a pooled HTTP client for payment inter-service calls."""
    global _payment_http_client
    if _payment_http_client is None or _payment_http_client.is_closed:
        _payment_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=3.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=50)
        )
    return _payment_http_client


async def close_payment_http_client():
    """Gracefully closes the pooled payment HTTP client on service shutdown."""
    global _payment_http_client
    if _payment_http_client and not _payment_http_client.is_closed:
        await _payment_http_client.aclose()
        _payment_http_client = None


# ─── Auth helpers ────────────────────────────────────────────────────────────

async def verify_token(token: str) -> Optional[dict]:
    """
    Validates a JWT access token by querying the Auth Service `/me` endpoint.
    """
    try:
        client = get_payment_http_client()
        r = await client.get(
            f"{AUTH_SERVICE_URL}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    FastAPI dependency extracting candidate claims from Bearer token.
    """
    user = await verify_token(credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    return user


async def _notify_user_service_plan_change(user_id: str, plan: str):
    """
    Asynchronously notifies the User Service of a candidate plan upgrade or downgrade.
    Enables immediate quota adjustments and interview limits refresh.
    """
    try:
        client = get_payment_http_client()
        await client.put(
            f"{USER_SERVICE_URL}/api/v1/users/{user_id}/plan",
            json={"plan": plan}
        )
    except Exception as e:
        print(f"[payment] Notice: user-service plan update attempt for user {user_id}: {e}")


# ─── GET /config ──────────────────────────────────────────────────────────────

@router.get("/config")
async def payment_config():
    """
    Returns payment provider configuration.
    """
    return {
        "provider": "mock",
        "mode": PAYMENT_MODE,
        "razorpay_enabled": False,
        "razorpay_key_id": None,
        "currency": "INR",
    }


# ─── GET /subscription ───────────────────────────────────────────────────────

@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(current_user: dict = Depends(get_current_user)):
    """
    Retrieves the authenticated candidate's active subscription tier.
    Defaults to 'free' if no active record is found.
    """
    user_id = current_user["id"]
    sub = await db.get_subscription(user_id)
    if not sub:
        return SubscriptionResponse(
            user_id=user_id,
            plan=Plan.FREE,
            status="active",
        )
    return SubscriptionResponse(
        user_id=str(sub["user_id"]),
        plan=Plan(sub["plan"]),
        status=sub["status"],
        created_at=sub.get("created_at"),
        updated_at=sub.get("updated_at"),
    )


# ─── POST /checkout-session ──────────────────────────────────────────────────

@router.post("/checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    payload: CheckoutSessionRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Initializes and executes an instant mock payment checkout order.
    Directly activates the subscription plan in the database and updates user-service quota.
    """
    user_id = current_user["id"]

    if payload.plan == Plan.FREE:
        raise HTTPException(
            status_code=400,
            detail="Cannot checkout to Free plan. Use cancel to downgrade."
        )

    if payload.plan == Plan.ENTERPRISE:
        raise HTTPException(
            status_code=400,
            detail="Enterprise plan requires contacting sales. Email sales@devmeet.com"
        )

    price_info = PLAN_PRICES[payload.plan]
    mock_order_id = f"order_mock_{uuid.uuid4().hex[:12]}"
    plan_value = payload.plan.value

    # 1. Update subscription in database immediately
    await db.upsert_subscription(
        user_id=user_id,
        plan=plan_value,
        status="active",
        provider_customer_id=f"cust_mock_{user_id[:8]}",
        provider_subscription_id=mock_order_id,
    )

    # 2. Append immutable record to billing event ledger
    await db.log_billing_event(
        user_id=user_id,
        event_type="payment.captured",
        plan=plan_value,
        amount=price_info["amount_paise"],
        currency="INR",
        provider_event_id=mock_order_id,
    )

    # 3. Synchronize quota with user-service
    await _notify_user_service_plan_change(user_id, plan_value)

    return CheckoutSessionResponse(
        session_id=mock_order_id,
        checkout_url=payload.success_url,
        plan=payload.plan,
        mode="mock",
        success=True,
        message=f"Successfully upgraded to DevMeet {plan_value.capitalize()} Plan!",
        razorpay_order_id=mock_order_id,
        razorpay_key_id="rzp_test_mock",
        amount=price_info["amount_paise"],
        currency=price_info["currency"],
        name="DevMeet",
        description=f"DevMeet {plan_value.capitalize()} Plan",
        prefill_email=current_user.get("email"),
    )


# ─── POST /upgrade (Direct Plan Upgrade Endpoint) ─────────────────────────────

@router.post("/upgrade")
async def upgrade_plan_direct(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Direct endpoint to upgrade user subscription plan without redirection.
    """
    body = await request.json()
    plan_str = body.get("plan", "pro").lower()
    user_id = current_user["id"]

    try:
        plan_enum = Plan(plan_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid plan '{plan_str}'")

    if plan_enum == Plan.FREE:
        raise HTTPException(status_code=400, detail="Cannot upgrade to free plan. Use /cancel.")

    price_info = PLAN_PRICES.get(plan_enum, {})
    order_id = f"mock_{uuid.uuid4().hex[:12]}"

    await db.upsert_subscription(
        user_id=user_id,
        plan=plan_enum.value,
        status="active",
        provider_subscription_id=order_id,
    )
    await db.log_billing_event(
        user_id=user_id,
        event_type="payment.captured",
        plan=plan_enum.value,
        amount=price_info.get("amount_paise", 0),
        currency="INR",
        provider_event_id=order_id,
    )
    await _notify_user_service_plan_change(user_id, plan_enum.value)

    return {
        "success": True,
        "plan": plan_enum.value,
        "message": f"Upgraded to {plan_enum.value.upper()} successfully."
    }


# ─── POST /verify-payment ────────────────────────────────────────────────────

@router.post("/verify-payment")
async def verify_payment(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Verifies payment completion and ensures subscription plan is activated.
    Runs seamlessly in mock mode without requiring third-party cryptography signatures.
    """
    body = await request.json()
    payment_id = body.get("razorpay_payment_id") or body.get("payment_id") or f"pay_{uuid.uuid4().hex[:8]}"
    order_id = body.get("razorpay_order_id") or body.get("order_id") or f"order_{uuid.uuid4().hex[:8]}"
    plan = body.get("plan", "pro")
    user_id = current_user["id"]

    await db.upsert_subscription(
        user_id=user_id,
        plan=plan,
        status="active",
        provider_subscription_id=order_id,
    )
    price_info = PLAN_PRICES.get(Plan(plan) if plan in Plan._value2member_map_ else Plan.PRO, {})
    await db.log_billing_event(
        user_id=user_id,
        event_type="payment.captured",
        plan=plan,
        amount=price_info.get("amount_paise", 0),
        currency="INR",
        provider_event_id=payment_id,
    )
    await _notify_user_service_plan_change(user_id, plan)

    return {"success": True, "plan": plan, "payment_id": payment_id}


# ─── POST /webhook & /mock-webhook ───────────────────────────────────────────

@router.post("/webhook")
async def webhook(request: Request):
    """
    Receives webhook events. In mock mode, extracts user_id & event and applies subscription update.
    """
    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("event", "payment.captured")
    payload_obj = event.get("payload", {})
    entity = payload_obj.get("payment", {}).get("entity", {}) or event
    notes = entity.get("notes", {})
    user_id = notes.get("user_id") or entity.get("user_id")
    plan = notes.get("plan") or entity.get("plan", "pro")

    if not user_id:
        return {"received": True, "status": "skipped_no_user_id"}

    if event_type in ("payment.captured", "subscription.activated"):
        await db.upsert_subscription(user_id=user_id, plan=plan, status="active")
        await db.log_billing_event(user_id=user_id, event_type=event_type, plan=plan)
        await _notify_user_service_plan_change(user_id, plan)
    elif event_type in ("subscription.cancelled", "payment.failed"):
        await db.cancel_subscription(user_id)
        await db.log_billing_event(user_id=user_id, event_type=event_type, plan="free")
        await _notify_user_service_plan_change(user_id, "free")

    return {"received": True, "event_type": event_type}


@router.post("/mock-webhook")
async def mock_webhook(payload: MockWebhookRequest):
    """
    Simulates a webhook event for testing plan updates and cancellations.
    """
    user_id = payload.user_id
    plan = payload.plan.value
    event_type = payload.event_type

    if event_type in ("payment.captured", "subscription.activated"):
        await db.upsert_subscription(user_id=user_id, plan=plan, status="active")
        await db.log_billing_event(
            user_id=user_id,
            event_type=event_type,
            plan=plan,
            amount=PLAN_PRICES.get(payload.plan, {}).get("amount_paise", 0),
        )
        await _notify_user_service_plan_change(user_id, plan)
        return {"success": True, "user_id": user_id, "plan": plan, "action": "upgraded"}

    elif event_type in ("subscription.cancelled", "subscription.halted"):
        await db.cancel_subscription(user_id)
        await db.log_billing_event(user_id=user_id, event_type=event_type, plan="free")
        await _notify_user_service_plan_change(user_id, "free")
        return {"success": True, "user_id": user_id, "plan": "free", "action": "cancelled"}

    return {"success": False, "reason": f"Unhandled event_type: {event_type}"}


# ─── POST /cancel ─────────────────────────────────────────────────────────────

@router.post("/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    """
    Cancels an active subscription and downgrades the candidate to the Free tier.
    """
    user_id = current_user["id"]
    await db.cancel_subscription(user_id)
    await db.log_billing_event(user_id=user_id, event_type="subscription.cancelled", plan="free")
    await _notify_user_service_plan_change(user_id, "free")

    return {
        "success": True,
        "plan": "free",
        "message": "Subscription cancelled. Downgraded to Free plan."
    }


# ─── GET /billing-history ─────────────────────────────────────────────────────

@router.get("/billing-history", response_model=BillingHistoryResponse)
async def get_billing_history(current_user: dict = Depends(get_current_user)):
    """
    Retrieves the authenticated candidate's transaction ledger history.
    """
    user_id = current_user["id"]
    events = await db.get_billing_history(user_id, limit=100)
    return BillingHistoryResponse(
        events=[
            BillingEventRecord(
                id=str(e["id"]),
                user_id=str(e["user_id"]),
                event_type=e["event_type"],
                plan=e.get("plan"),
                amount=e.get("amount"),
                currency=e.get("currency", "INR"),
                provider_event_id=e.get("provider_event_id"),
                razorpay_event_id=e.get("provider_event_id"),
                created_at=e["created_at"],
            )
            for e in events
        ],
        total=len(events),
    )


# ─── GET /plans ───────────────────────────────────────────────────────────────

@router.get("/plans")
async def list_plans():
    """
    Public pricing catalog detailing available tiers (Free, Pro, Enterprise).
    """
    return {
        "plans": [
            {
                "plan": "free",
                "name": "DevMeet Free",
                "amount_paise": 0,
                "price_display": "Free",
                "currency": "INR",
                "features": [
                    "5 free mock interviews",
                    "DSA mode only",
                    "Easy / Medium difficulty",
                    "Code execution",
                    "Basic score feedback",
                    "7-day analytics",
                ]
            },
            {
                "plan": "pro",
                "name": "DevMeet Pro",
                "amount_paise": 159900,
                "price_display": "₹1,599/month",
                "currency": "INR",
                "features": PLAN_PRICES[Plan.PRO]["features"]
            },
            {
                "plan": "enterprise",
                "name": "DevMeet Enterprise",
                "amount_paise": 0,
                "price_display": "Contact sales",
                "currency": "INR",
                "features": PLAN_PRICES[Plan.ENTERPRISE]["features"]
            },
        ]
    }
