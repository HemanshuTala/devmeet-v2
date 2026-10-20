"""One-shot script to append performance indexes to the migration file."""
import os

sql_to_append = """
-- Performance indexes added during backend optimization phase
-- Covers the most frequent dashboard and session-listing queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_status_created
    ON sessions(user_id, status, created_at DESC);

-- Partial index for public leaderboard queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_public_active
    ON user_profiles(id)
    WHERE profile_public = TRUE AND deleted_at IS NULL;

-- Speeds up quota resets and limit checks in increment_quota
CREATE INDEX IF NOT EXISTS idx_usage_quotas_user_reset
    ON usage_quotas(user_id, last_reset_date);

-- Covers outbox polling query: WHERE status = 'pending' ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_outbox_status_created
    ON outbox_events(status, created_at)
    WHERE status = 'pending';
"""

path = os.path.join(os.path.dirname(__file__), "..", "migrations", "init_dev_schema.sql")
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

if "idx_sessions_user_status_created" not in content:
    with open(path, "a", encoding="utf-8") as f:
        f.write(sql_to_append)
    print("Indexes appended.")
else:
    print("Indexes already present, skipping.")
