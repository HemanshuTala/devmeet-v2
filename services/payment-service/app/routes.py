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
    razorpay_enabled,
    webhook_secret,
)
from .models import (
    CheckoutSessionRequest, CheckoutSessionResponse,
    MockWebhookRequest, SubscriptionResponse,
    BillingHistoryResponse, BillingEventRecord,
    Plan, PLAN_PRICES
)

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])
security = HTTPBearer()

USE_RAZORPAY = razorpay_enabled()


# ─── Auth helpers ────────────────────────────────────────────────────────────

async def verify_token(token: str) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"{AUTH_SERVICE_URL}/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            return r.json() if r.status_code == 200 else None
    except Exception:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await verify_token(credentials.credentials)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user


async def _notify_user_service_plan_change(user_id: str, plan: str):
    """Tell user-service to update the user's plan tier."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.put(
                f"{USER_SERVICE_URL}/api/v1/users/{user_id}/plan",
                json={"plan": plan}
            )
    except Exception as e:
        print(f"[payment] Warning: could not update user plan on user-service: {e}")


# ─── GET /config ──────────────────────────────────────────────────────────────

@router.get("/config")
async def payment_config():
    """Public payment configuration for the frontend checkout UI."""
    return {
        "provider": "razorpay" if USE_RAZORPAY else "mock",
        "razorpay_enabled": USE_RAZORPAY,
        "razorpay_key_id": RAZORPAY_KEY_ID if USE_RAZORPAY else None,
        "currency": "INR",
    }


# ─── GET /subscription ───────────────────────────────────────────────────────

@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(current_user: dict = Depends(get_current_user)):
    """Get the current user's subscription status."""
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
    """Create a Razorpay order for checkout (or mock one if keys not configured)."""
    user_id = current_user["id"]

    if payload.plan == Plan.FREE:
        raise HTTPException(status_code=400, detail="Cannot checkout to Free plan. Use cancel to downgrade.")

    if payload.plan == Plan.ENTERPRISE:
        raise HTTPException(status_code=400, detail="Enterprise plan requires contacting sales. Email sales@devmeet.com")

    price_info = PLAN_PRICES[payload.plan]

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
            order = client.order.create(data=order_data)

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
            print(f"[payment] Razorpay order creation failed: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"Razorpay checkout failed: {e}. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.",
            )

    # ── Mock / sandbox checkout ───────────────────────────────────────────────
    mock_order_id = f"order_mock_{uuid.uuid4().hex[:16]}"
    mock_url = (
        f"http://localhost:3000/dashboard?payment=mock_success"
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
    """Handle Razorpay webhook events with signature verification."""
    body = await request.body()
    sig_header = request.headers.get("x-razorpay-signature", "")

    if USE_RAZORPAY and webhook_secret() and sig_header:
        # Razorpay HMAC-SHA256 verification (webhook secret from dashboard)
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
        return {"received": True, "status": "skipped_no_user_id"}

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
        await _notify_user_service_plan_change(user_id, plan)

    elif event_type in ("subscription.cancelled", "subscription.halted", "payment.failed"):
        await db.cancel_subscription(user_id)
        await db.log_billing_event(
            user_id=user_id,
            event_type=event_type,
            plan="free",
            provider_event_id=event_id,
        )
        await _notify_user_service_plan_change(user_id, "free")

    return {"received": True, "event_type": event_type}


# ─── POST /verify-payment ────────────────────────────────────────────────────

@router.post("/verify-payment")
async def verify_payment(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Verify a Razorpay payment after checkout popup success.
    Frontend sends razorpay_payment_id, razorpay_order_id, razorpay_signature.
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
            raise HTTPException(status_code=400, detail="Payment signature verification failed")

    # Activate subscription
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
    await _notify_user_service_plan_change(user_id, plan)

    return {"success": True, "plan": plan, "payment_id": payment_id}


# ─── POST /mock-webhook ──────────────────────────────────────────────────────

@router.post("/mock-webhook")
async def mock_webhook(payload: MockWebhookRequest):
    """
    Simulate a Razorpay webhook for local development.
    Instantly upgrades or cancels a user's plan without real Razorpay keys.
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
    """Cancel the current user's subscription, downgrading to Free plan."""
    user_id = current_user["id"]
    sub = await db.get_subscription(user_id)

    if USE_RAZORPAY and sub and sub.get("provider_subscription_id"):
        try:
            import razorpay
            client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
            client.subscription.cancel(sub["provider_subscription_id"])
        except Exception as e:
            print(f"[payment] Warning: Razorpay cancel failed: {e}")

    await db.cancel_subscription(user_id)
    await db.log_billing_event(user_id=user_id, event_type="subscription.cancelled", plan="free")
    await _notify_user_service_plan_change(user_id, "free")

    return {"success": True, "plan": "free", "message": "Subscription cancelled. Downgraded to Free plan."}


# ─── GET /billing-history ─────────────────────────────────────────────────────

@router.get("/billing-history", response_model=BillingHistoryResponse)
async def get_billing_history(current_user: dict = Depends(get_current_user)):
    """Fetch this user's full billing event history."""
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
    """Return all available subscription plans and pricing."""
    return {
        "plans": [
            {
                "plan": "free",
                "name": "DevMeet Free",
                "amount_paise": 0,
                "price_display": "Free",
                "currency": "INR",
                "features": [
                    "3 interviews per month",
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
