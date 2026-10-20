"""
DevMeet Payment & Billing Service - REST API Endpoints
======================================================
This module coordinates candidate subscription plans, order creation, payment signature
verification via HMAC-SHA256, and webhook event processing.

Key Architectural Responsibilities:
1. Multi-Tier Subscription Entitlement:
   - Free (default tier: 3 interviews/mo, basic scoring).
   - Pro (paid recurring tier: ₹1,599/mo, unlimited sessions, multi-modal interviews, full reports).
   - Enterprise (contact-sales contracted plan).
2. Dual Gateway Execution Engine (Razorpay + Mock Sandbox):
   - When valid Razorpay credentials are configured, interacts with the live Razorpay SDK
     to create orders (`client.order.create`) and verify cryptographically signed checkout tokens.
   - Gracefully degrades to a sandbox mock checkout for local testing, demo days, and CI/CD runs.
3. Cryptographic Signature Verification:
   - Verifies Razorpay client-side signatures (`hmac.new(..., order_id|payment_id, sha256)`).
   - Authenticates server-to-server webhook payloads using the configured `webhook_secret()`.
4. Inter-Service Synchronization:
   - Upon plan upgrades or downgrades, asynchronously notifies the User Service
     (`PUT {USER_SERVICE_URL}/api/v1/users/{user_id}/plan`) to adjust quota limits immediately.
5. Financial Audit & Ledger Logging:
   - Every order, authorization, capture, and cancellation appends an immutable billing event record.
"""

import os
import uuid
import hashlib
import hmac
import json
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .database import db
from .config import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    USER_SERVICE_URL,
    AUTH_SERVICE_URL,
    FRONTEND_URL,
    razorpay_enabled,
    webhook_secret,
)
from .models import (
    CheckoutSessionRequest, CheckoutSessionResponse,
    MockWebhookRequest, SubscriptionResponse,
    BillingHistoryResponse, BillingEventRecord,
    Plan, PLAN_PRICES
)

# FastAPI router configuration with standard prefix
router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

# HTTP Bearer authentication token scheme
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

# Dynamic evaluation of gateway readiness based on environment variables
USE_RAZORPAY = razorpay_enabled()


# ─── Auth helpers ────────────────────────────────────────────────────────────

async def verify_token(token: str) -> Optional[dict]:
    """
    Validates a JWT access token by querying the Auth Service `/me` endpoint using a pooled client.

    Args:
        token (str): Raw bearer access token extracted from request header.

    Returns:
        Optional[dict]: Decoded user profile claims if valid; None on failure.
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
    FastAPI authentication dependency that extracts and validates the candidate's bearer token.

    Args:
        credentials (HTTPAuthorizationCredentials): Injected Bearer token header.

    Returns:
        dict: Authenticated user dictionary containing user ID, email, and role.

    Raises:
        HTTPException(401): If token is missing, expired, or invalid.
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
    Enables immediate quota adjustments without requiring candidate re-authentication.

    Args:
        user_id (str): Target user UUID.
        plan (str): Target plan tier ('free', 'pro', 'enterprise').
    """
    try:
        client = get_payment_http_client()
        await client.put(
            f"{USER_SERVICE_URL}/api/v1/users/{user_id}/plan",
            json={"plan": plan}
        )
    except Exception as e:
        print(f"[payment] Warning: could not update user plan on user-service: {e}")


# ─── GET /config ──────────────────────────────────────────────────────────────

@router.get("/config")
async def payment_config():
    """
    Returns public payment provider configuration and client integration metadata.
    
    Why this exists:
    Allows the frontend checkout modal to dynamically detect whether live Razorpay is active
    or whether development mock checkout is enabled, along with the active currency (INR).

    Returns:
        dict: Provider identity ('razorpay' or 'mock'), key prefix, and ISO currency.
    """
    return {
        "provider": "razorpay" if USE_RAZORPAY else "mock",
        "razorpay_enabled": USE_RAZORPAY,
        "razorpay_key_id": RAZORPAY_KEY_ID if USE_RAZORPAY else None,
        "currency": "INR",
    }


# ─── GET /subscription ───────────────────────────────────────────────────────

@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(current_user: dict = Depends(get_current_user)):
    """
    Retrieves the authenticated candidate's active subscription tier and gateway identifiers.
    
    Why this exists:
    Populates user profile badges, quota counters, and billing settings on the client.
    If no active record is found in PostgreSQL, defaults gracefully to the 'free' tier.

    Args:
        current_user (dict): Authenticated candidate payload from JWT.

    Returns:
        SubscriptionResponse: Active plan, gateway customer IDs, and status.
    """
    user_id = current_user["id"]
    sub = await db.get_subscription(user_id)
    if not sub:
        # Candidate has never purchased a paid plan; default to free tier
        return SubscriptionResponse(
            user_id=user_id,
            plan=Plan.FREE,
            status="active",
        )
    return SubscriptionResponse(
        user_id=str(sub["user_id"]),
        plan=Plan(sub["plan"]),
        status=sub["status"],
        razorpay_customer_id=sub.get("provider_customer_id"),
        razorpay_subscription_id=sub.get("provider_subscription_id"),
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
    Initializes a new checkout order for purchasing or upgrading subscription plans.
    
    Execution Workflow:
    1. Validates requested plan (rejects direct checkout for Free or Enterprise).
    2. In live Razorpay mode: Mints an official order via Razorpay Client SDK.
    3. In offline/mock mode: Automatically generates a sandbox mock order and redirect URL.
    4. Logs the billing event in PostgreSQL for financial audit tracking.

    Args:
        payload (CheckoutSessionRequest): Target plan and redirect return URLs.
        current_user (dict): Injected candidate claims.

    Returns:
        CheckoutSessionResponse: Order details and client modal initialization parameters.

    Raises:
        HTTPException(400): If attempting checkout for Free (use /cancel) or Enterprise (contact sales).
    """
    user_id = current_user["id"]

    # Reject invalid checkout requests
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

    # Live Razorpay payment order initiation
    if USE_RAZORPAY:
        try:
            import razorpay
            client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

            order_data = {
                "amount": price_info["amount_paise"],
                "currency": price_info["currency"],
                "notes": {
                    "user_id": user_id,
                    "plan": payload.plan.value,
                }
            }
            # Issue order creation request to Razorpay servers
            order = client.order.create(data=order_data)

            # Record order event in database ledger
            await db.log_billing_event(
                user_id=user_id,
                event_type="razorpay.order.created",
                plan=payload.plan.value,
                amount=price_info["amount_paise"],
            )

            return CheckoutSessionResponse(
                session_id=order["id"],
                checkout_url=payload.success_url,
                plan=payload.plan,
                mode="razorpay",
                razorpay_order_id=order["id"],
                razorpay_key_id=RAZORPAY_KEY_ID,
                amount=price_info["amount_paise"],
                currency=price_info["currency"],
                name="DevMeet",
                description=f"DevMeet {payload.plan.value.capitalize()} Plan",
                prefill_email=current_user.get("email"),
            )
        except Exception as e:
            # Fall back to sandbox simulation if Razorpay API fails or times out
            print(f"[payment] Razorpay order creation failed ({e}). Falling back to mock checkout mode.")

    # ── Mock / Sandbox checkout fallback ─────────────────────────────────────
    mock_order_id = f"order_mock_{uuid.uuid4().hex[:16]}"
    mock_url = (
        f"{FRONTEND_URL}/dashboard?payment=mock_success"
        f"&plan={payload.plan.value}&session_id={mock_order_id}"
    )

    await db.log_billing_event(
        user_id=user_id,
        event_type="razorpay.order.created.mock",
        plan=payload.plan.value,
        amount=price_info["amount_paise"],
    )

    return CheckoutSessionResponse(
        session_id=mock_order_id,
        checkout_url=mock_url,
        plan=payload.plan,
        mode="mock",
        razorpay_order_id=mock_order_id,
        razorpay_key_id="rzp_test_mock",
        amount=price_info["amount_paise"],
        currency=price_info["currency"],
        name="DevMeet",
        description=f"DevMeet {payload.plan.value.capitalize()} Plan (Mock)",
        prefill_email=current_user.get("email"),
    )


# ─── POST /webhook (Razorpay real webhook) ───────────────────────────────────

@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """
    Handles asynchronous server-to-server webhook notifications from Razorpay.
    
    Why this exists:
    Provides resilient payment fulfillment even if the candidate closes their browser
    during checkout or when recurring auto-debit renewals process offline.
    
    Security:
    Verifies the HMAC-SHA256 signature in the 'x-razorpay-signature' header against
    the raw body to prevent unauthorized spoofing of payment capture events.

    Args:
        request (Request): Raw incoming HTTP request for raw body signature inspection.

    Returns:
        dict: Acknowledgment payload with event type.

    Raises:
        HTTPException(400): If signature is invalid or JSON malformed.
        HTTPException(500): If webhook secret is missing in live mode.
    """
    body = await request.body()
    sig_header = request.headers.get("x-razorpay-signature", "")

    if USE_RAZORPAY:
        # In production mode, reject any request without a valid cryptographic signature
        if not sig_header:
            raise HTTPException(status_code=400, detail="Missing webhook signature header")
        if not webhook_secret():
            raise HTTPException(status_code=500, detail="Webhook secret not configured")

        # Razorpay HMAC-SHA256 verification against raw body bytes
        mac = hmac.new(
            webhook_secret().encode("utf-8"),
            body,
            hashlib.sha256,
        )
        if not hmac.compare_digest(mac.hexdigest(), sig_header):
            raise HTTPException(status_code=400, detail="Webhook signature invalid")

    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("event", "")
    payload_obj = event.get("payload", {})

    # Extract payment or subscription entity
    payment_entity = (
        payload_obj.get("payment", {}).get("entity", {})
        or payload_obj.get("subscription", {}).get("entity", {})
        or {}
    )

    notes = payment_entity.get("notes", {})
    user_id  = notes.get("user_id") or payment_entity.get("user_id")
    plan     = notes.get("plan") or payment_entity.get("plan")
    event_id = event.get("id", str(uuid.uuid4()))
    razorpay_payment_id = payment_entity.get("id")

    if not user_id:
        # If webhook payload lacks an associated candidate ID, acknowledge receipt but skip
        return {"received": True, "status": "skipped_no_user_id"}

    # Handle payment success and recurring charge activations
    if event_type in ("payment.captured", "subscription.activated", "subscription.charged"):
        if not plan:
            plan = Plan.PRO.value
        await db.upsert_subscription(
            user_id=user_id,
            plan=plan,
            status="active",
            provider_customer_id=payment_entity.get("customer_id"),
            provider_subscription_id=payment_entity.get("subscription_id"),
        )
        await db.log_billing_event(
            user_id=user_id,
            event_type=event_type,
            plan=plan,
            amount=payment_entity.get("amount"),
            provider_event_id=event_id,
        )
        # Notify user-service to refresh quotas
        await _notify_user_service_plan_change(user_id, plan)

    # Handle cancellations and failed auto-renewals
    elif event_type in ("subscription.cancelled", "subscription.halted", "payment.failed"):
        await db.cancel_subscription(user_id)
        await db.log_billing_event(
            user_id=user_id,
            event_type=event_type,
            plan="free",
            provider_event_id=event_id,
        )
        # Revert candidate to free tier limits
        await _notify_user_service_plan_change(user_id, "free")

    return {"received": True, "event_type": event_type}


# ─── POST /verify-payment ────────────────────────────────────────────────────

@router.post("/verify-payment")
async def verify_payment(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Verifies the client-side Razorpay modal completion signature.
    
    Why this exists:
    When a candidate successfully completes payment in the frontend Razorpay checkout modal,
    Razorpay provides `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.
    This endpoint recomputes the HMAC-SHA256 signature using the server-side secret
    to ensure the payment was authentic, then immediately activates the Pro plan.

    Args:
        request (Request): JSON body containing order_id, payment_id, and signature.
        current_user (dict): Authenticated candidate session.

    Returns:
        dict: Success confirmation with plan name and payment ID.

    Raises:
        HTTPException(400): If cryptographic signature mismatch occurs.
    """
    body = await request.json()
    payment_id = body.get("razorpay_payment_id", "")
    order_id   = body.get("razorpay_order_id", "")
    signature  = body.get("razorpay_signature", "")
    plan       = body.get("plan", "pro")
    user_id    = current_user["id"]

    if USE_RAZORPAY:
        # Verify signature: HMAC-SHA256 of "order_id|payment_id"
        message  = f"{order_id}|{payment_id}".encode("utf-8")
        expected = hmac.new(
            RAZORPAY_KEY_SECRET.encode("utf-8"),
            message,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(
                status_code=400,
                detail="Payment signature verification failed"
            )

    # Activate subscription entitlements in database
    await db.upsert_subscription(
        user_id=user_id,
        plan=plan,
        status="active",
        provider_customer_id=None,
        provider_subscription_id=order_id,
    )
    price_info = PLAN_PRICES.get(Plan(plan), {})
    await db.log_billing_event(
        user_id=user_id,
        event_type="payment.captured",
        plan=plan,
        amount=price_info.get("amount_paise", 0),
        provider_event_id=payment_id,
    )
    # Inform user-service of immediate plan upgrade
    await _notify_user_service_plan_change(user_id, plan)

    return {"success": True, "plan": plan, "payment_id": payment_id}


# ─── POST /mock-webhook ──────────────────────────────────────────────────────

@router.post("/mock-webhook")
async def mock_webhook(payload: MockWebhookRequest):
    """
    Simulates a Razorpay webhook event for local testing and developer demos.
    
    Why this exists:
    Allows developers and QA engineers to trigger subscription upgrades or cancellations
    instantly in local development without needing live financial transactions.

    Args:
        payload (MockWebhookRequest): Simulated event type and target plan.

    Returns:
        dict: Simulation result indicating whether plan was upgraded or cancelled.
    """
    user_id    = payload.user_id
    plan       = payload.plan.value
    event_type = payload.event_type

    if event_type in ("payment.captured", "subscription.activated"):
        await db.upsert_subscription(user_id=user_id, plan=plan, status="active")
        await db.log_billing_event(
            user_id=user_id,
            event_type=f"{event_type}.mock",
            plan=plan,
            amount=PLAN_PRICES.get(payload.plan, {}).get("amount_paise", 0),
        )
        await _notify_user_service_plan_change(user_id, plan)
        return {"success": True, "user_id": user_id, "plan": plan, "action": "upgraded"}

    elif event_type == "subscription.cancelled":
        await db.cancel_subscription(user_id)
        await db.log_billing_event(user_id=user_id, event_type=f"{event_type}.mock", plan="free")
        await _notify_user_service_plan_change(user_id, "free")
        return {"success": True, "user_id": user_id, "plan": "free", "action": "cancelled"}

    return {"success": False, "reason": f"Unhandled event_type: {event_type}"}


# ─── POST /cancel ─────────────────────────────────────────────────────────────

@router.post("/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    """
    Cancels an active subscription and downgrades the candidate to the Free tier.
    
    Why this exists:
    Provides a self-service cancellation flow. Notifies Razorpay to halt recurring billing
    if an active gateway subscription exists, logs the cancellation in billing events,
    and updates user-service quotas.

    Args:
        current_user (dict): Authenticated candidate session.

    Returns:
        dict: Downgrade confirmation payload.
    """
    user_id = current_user["id"]
    sub = await db.get_subscription(user_id)

    # Cancel recurring subscription at the gateway level
    if USE_RAZORPAY and sub and sub.get("provider_subscription_id"):
        try:
            import razorpay
            client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
            client.subscription.cancel(sub["provider_subscription_id"])
        except Exception as e:
            print(f"[payment] Warning: Razorpay cancel failed: {e}")

    # Update database record to 'free' and 'cancelled'
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
    Retrieves the authenticated candidate's past invoices, charges, and lifecycle events.
    
    Why this exists:
    Powers the Billing History table in candidate settings and account dashboards.

    Args:
        current_user (dict): Authenticated candidate identity claims.

    Returns:
        BillingHistoryResponse: List of historical transaction records.
    """
    user_id = current_user["id"]
    events  = await db.get_billing_history(user_id, limit=100)
    return BillingHistoryResponse(
        events=[
            BillingEventRecord(
                id=str(e["id"]),
                user_id=str(e["user_id"]),
                event_type=e["event_type"],
                plan=e.get("plan"),
                amount=e.get("amount"),
                currency=e.get("currency", "INR"),
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
    
    Why this exists:
    Provides pricing metadata, feature matrices, and monthly quotas to the frontend
    landing page and upgrade dialogs without requiring user authentication.

    Returns:
        dict: Catalog of plans with price amounts and feature lists.
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
