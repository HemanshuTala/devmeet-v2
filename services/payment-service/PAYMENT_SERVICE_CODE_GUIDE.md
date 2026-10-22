# Payment Service: Easy-English Code Guide

This guide explains the Payment Service files and their functions in plain
English. It describes the clean mock payment flow designed for zero-trouble interview demonstrations.

## What this service does

The Payment Service manages plan information, creates instant checkout/upgrade sessions,
updates subscription records in the database, logs billing ledger events, and synchronizes
quota limits with the User Service.

The service listens on port `8012`. Its clean flow is:

1. A user clicks "Upgrade to Pro" (or selects an upgraded plan) on the frontend.
2. The frontend calls `POST /api/v1/payments/checkout-session`.
3. The Payment Service:
   - Immediately updates the user's subscription in PostgreSQL (or in-memory cache) to `pro`.
   - Records an immutable billing transaction in `billing_events`.
   - Notifies the User Service (`PUT /api/v1/users/{user_id}/plan`) so interview quotas reset and upgrade limits take effect instantly.
4. The frontend receives confirmation and immediately updates the UI with an active Pro subscription banner, new quotas, and updated billing history.
5. If the user cancels their plan (`POST /api/v1/payments/cancel`), the service reverts their subscription to `free`, logs the event, and updates the User Service.

## Files in this service

### `app/config.py` — payment configuration

- `USER_SERVICE_URL`, `AUTH_SERVICE_URL`, and `FRONTEND_URL` provide service
  addresses with local development defaults.
- `PAYMENT_MODE` defines the payment mode (`"mock"` by default).
- Zero external gateway dependencies (no Razorpay credentials required).

### `app/main.py` — FastAPI application entry point

- `lifespan(app)` connects to PostgreSQL on startup (with automatic in-memory fallback if the DB is unreachable) and gracefully closes connections on shutdown.
- Configures CORS for browser access.
- Attaches `RequestIDMiddleware` for tracing.
- `/health` diagnostic probe reports service status and mock payment readiness.

### `app/models.py` — Pydantic schemas and pricing matrix

- `Plan`: enum for `free`, `pro`, `enterprise`.
- `CheckoutSessionRequest` & `CheckoutSessionResponse`: schemas for upgrade requests.
- `SubscriptionResponse`: candidate subscription status.
- `BillingEventRecord` & `BillingHistoryResponse`: financial audit trail schemas.
- `PLAN_PRICES`: pricing table (Pro: ₹1,599/mo; Enterprise: Contact sales).

### `app/database.py` — database persistence

- Connects to PostgreSQL using `asyncpg`.
- Automatically falls back to in-memory dictionaries if PostgreSQL is unavailable.
- `upsert_subscription`: atomically updates plan and status (`ON CONFLICT (user_id)`).
- `cancel_subscription`: reverts plan to `free`.
- `log_billing_event` & `get_billing_history`: persists and fetches ledger records.

### `app/routes.py` — REST endpoints

- `GET /api/v1/payments/config`: returns `{ "provider": "mock", "mode": "mock", "currency": "INR" }`.
- `GET /api/v1/payments/plans`: returns public tier catalog.
- `GET /api/v1/payments/subscription`: returns candidate's active plan.
- `POST /api/v1/payments/checkout-session`: instant one-click plan upgrade. Updates DB, logs billing event, notifies User Service.
- `POST /api/v1/payments/upgrade`: direct upgrade endpoint.
- `POST /api/v1/payments/verify-payment`: mock payment completion verification.
- `POST /api/v1/payments/cancel`: reverts plan to free tier.
- `GET /api/v1/payments/billing-history`: returns transaction ledger.
