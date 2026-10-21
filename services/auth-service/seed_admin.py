import asyncio
import asyncpg
import os
import bcrypt
import uuid

async def main():
    conn = await asyncpg.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        user=os.getenv("POSTGRES_USER", "devmeet"),
        password=os.getenv("POSTGRES_PASSWORD", "devmeet_password"),
        database=os.getenv("POSTGRES_DB", "devmeet"),
    )
    email = "admin@devmeet.com"
    pwd = "Admin@12345"
    h = bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    row = await conn.fetchrow("SELECT id FROM user_profiles WHERE email = $1", email)
    if row:
        await conn.execute(
            "UPDATE user_profiles SET password_hash = $1, email_verified = true, mfa_enabled = false WHERE email = $2",
            h,
            email,
        )
        print("ADMIN_UPDATED")
    else:
        user_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO user_profiles (id, email, password_hash, display_name, email_verified, mfa_enabled)
            VALUES ($1, $2, $3, $4, true, false)
            """,
            user_id,
            email,
            h,
            "DevMeet Administrator",
        )
        # Also seed plan
        await conn.execute(
            """
            INSERT INTO user_plans (user_id, plan, updated_at)
            VALUES ($1, 'enterprise', NOW())
            ON CONFLICT (user_id) DO UPDATE SET plan = 'enterprise'
            """,
            user_id,
        )
        print("ADMIN_CREATED")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
