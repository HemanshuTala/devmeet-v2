"""
DevMeet Payment Service - Data Models & Schema Definitions
==========================================================
This module defines the Pydantic data schemas, enumerations, and price matrices
used across payment operations, checkout flows, and subscription records.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class Plan(str, Enum):
    """
    Supported platform subscription tiers.
    """
    FREE = "free"              # Default tier: limited daily sessions
    PRO = "pro"                # Standard tier: unlimited interviews & AI reports
    ENTERPRISE = "enterprise"  # Corporate tier: custom question banks & team analytics


class CheckoutSessionRequest(BaseModel):
    """
    Request payload initiated by a candidate client to start a payment checkout flow.
    """
    user_id: Optional[str] = Field(None, description="Candidate user identifier (defaults to JWT claim)")
    plan: Plan = Field(..., description="Target subscription plan ('pro' or 'enterprise')")
    success_url: str = Field(
        "http://localhost:3000/billing?payment=success",
        description="Redirect target URL upon successful payment"
    )
    cancel_url: str = Field(
        "http://localhost:3000/billing?payment=cancelled",
        description="Redirect target URL if candidate aborts payment"
    )


class CheckoutSessionResponse(BaseModel):
    """
    Response returned to client containing mock checkout confirmation parameters.
    """
    session_id: str = Field(..., description="Unique checkout or transaction ID")
    checkout_url: str = Field(..., description="Frontend redirect target or gateway checkout endpoint")
    plan: Plan = Field(..., description="Subscription plan selected")
    mode: str = Field("mock", description="Payment processing mode ('mock')")
    success: bool = Field(True, description="Whether checkout/upgrade succeeded immediately")
    message: Optional[str] = Field("Plan upgraded successfully", description="Status message")
    amount: Optional[int] = Field(None, description="Charge amount in paise (1 INR = 100 paise)")
    currency: Optional[str] = Field("INR", description="ISO currency code, e.g. 'INR'")
    name: Optional[str] = Field("DevMeet", description="Merchant display name")
    description: Optional[str] = Field(None, description="Product description displayed")
    prefill_email: Optional[str] = Field(None, description="Candidate prefilled email address")
    # Kept for backward compatibility
    razorpay_order_id: Optional[str] = Field(None, description="Mock order ID for legacy clients")
    razorpay_key_id: Optional[str] = Field(None, description="Mock key ID for legacy clients")


class WebhookPayload(BaseModel):
    """
    Webhook notification or verification payload.
    """
    event_type: str = Field(..., description="Gateway event name (e.g. 'payment.captured')")
    user_id: str = Field(..., description="Target user identifier")
    plan: Optional[Plan] = Field(None, description="Plan associated with transaction")
    payment_id: Optional[str] = Field(None, description="Transaction payment ID")
    order_id: Optional[str] = Field(None, description="Order ID")


class MockWebhookRequest(BaseModel):
    """
    Simulation payload enabling end-to-end payment workflow testing.
    """
    user_id: str = Field(..., description="User ID to grant plan entitlements to")
    plan: Plan = Field(..., description="Plan tier to upgrade to")
    event_type: str = Field("payment.captured", description="Simulated gateway event")


class SubscriptionRecord(BaseModel):
    """
    Persistent subscription model tracking user entitlement status.
    """
    id: str = Field(..., description="Primary record UUID")
    user_id: str = Field(..., description="Associated candidate user ID")
    plan: Plan = Field(..., description="Current active plan")
    status: str = Field(..., description="Status ('active', 'cancelled', 'past_due')")
    created_at: datetime = Field(..., description="Timestamp of record creation")
    updated_at: datetime = Field(..., description="Timestamp of latest modification")


class BillingEventRecord(BaseModel):
    """
    Financial transaction ledger entry recording payments, renewals, and refunds.
    """
    id: str = Field(..., description="Ledger entry UUID")
    user_id: str = Field(..., description="Associated user ID")
    event_type: str = Field(..., description="Lifecycle event name")
    plan: Optional[str] = Field(None, description="Plan tier associated with charge")
    amount: Optional[int] = Field(None, description="Transaction amount in smallest currency unit (paise/cents)")
    currency: str = Field("INR", description="Currency identifier")
    provider_event_id: Optional[str] = Field(None, description="Transaction or event reference ID")
    razorpay_event_id: Optional[str] = Field(None, description="Legacy transaction reference ID")
    created_at: datetime = Field(..., description="Transaction timestamp")


class BillingHistoryResponse(BaseModel):
    """
    Response container for candidate billing transaction history queries.
    """
    events: List[BillingEventRecord] = Field(..., description="Chronological transaction list")
    total: int = Field(..., description="Total count of recorded transactions")


class SubscriptionResponse(BaseModel):
    """
    User-facing subscription status response.
    """
    user_id: str = Field(..., description="User identifier")
    plan: Plan = Field(..., description="Active entitlement plan")
    status: str = Field(..., description="Subscription state ('active', 'free', etc.)")
    created_at: Optional[datetime] = Field(None, description="Subscription creation date")
    updated_at: Optional[datetime] = Field(None, description="Latest status update date")
    # Kept for backward compatibility
    razorpay_customer_id: Optional[str] = Field(None, description="Provider customer ID")
    razorpay_subscription_id: Optional[str] = Field(None, description="Provider subscription ID")


# ─── Pricing Matrix ──────────────────────────────────────────────────────────
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
        "amount_paise": 0,  # Custom contracted tier
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
