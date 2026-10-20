"""
DevMeet Payment Service - Data Models & Schema Definitions
==========================================================
This module defines the Pydantic data schemas, enumerations, and price matrices
used across payment operations, checkout flows, webhook ingestion, and subscription records.

Key Architectural Responsibilities:
1. Strong Type Validation & Domain Enums:
   - `Plan`: Explicit string enum (`free`, `pro`, `enterprise`) preventing unauthorized tier names.
2. Order & Checkout Session Schemas:
   - `CheckoutSessionRequest`: Validates client checkout initialization and redirection callbacks.
   - `CheckoutSessionResponse`: Delivers gateway order parameters (`razorpay_order_id`, `amount_paise`,
     currency, prefilled email) required by the Razorpay Checkout JS modal.
3. Signature & Webhook Schemas:
   - `WebhookPayload`: Captures server-to-server transaction signatures and payment identifiers.
   - `MockWebhookRequest`: Facilitates deterministic sandbox payment simulations in test environments.
4. Historical Records & Pricing Matrices:
   - `SubscriptionRecord` & `BillingEventRecord`: Financial audit and ledger schemas.
   - `PLAN_PRICES`: Centralized price table defining costs in smallest currency units (paise in INR)
     and feature entitlements.
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
        "http://localhost:3000/dashboard?payment=success",
        description="Redirect target URL upon successful payment"
    )
    cancel_url: str = Field(
        "http://localhost:3000/dashboard?payment=cancelled",
        description="Redirect target URL if candidate aborts payment"
    )


class CheckoutSessionResponse(BaseModel):
    """
    Response returned to client containing Razorpay checkout modal parameters
    or simulated checkout URL in mock mode.
    """
    session_id: str = Field(..., description="Internal tracking or Razorpay order ID")
    checkout_url: str = Field(..., description="Frontend redirect target or gateway checkout endpoint")
    plan: Plan = Field(..., description="Subscription plan selected")
    mode: str = Field(..., description="'razorpay' for live gateway, 'mock' for sandbox simulation")
    
    # Razorpay-specific properties for frontend client SDK initialization
    razorpay_order_id: Optional[str] = Field(None, description="Unique Razorpay order ID ('order_...')")
    razorpay_key_id: Optional[str] = Field(None, description="Public gateway Key ID ('rzp_...')")
    amount: Optional[int] = Field(None, description="Charge amount in paise (1 INR = 100 paise)")
    currency: Optional[str] = Field(None, description="ISO currency code, e.g. 'INR'")
    name: Optional[str] = Field(None, description="Merchant display name")
    description: Optional[str] = Field(None, description="Product description displayed in modal")
    prefill_email: Optional[str] = Field(None, description="Candidate prefilled email address")


class WebhookPayload(BaseModel):
    """
    Server-to-server webhook notification or verification payload.
    """
    event_type: str = Field(..., description="Gateway event name (e.g. 'payment.captured')")
    user_id: str = Field(..., description="Target user identifier")
    plan: Optional[Plan] = Field(None, description="Plan associated with transaction")
    razorpay_payment_id: Optional[str] = Field(None, description="Gateway transaction payment ID ('pay_...')")
    razorpay_order_id: Optional[str] = Field(None, description="Gateway order ID ('order_...')")
    razorpay_signature: Optional[str] = Field(None, description="HMAC SHA256 signature for verification")


class MockWebhookRequest(BaseModel):
    """
    Simulation payload enabling end-to-end payment workflow testing without hitting real gateways.
    """
    user_id: str = Field(..., description="User ID to grant plan entitlements to")
    plan: Plan = Field(..., description="Plan tier to upgrade to")
    event_type: str = Field("payment.captured", description="Simulated gateway event")


class SubscriptionRecord(BaseModel):
    """
    Persistent subscription model tracking user entitlement status and gateway IDs.
    """
    id: str = Field(..., description="Primary record UUID")
    user_id: str = Field(..., description="Associated candidate user ID")
    plan: Plan = Field(..., description="Current active plan")
    razorpay_customer_id: Optional[str] = Field(None, description="Gateway customer reference")
    razorpay_subscription_id: Optional[str] = Field(None, description="Gateway subscription reference")
    razorpay_payment_id: Optional[str] = Field(None, description="Most recent payment reference")
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
    razorpay_event_id: Optional[str] = Field(None, description="Gateway webhook/transaction ID")
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
    razorpay_customer_id: Optional[str] = Field(None, description="Gateway customer ID")
    razorpay_subscription_id: Optional[str] = Field(None, description="Gateway subscription ID")
    created_at: Optional[datetime] = Field(None, description="Subscription creation date")
    updated_at: Optional[datetime] = Field(None, description="Latest status update date")


# ─── Pricing Matrix ──────────────────────────────────────────────────────────
# Central price table defining costs in paise (INR, 100 paise = ₹1) and feature entitlements.
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
