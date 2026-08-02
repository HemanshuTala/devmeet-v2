-- Rename Stripe-era payment columns to provider-neutral names (Razorpay / multi-provider)

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'billing_events' AND column_name = 'stripe_event_id'
    ) THEN
        ALTER TABLE billing_events RENAME COLUMN stripe_event_id TO provider_event_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'stripe_customer_id'
    ) THEN
        ALTER TABLE subscriptions RENAME COLUMN stripe_customer_id TO provider_customer_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'stripe_subscription_id'
    ) THEN
        ALTER TABLE subscriptions RENAME COLUMN stripe_subscription_id TO provider_subscription_id;
    END IF;
END $$;
