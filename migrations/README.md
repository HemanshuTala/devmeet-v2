# Database Migrations (`migrations/`)

## 1. Overview

The `migrations/` directory contains PostgreSQL SQL schema scripts that initialize and migrate the authoritative database for DevMeet v2.0.

### Key Principle
Services **must never** dynamically generate tables or alter schema columns at runtime. All schemas, foreign keys, indexes, and constraints are declared declaratively and applied through automated initialization.

---

## 2. Migration Files

| File | Order | Description |
|---|:---:|---|
| `init_dev_schema.sql` | 01 | **Authoritative consolidated schema** loaded by Docker during first-time startup via `/docker-entrypoint-initdb.d/`. Contains all 14 tables, indexes, and extensions. |
| `001_initial_schema.sql` | 02 | Initial base migration defining user, session, and turn models. |
| `002_rename_stripe_to_provider.sql` | 03 | Migrates billing columns from provider-specific naming to generic provider schemas (`provider_customer_id`, `provider_subscription_id`) supporting Razorpay. |

---

## 3. Schema Highlights

- **UUID Primary Keys**: Uses `gen_random_uuid()` via the `pgcrypto` extension for distributed ID generation.
- **Transactional Outbox Table**: `outbox_events` enables atomic event publishing for the Orchestrator service.
- **Idempotency Records**: `idempotency_records` stores request hashes and cached response bodies for 24 hours to ensure idempotent HTTP operations.
- **GIN Indexing**: Applied to `analytics_events(properties)` for fast JSONB querying.
