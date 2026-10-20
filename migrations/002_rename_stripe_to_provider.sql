-- ============================================================================
-- DevMeet v2.0 Database Migration 002 — Provider-Neutral Billing Schema
-- ============================================================================
-- Purpose:
--   Renames legacy provider-specific columns (formerly 'stripe_*') to provider-neutral
--   identifiers ('provider_*').
--
-- Why this is required:
--   Enables seamless integration with Razorpay (and future regional payment gateways)
--   without schema locks or conflicting naming conventions.
--
-- Idempotency:
--   Uses PL/pgSQL conditional checks (`information_schema.columns`) to ensure
--   safe, repeatable execution without raising errors if columns were already renamed.
-- ============================================================================

DO $$
BEGIN
    -- 1. Rename billing_events.stripe_event_id -> provider_event_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'billing_events' AND column_name = 'stripe_event_id'
    ) THEN
        ALTER TABLE billing_events RENAME COLUMN stripe_event_id TO provider_event_id;
    END IF;

    -- 2. Rename subscriptions.stripe_customer_id -> provider_customer_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'stripe_customer_id'
    ) THEN
        ALTER TABLE subscriptions RENAME COLUMN stripe_customer_id TO provider_customer_id;
    END IF;

    -- 3. Rename subscriptions.stripe_subscription_id -> provider_subscription_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'stripe_subscription_id'
    ) THEN
        ALTER TABLE subscriptions RENAME COLUMN stripe_subscription_id TO provider_subscription_id;
    END IF;
END $$;
