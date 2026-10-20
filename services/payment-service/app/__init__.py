"""
DevMeet Payment Service Package
===============================
This package encapsulates the subscription billing, one-time payment processing,
gateway webhooks (Razorpay and Stripe), payment verification, and candidate entitlement
enforcement microservice for DevMeet.

Key Components:
- `config`: Environment settings, gateway API secrets, and plan pricing tiers.
- `database`: PostgreSQL persistence for transactions, user plan tiers, and subscriptions.
- `models`: Pydantic validation schemas for order creation, webhooks, and verification payloads.
- `routes`: Endpoints for initiating checkouts, verifying signatures, handling webhooks, and plan queries.
- `middleware`: Distributed correlation tracing, latency logging, and error wrappers.
"""
