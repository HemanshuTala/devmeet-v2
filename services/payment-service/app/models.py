from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class Plan(str, Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class CheckoutSessionRequest(BaseModel):
    user_id: Optional[str] = None
    plan: Plan
    success_url: str = "http://localhost:3000/dashboard?payment=success"
    cancel_url: str = "http://localhost:3000/dashboard?payment=cancelled"


class CheckoutSessionResponse(BaseModel):
    session_id: str
    checkout_url: str
    plan: Plan
    mode: str  # "razorpay" | "mock"
    # Razorpay-specific fields (present in razorpay mode)
    razorpay_order_id: Optional[str] = None
    razorpay_key_id: Optional[str] = None
    amount: Optional[int] = None       # amount in paise
    currency: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    prefill_email: Optional[str] = None


class WebhookPayload(BaseModel):
    event_type: str
    user_id: str
    plan: Optional[Plan] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_signature: Optional[str] = None


class MockWebhookRequest(BaseModel):
    user_id: str
    plan: Plan
    event_type: str = "payment.captured"


class SubscriptionRecord(BaseModel):
    id: str
    user_id: str
    plan: Plan
    razorpay_customer_id: Optional[str] = None
    razorpay_subscription_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    status: str  # "active", "cancelled", "past_due"
    created_at: datetime
    updated_at: datetime


class BillingEventRecord(BaseModel):
    id: str
    user_id: str
    event_type: str
    plan: Optional[str] = None
    amount: Optional[int] = None  # in paise (INR) or cents (USD)
    currency: str = "INR"
    razorpay_event_id: Optional[str] = None
    created_at: datetime


class BillingHistoryResponse(BaseModel):
    events: List[BillingEventRecord]
    total: int


class SubscriptionResponse(BaseModel):
    user_id: str
    plan: Plan
    status: str
    razorpay_customer_id: Optional[str] = None
    razorpay_subscription_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# Pricing table — amounts in paise (INR, 1 INR = 100 paise)
PLAN_PRICES = {
    Plan.PRO: {
        "amount_paise": 159900,   # ₹1,599/month
        "amount_display": "₹1,599/month",
        "currency": "INR",
        "name": "DevMeet Pro",
        "features": [
            "Unlimited interviews",
            "All interview modes (DSA, Behavioral, System Design)",
            "Full AI feedback reports",
            "PDF export",
            "90-day analytics history",
            "Video interview room",
            "3 AI hints per session",
        ]
    },
    Plan.ENTERPRISE: {
        "amount_paise": 0,  # Contact sales
        "amount_display": "Contact sales",
        "currency": "INR",
        "name": "DevMeet Enterprise",
        "features": [
            "Everything in Pro",
            "Custom question bank",
            "Team management (up to 50 seats)",
            "Unlimited analytics history",
            "Dedicated Slack support (4h SLA)",
            "API access (v1 read-only)",
            "Custom rubrics",
        ]
    }
}
