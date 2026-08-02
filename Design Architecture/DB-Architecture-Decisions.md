# DevMeet v2.0 — Database Architecture Decisions
**Document Number:** DevMeet-DB-002
**Version:** 1.0
**Date:** 2026-08-02
**Status:** Approved
**Classification:** Internal

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why a Single Shared PostgreSQL Database](#2-why-a-single-shared-postgresql-database)
3. [Vertical vs Horizontal Scaling Decision](#3-vertical-vs-horizontal-scaling-decision)
4. [Partitioning Decisions](#4-partitioning-decisions)
5. [Sharding Decision](#5-sharding-decision)
6. [Read Replicas](#6-read-replicas)
7. [Connection Pooling](#7-connection-pooling)
8. [Redis — What It Splits Out From PostgreSQL](#8-redis--what-it-splits-out-from-postgresql)
9. [Elasticsearch — Why Search Is a Separate Store](#9-elasticsearch--why-search-is-a-separate-store)
10. [Kafka vs RabbitMQ — Why Two Brokers](#10-kafka-vs-rabbitmq--why-two-brokers)
11. [AWS S3 — Why Files Are Not in PostgreSQL](#11-aws-s3--why-files-are-not-in-postgresql)
12. [Transactional Outbox Pattern](#12-transactional-outbox-pattern)
13. [Data Retention and Archival](#13-data-retention-and-archival)
14. [Backup and Recovery](#14-backup-and-recovery)
15. [Future Migration Path to Sharding](#15-future-migration-path-to-sharding)
16. [Decision Summary Table](#16-decision-summary-table)

---

## 1. Overview

DevMeet's database layer consists of **five distinct storage systems**, each chosen for a specific workload type. This document records every architectural decision made — what was chosen, what was considered but rejected, and why.

```
Workload                → Storage System
────────────────────────────────────────────────────
Relational + ACID data  → PostgreSQL 16 (primary)
Session cache / Pub-Sub → Redis 7.2
Full-text search        → Elasticsearch 8.x
File / blob storage     → AWS S3
Reliable task queues    → RabbitMQ 3.12
High-volume event log   → Kafka 3.6
```

The PostgreSQL database is the **single source of truth** for all persistent business data. Everything else is either a cache, a projection, or a transport layer.

---

## 2. Why a Single Shared PostgreSQL Database

### Decision
All 14 microservices share **one logical PostgreSQL 16 database** (`devmeet`) on one primary instance, rather than one database per service.

### Considered alternatives

| Option | Why rejected |
|--------|-------------|
| One DB per service (true DB-per-service) | Eliminates cross-service JOINs. But at current scale, most queries are single-service anyway. The operational cost of 14 independent Postgres instances (connection overhead, backup jobs, separate pgBouncer pools, separate monitoring) far outweighs the isolation benefit. |
| Separate schemas per service in one DB | This was considered and is **partially implemented** — each service owns its tables by naming convention (e.g. Orchestrator owns `sessions`, `conversation_turns`, `code_submissions`). Direct cross-schema JOINs are avoided at the service layer. This gives logical isolation without operational overhead. |
| MongoDB / document store | DevMeet's data has strong relational structure (users → sessions → turns → feedback). PostgreSQL's JSONB handles the few flexible fields (event `properties`, `detailed_feedback`). No need to give up ACID guarantees for a document model. |
| CockroachDB / Distributed SQL | Adds latency on every write (consensus protocol). Premature at current DAU. |

### Why this is acceptable now
- Estimated peak concurrent sessions: ~500 (early growth phase)
- PostgreSQL 16 on `c6g.2xlarge` (8 vCPU, 16 GB RAM) handles ~10,000 TPS comfortably
- Each service only writes to its own tables — no cross-service write contention
- Single backup/restore procedure, single monitoring target, single migration process

### When to revisit
When any single service's table exceeds 100M rows OR read latency on that service's queries exceeds P95 > 50 ms consistently for 7+ days. That is the trigger to extract that service into its own database instance.

---

## 3. Vertical vs Horizontal Scaling Decision

### Decision
**Vertical scaling first**, then move to read replicas, then partition. Horizontal sharding is the last resort.

### Rationale

Microservices already give horizontal scaling at the **application layer** — each service pod scales independently. The database does not need to scale horizontally in lockstep with them, because each request touches only a narrow slice of tables (e.g., an analytics request only reads `analytics_events` and `sessions`).

The scaling ladder we follow:

```
Stage 1 (current):  Single primary, pgBouncer pooling
Stage 2 (>500 DAU): Add 1 read replica for analytics + reporting queries
Stage 3 (>5k DAU):  Add 2 read replicas, primary handles only writes
Stage 4 (>50k DAU): Table-level partitioning on high-volume tables
Stage 5 (>500k DAU): Extract services with largest tables to dedicated DBs
Stage 6 (>5M DAU):  Evaluate horizontal sharding for sessions / analytics
```

We are at **Stage 1**. Stages 2–4 require no application code changes, only infrastructure changes.

---

## 4. Partitioning Decisions

Partitioning is applied to the two highest-volume, append-only tables. All other tables do not need partitioning at current scale.

### 4.1 `analytics_events` — Range Partitioned by `created_at`

**Why:** Analytics events are append-only and accumulate fastest. A month of active usage produces millions of rows. Old partitions can be detached and archived without locking the live table. Queries always filter by date range, so partition pruning eliminates most scans.

**Partition scheme:**
```sql
-- Parent table (no data stored here)
CREATE TABLE analytics_events (
    id          BIGSERIAL,
    event_type  VARCHAR(50)  NOT NULL,
    user_id     VARCHAR(100),
    session_id  VARCHAR(100),
    properties  JSONB,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Monthly child partitions (created by automated job)
CREATE TABLE analytics_events_2026_08
    PARTITION OF analytics_events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE analytics_events_2026_09
    PARTITION OF analytics_events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
-- ... one per month, automated via pg_partman
```

**Retention action:** Partitions older than 12 months are detached and dumped to S3 as compressed Parquet (via pg_dump --table). The partition is then dropped. This keeps the live table small without a slow DELETE scan.

---

### 4.2 `sessions` — Range Partitioned by `created_at` (deferred to Stage 4)

**Why:** Sessions will be the second-highest volume table. At Stage 1 scale this is not needed, but the table is designed for it — no composite PK, `created_at` is indexed. Enabling partitioning later requires a table rebuild, which we will schedule during a maintenance window at Stage 4.

**Planned partition scheme (future):**
```sql
-- Quarterly partitions (sessions span longer time windows than events)
CREATE TABLE sessions_2026_q3
    PARTITION OF sessions
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
```

**Why quarterly not monthly:** A session's feedback report and turns need to be readable for months after the session. Monthly partitions create cross-partition JOINs (e.g. `sessions` JOIN `feedback_reports` across months). Quarterly keeps that data co-located longer.

---

### 4.3 Tables NOT Partitioned (and why)

| Table | Reason not partitioned |
|-------|----------------------|
| `user_profiles` | Small table (one row per user). Users don't grow at the same rate as events. B-tree index on `email` is sufficient for all queries. |
| `conversation_turns` | High volume per session, but always queried by `session_id` FK. Index on `(session_id, turn_number)` handles all queries without partitioning. If volume is extreme, co-partitioning with `sessions` is the path. |
| `feedback_reports` | One row per completed session. Grows at the same rate as `sessions` but 1:1 — when `sessions` is partitioned, `feedback_reports` will be co-partitioned. |
| `audit_logs` | Compliance requirement to keep all logs. Append-only. At Stage 3 this will be partitioned monthly and old partitions moved to Glacier. |
| `billing_events` | Legal requirement — never deleted. Small volume (one event per payment). No partitioning needed. |

---

## 5. Sharding Decision

### Decision
**No sharding at this stage.**

### What sharding would mean here

Horizontal sharding would split the `sessions` or `analytics_events` table across multiple PostgreSQL instances using a shard key (e.g. `user_id`). A routing layer (e.g. Citus, or manual application-level routing) would direct queries to the correct shard.

### Why we are not sharding now

1. **Volume does not warrant it.** Sharding solves write throughput above ~50,000–100,000 writes/second or storage above ~10 TB on a single node. DevMeet is nowhere near this.

2. **Cost of sharding is high.** Cross-shard JOINs become application-level merges. Transactions that touch two users (e.g. a leaderboard query) require scatter-gather. Schema migrations must run on every shard. The Analytics Service queries across all users — sharding by `user_id` would make this a full scatter query.

3. **Partitioning gives most of the benefit at a fraction of the cost.** Range partitioning on `created_at` keeps each partition small. Partition pruning on date-filtered queries is effectively as fast as a sharded lookup without the distributed transaction overhead.

4. **Vertical headroom is large.** PostgreSQL 16 on a modern instance handles ~100M rows per table before performance degrades without partitioning. With partitioning, individual partition files stay small regardless of total row count.

### When sharding becomes necessary (trigger conditions)

| Metric | Threshold | Action |
|--------|-----------|--------|
| Single-instance write TPS | > 50,000/s sustained | Add Citus for `analytics_events` write distribution |
| Largest partition size | > 500 GB | Shard `analytics_events` by `user_id % N` shards |
| Primary CPU | > 80% sustained | Evaluate shard split or extract service DB |
| `sessions` row count | > 500M | Shard sessions by `user_id` hash, 4 shards |

### What we would shard first (priority order if needed)
1. `analytics_events` — highest write volume, user_id is a natural shard key, queries are user-scoped
2. `sessions` — second highest, user_id shard key works cleanly since sessions are always queried per user
3. `conversation_turns` — shard key would be `session_id`, which maps to a user shard

`user_profiles`, `billing_events`, and `subscriptions` would remain on a single node — they are small and cross-user queries on them are infrequent and acceptable with scatter-gather.

---

## 6. Read Replicas

### Current state
Single primary, no replicas. All reads and writes go to the same instance.

### Why acceptable now
- Most read queries are highly selective (indexed lookups by `user_id` or `session_id`)
- Analytics Service already falls back to demo data on DB unreachability
- Redis caches the hot read path (JWT tokens, session quota, leaderboard)

### Replica plan (Stage 2, triggered at 500+ DAU)

```
Primary (writes only)
    │
    ├── Replica 1 (Analytics Service reads)
    │   → session queries, feedback queries, aggregate dashboards
    │
    └── Replica 2 (Admin Service reads, reporting, CSV exports)
        → user listing queries, audit log queries
```

**Routing rule:** Services that do heavy reporting reads (Analytics, Admin) are configured with a secondary `DATABASE_URL_READONLY` environment variable pointing to the replica. Write-path services (Auth, Orchestrator, Payment) always use the primary URL.

**Replica lag target:** < 100 ms. If lag exceeds 500 ms, the Analytics Service falls back to its cached/demo data path (this path already exists in the code).

---

## 7. Connection Pooling

### Decision
**pgBouncer** in transaction-mode pooling in front of the PostgreSQL primary.

### Why pgBouncer
PostgreSQL creates a new OS process per connection. Without pooling, 14 services × 10 pods each × 5 connections per pod = 700 connections. PostgreSQL degrades above ~300 connections on typical hardware.

pgBouncer maintains a small pool of real connections (e.g., 50–100) and multiplexes the 700+ application connections through them. At the service layer each service uses a connection string pointing to pgBouncer (port 6432), not directly to PostgreSQL (port 5432).

**Pool configuration:**
```ini
pool_mode = transaction      # connection released back after each transaction
max_client_conn = 1000       # max connections from all services combined
default_pool_size = 50       # real PostgreSQL connections per database
reserve_pool_size = 10       # emergency reserve
server_idle_timeout = 600    # idle PG connections closed after 10 min
```

**Why transaction mode and not session mode:** Session mode holds a real PG connection for the lifetime of the client connection (minutes to hours). Transaction mode releases the connection after each transaction commit/rollback. Most of DevMeet's queries are short, discrete transactions (INSERT session, SELECT turns), so transaction mode is safe and far more efficient.

---

## 8. Redis — What It Splits Out From PostgreSQL

Redis is **not an alternative database** — it is a purpose-built layer for data that does not need to survive a restart OR that needs sub-millisecond access times that PostgreSQL cannot match for hot paths.

| What is stored | Key pattern | TTL | Why Redis and not PostgreSQL |
|---------------|-------------|-----|------------------------------|
| JWT refresh tokens | `refresh:{token_hash}` | 7 days | High read frequency (every API call checks this). A DB lookup per request would add 5–15 ms latency on every authenticated call. Redis responds in < 1 ms. |
| Rate-limit counters | `ratelimit:{ip}:{window}` | 60 s | Counters need atomic INCR and TTL. These are discarded after the window — storing in PostgreSQL would create massive write churn and rows that are immediately useless. |
| MFA TOTP temp state | `mfa_pending:{user_id}` | 10 min | Exists only during MFA verification flow. No need for durable storage. |
| Session quota cache | `quota:{user_id}` | Until midnight | Avoids a DB read on every interview create. The authoritative value is in `usage_quotas` table; Redis holds the fast-path copy that is invalidated on update. |
| WebSocket Pub/Sub | `notif:{user_id}` channel | N/A | The Notification Service runs as multiple pods. A notification must reach the pod holding the user's WebSocket connection. Redis Pub/Sub broadcasts to all pods; only the one with that user's connection delivers it. This is impossible with PostgreSQL LISTEN/NOTIFY in a multi-pod setup. |

### What is NOT in Redis (and why)
- User profiles — must be durable; PostgreSQL with indexed lookup is fast enough
- Sessions — transactional state, must be ACID; `last_heartbeat_at` is written by the Orchestrator
- Feedback reports — complex JSONB, infrequently read, must survive restarts
- Billing events — legal retention requirement, cannot be in a volatile store

---

## 9. Elasticsearch — Why Search Is a Separate Store

### Decision
The question bank lives in Elasticsearch (`devmeet_questions` index), not in a PostgreSQL table.

### Why not `questions` table in PostgreSQL

| Requirement | PostgreSQL full-text search | Elasticsearch |
|-------------|---------------------------|---------------|
| Full-text search across title, body, tags | `tsvector` + GIN index — works but limited | Native inverted index — faster and more relevant scoring |
| Fuzzy matching (typos in search queries) | Not supported natively | Built-in with `fuzziness` parameter |
| Tag-based filtering combined with full-text | Possible but awkward (`WHERE tags @> ARRAY['dp']`) | First-class as filter clauses |
| Relevance ranking (best match first) | BM25 approximation only | Native BM25, configurable field boosts |
| Auto-complete suggestions | Not supported | Completion suggester |
| Adding new questions without reindexing existing data | Requires table lock for large indexes | Index-level updates, no locking |

The question bank is **read-heavy** (many searches, infrequent writes) and has no relationships to other tables that need transactional guarantees. These are exactly the conditions where a dedicated search engine wins over a relational index.

### Data flow
1. Admin adds a question → `POST /search/questions` → Search Service writes to Elasticsearch
2. Interview creation → `GET /search/questions/random?type=dsa&difficulty=medium` → Elasticsearch returns a candidate question
3. No PostgreSQL table for questions — Elasticsearch is the single store

### Consistency note
If Elasticsearch is unavailable, the Search Service falls back to a pre-seeded set of questions stored as a static JSON file in the service. This ensures interview creation never fails due to search unavailability.

---

## 10. Kafka vs RabbitMQ — Why Two Brokers

Having two message brokers looks like over-engineering. Here is the precise reason each exists.

### RabbitMQ — for reliable task queues

**Used for:** `session.completed` → Feedback Service, `feedback.generated` → Notification Service, `user.registered` → welcome email

**Key property:** **Exactly-once delivery guarantee**. RabbitMQ with publisher confirms + manual ACK ensures that even if the Feedback Service pod crashes mid-processing, the message is requeued and redelivered. The feedback report will always be generated.

**Message lifetime:** Short. Once consumed and ACKed, the message is deleted. We do not need historical access to "which sessions were completed last Tuesday".

### Kafka — for replayable event streams

**Used for:** `analytics.events` topic consumed by Analytics Service, `audit.actions` topic

**Key property:** **Replayable log**. Kafka retains all events for a configured retention period (currently 30 days). If the Analytics Service is down for 2 hours, it resumes from its committed offset and processes all missed events in order. No events are lost.

**Second property:** **Multiple independent consumers**. Multiple services can read the same Kafka topic independently (different consumer groups). Today only Analytics reads `analytics.events`. In the future, a Data Warehouse service or a Fraud Detection service can join as a new consumer group without any changes to the producer (Orchestrator).

### Why not use only one

| Use Kafka for everything | Problem |
|--------------------------|---------|
| Feedback Service triggers | Kafka has no per-message TTL or dead-letter queue as first-class features. Task queue semantics (retry, DLQ, routing by criteria) are bolted on. RabbitMQ is specifically designed for this. |

| Use RabbitMQ for everything | Problem |
|-----------------------------|---------|
| Analytics event pipeline | Once consumed, messages are gone. If Analytics is down and the queue fills, messages are dropped or the queue backs up indefinitely. There is no "replay from 2 hours ago". |

---

## 11. AWS S3 — Why Files Are Not in PostgreSQL

### Decision
Profile avatars, PDF feedback reports, and user-uploaded files are stored in S3, not in PostgreSQL `bytea` columns.

### Reasoning

| Storing in PostgreSQL `bytea` | Storing in S3 |
|-------------------------------|--------------|
| Bloats DB disk — a 1 MB avatar × 100k users = 100 GB in the DB | S3 storage is ~$0.023/GB vs ~$0.10/GB for SSD-backed DB storage |
| Every DB backup includes all blobs | Backups only cover structured data; files have their own versioning |
| Streaming large files through the DB wastes connection pool slots | S3 presigned URLs let the browser download directly — zero DB involvement |
| No CDN integration possible | S3 + CloudFront gives global CDN delivery for avatars |
| PostgreSQL vacuum is slowed by large `bytea` dead tuples | Not applicable to S3 |

### What IS stored in PostgreSQL
The S3 object key and URL (e.g., `avatar_url VARCHAR(500)`, `pdf_url VARCHAR(500)`). The DB holds the pointer, not the bytes.

### Access pattern
- **Upload:** Service uploads to S3 via AWS SDK, stores the resulting URL in PostgreSQL.
- **Download:** File Service generates a presigned URL (15-minute expiry). Browser downloads directly from S3 — the service is not in the data path.

---

## 12. Transactional Outbox Pattern

### The problem
When the Orchestrator marks a session `completed`, it needs to:
1. UPDATE `sessions` SET status = 'completed' in PostgreSQL
2. Publish `session.completed` to RabbitMQ

These are two separate systems. If PostgreSQL commits but RabbitMQ publish fails (network blip), the Feedback Service never generates the report. If RabbitMQ publishes but PostgreSQL rolls back (DB error), the Feedback Service processes a ghost session.

### Solution: `outbox_events` table

```sql
CREATE TABLE outbox_events (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type   VARCHAR(100) NOT NULL,
    payload      JSONB        NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
```

**How it works:**
1. Orchestrator writes `UPDATE sessions` AND `INSERT INTO outbox_events` in a **single PostgreSQL transaction**. Both succeed or both fail — atomically.
2. A background worker (runs inside the Orchestrator pod, polls every 1 second) reads `status = 'pending'` outbox rows, publishes to RabbitMQ, then marks them `status = 'processed'`.
3. If the worker crashes after publishing but before marking processed, it re-publishes on next poll. Feedback Service is idempotent on `session_id` — duplicate delivery is safe.

**Result:** Message delivery has the same durability guarantee as the database write. No lost messages.

---

## 13. Data Retention and Archival Policy

| Table | Retention | Action on expiry |
|-------|-----------|-----------------|
| `analytics_events` | 12 months online | Monthly partitions detached, dumped to S3 (Parquet/gzip), partition dropped |
| `audit_logs` | 90 days online, then 2 years cold | Rows older than 90 days copied to S3 JSON dump, then deleted from DB |
| `login_history` | 90 days | DELETE WHERE login_time < NOW() - INTERVAL '90 days' (nightly cron) |
| `login_attempts` | 24 hours after unlock | DELETE WHERE locked_until < NOW() - INTERVAL '24h' |
| `password_resets` | 24 hours after expiry | DELETE WHERE expires_at < NOW() - INTERVAL '24h' |
| `sessions` | Indefinite (user owns their data) | Soft-deleted via CASCADE when user account is deleted |
| `conversation_turns` | Same as parent session | CASCADE DELETE with session |
| `feedback_reports` | Indefinite (user owns their data) | Soft-deleted via CASCADE when user deleted |
| `billing_events` | **7 years** (legal/financial compliance) | Never auto-deleted. Archived to S3 Glacier after 2 years. |
| `outbox_events` | 7 days after processed | DELETE WHERE status = 'processed' AND processed_at < NOW() - INTERVAL '7d' |

### GDPR Right to Erasure
When a user exercises their right to erasure, the process is:
1. `UPDATE user_profiles SET deleted_at = NOW()` — soft delete
2. `DELETE FROM user_profiles WHERE id = $1` triggers CASCADE on all dependent tables
3. `UPDATE audit_logs SET user_id = NULL WHERE user_id = $1` — SET NULL FK preserves the audit trail
4. `UPDATE billing_events SET user_id = NULL WHERE user_id = $1` — financial records kept, identity anonymised
5. S3 objects (avatar, PDFs) are deleted via `aws s3 rm`

---

## 14. Backup and Recovery

### Backup strategy

| Type | Tool | Frequency | Retention | Storage |
|------|------|-----------|-----------|---------|
| Full logical backup | `pg_dump` | Daily at 02:00 UTC | 30 days | S3 Standard-IA |
| WAL archiving (PITR) | `pg_basebackup` + WAL-G | Continuous | 7 days of WAL | S3 Standard |
| Redis snapshot (RDB) | Redis `BGSAVE` | Every 1 hour | 3 days | S3 Standard |
| Elasticsearch snapshot | Elasticsearch Snapshot API | Daily | 7 days | S3 Standard |

### Recovery time objectives

| Scenario | RTO | RPO | Recovery method |
|----------|-----|-----|----------------|
| Pod crash (no data loss) | < 2 min | 0 | Kubernetes restarts pod, reconnects to same DB |
| Primary DB instance failure | < 15 min | < 5 min | Promote read replica (Stage 2+), or restore from WAL |
| Accidental table DROP | < 30 min | < 1 min | PITR restore to point-in-time before the DROP |
| Full datacenter loss | < 4 hours | < 1 hour | Restore from S3 backup into new region |

### Testing
Backup restoration is tested monthly by spinning up a scratch PostgreSQL instance, restoring the latest dump, and running the schema validation query (`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`).

---

## 15. Future Migration Path to Sharding

If DevMeet reaches 500k+ DAU and a single primary with replicas is no longer sufficient, the migration path is:

### Phase 1 — Extract high-volume services to dedicated databases
```
Current: All services → single PostgreSQL
Phase 1: Analytics Service → analytics_db (separate PG instance)
         (Move: analytics_events, audit_logs)
```
This requires no application changes beyond a new `DATABASE_URL` environment variable for the Analytics Service. No FK relationships cross this boundary.

### Phase 2 — Introduce Citus for analytics_db
[Citus](https://github.com/citusdata/citus) is a PostgreSQL extension that adds transparent sharding. `analytics_events` is distributed by `user_id`:

```sql
SELECT create_distributed_table('analytics_events', 'user_id');
```

This shards rows across worker nodes by `user_id % N`. Queries filtered by `user_id` (per-user dashboards) hit only one shard. Cross-user aggregate queries scatter across all shards in parallel.

### Phase 3 — Shard sessions if needed
If `sessions` exceeds 500M rows, apply the same Citus approach with `user_id` as the distribution column. `conversation_turns` and `code_submissions` are co-located with their parent session via Citus's reference table feature.

### What does NOT get sharded
- `user_profiles` — small, highly relational, queried by many services
- `billing_events` — small, never deleted, not a performance bottleneck
- `subscriptions`, `user_plans` — tiny tables, queried on every auth check

---

## 16. Decision Summary Table

| Decision | Choice Made | Rejected alternatives | Trigger to revisit |
|----------|------------|----------------------|-------------------|
| DB topology | Single shared PostgreSQL 16 | DB-per-service, separate schemas | Any service table > 100M rows |
| Scaling approach | Vertical first, then read replicas | Immediate horizontal sharding | 500+ DAU |
| Partitioning | `analytics_events` monthly range | No partitioning, hash partitioning | Already active; `sessions` at Stage 4 |
| Sharding | None | Citus, Vitess, manual app-level sharding | 500k DAU or primary write TPS > 50k |
| Connection pooling | pgBouncer transaction mode | No pooling, session mode, PgCat | Pool exhaustion alerts |
| Cache layer | Redis 7.2 | Memcached, DynamoDB DAX, in-process cache | Redis memory > 80% sustained |
| Search store | Elasticsearch 8 | PostgreSQL full-text, Typesense, Meilisearch | ES operational cost at scale |
| File storage | AWS S3 | PostgreSQL bytea, MinIO (self-hosted) | Cloud cost threshold |
| Message queue (tasks) | RabbitMQ 3.12 | Kafka for all, AWS SQS, Redis queues | RabbitMQ memory > 4 GB |
| Event stream | Kafka 3.6 | Only RabbitMQ, AWS Kinesis, Redpanda | Kafka broker cost > SQS equivalent |
| Outbox pattern | `outbox_events` table + poller | Dual-write (rejected — no atomicity), CDC (future option) | Consider Debezium CDC at Stage 3 |
| Data retention | Per-table policy (see §13) | Indefinite retention everywhere | Legal/compliance change |
| Backup | pg_dump daily + WAL-G continuous | Snapshot-only, no PITR | RTO/RPO requirements tighten |
