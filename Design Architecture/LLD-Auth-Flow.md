# LLD — Authentication & Authorization Flow Diagram
**File:** `LLD-Auth-Flow.drawio`  
**Document Number:** DevMeet-LLD-001  
**Diagram Type:** UML Sequence Diagram  
**How to open:** [draw.io](https://app.diagrams.net) → File → Open → select the `.drawio` file.

---

## What This Diagram Shows

Every way a user can authenticate into DevMeet — and how tokens are managed. It covers 4 complete flows shown as UML sequence diagrams with proper lifelines and message arrows.

---

## How to Read a UML Sequence Diagram

- **Boxes at the top** = participants (actors and systems)
- **Dashed vertical lines** = lifelines — the participant "lives" along this line over time
- **Solid arrow →** = a call/request being sent
- **Dashed arrow ⇢** = a return/response
- **`sd [name]`** box = a named sequence frame containing one flow
- **`opt [condition]`** box = an optional block that only runs if the condition is true
- Time flows **top to bottom**

---

## Participants (Lifelines)

| Lifeline | What it is |
|----------|-----------|
| `:Browser` | The user's web browser running the Next.js frontend |
| `:API Gateway` | Kong/NGINX at port 8000 — receives all requests first |
| `:Auth Service` | FastAPI service at port 8001 — handles all auth logic |
| `:PostgreSQL` | The database — stores users, plans, login history, reset tokens |
| `:Redis` | In-memory store — holds JWT refresh tokens, MFA temp tokens, rate-limit counters |
| `:OAuth Provider` | Google or GitHub — the external OAuth2 server |
| `:Notification Svc` | Node.js service — sends welcome emails via AWS SES |

---

## Flow 1 — Register (sd [Flow 1: Register])

A new user creates an account.

| Step | Who | What happens |
|------|-----|-------------|
| 1 | Browser → Auth | `POST /auth/register {email, password, display_name}` |
| 2 | Auth | Validates input with Pydantic schema; checks email is not already taken |
| 3 | Auth | Hashes password with **bcrypt cost factor 12** |
| 4 | Auth → PostgreSQL | `INSERT` into `user_profiles`, `user_plans` (plan=free), `usage_quotas` |
| 5 | Auth → Redis | `SET refresh:{SHA256(token)} → user_id` with 7-day TTL |
| 6 | Auth → Notification | Publishes `user.registered` event → welcome email sent via SES |
| 7 | Auth → Browser | `200 {access_token, refresh_token, expires_in}` |

---

## Flow 2 — Login + MFA (sd [Flow 2: Login])

An existing user logs in, with optional MFA challenge.

| Step | Who | What happens |
|------|-----|-------------|
| 1 | Browser → Auth | `POST /auth/login {email, password}` |
| 2 | Auth | Checks `login_attempts` table — if locked (5 failures), returns **429** |
| 3 | Auth → PostgreSQL | `SELECT user WHERE email = $1` |
| 4 | Auth | `bcrypt.verify(plaintext_password, stored_hash)` + checks `is_blocked` flag |
| 5a (opt) | Auth → Redis | If MFA enabled: `SET mfa_temp:{token} TTL 5min` → returns **202 {mfa_token}** |
| 5b | Browser → Auth | `POST /auth/mfa/login-verify {mfa_token, totp_code}` |
| 6 | Auth → Redis | `GET mfa_temp:{token}` to retrieve the user_id |
| 7 | Auth | `pyotp.TOTP(secret).verify(totp_code)` — validates the 6-digit code |
| 8 | Auth | Issues JWT pair; `INSERT` login_history row |
| 9 | Auth → Browser | `200 {access_token, refresh_token}` |

**If MFA is NOT enabled**, steps 5a, 5b, 6, 7 are skipped — JWT is issued directly at step 4.

---

## Flow 3 — OAuth2 Social Login (sd [Flow 3: OAuth2])

Login via Google or GitHub account.

| Step | Who | What happens |
|------|-----|-------------|
| 1 | Browser → Auth | `GET /auth/oauth/google` (or `/auth/oauth/github`) |
| 2 | Auth → Redis | Stores CSRF state token with 5-minute TTL |
| 2 | Auth → Browser | **302 redirect** to Google/GitHub with `state` param |
| 3 | Browser → Auth | Returns with `GET /auth/oauth/callback?code=…&state=…` |
| 4 | Auth | Verifies `state` matches Redis value (CSRF protection) |
| 5 | Auth → OAuth Provider | Exchanges `code` for access token; fetches user profile |
| 6 | Auth → PostgreSQL | `UPSERT user_profiles` — creates account or links `google_id`/`github_id` to existing account |
| 7 | Auth | Issues JWT pair |
| 8 | Auth → Browser | **302 redirect** to `/dashboard?token=…` |

---

## Flow 4 — Token Refresh & Logout (sd [Flow 4: Refresh])

How short-lived access tokens are renewed without re-login, and how logout works.

### Token Refresh
| Step | Who | What happens |
|------|-----|-------------|
| 1 | Browser → Auth | `POST /auth/refresh {refresh_token}` |
| 2 | Auth → Redis | `GET refresh:{SHA256(refresh_token)}` — looks up user_id |
| 3 | Auth → Redis | `DEL` old refresh token (**rotation** — old token is immediately invalidated) |
| 4 | Auth → Redis | `SET` new refresh token with fresh 7-day TTL |
| 5 | Auth → Browser | `200 {new_access_token, new_refresh_token}` |

### Logout
| Step | Who | What happens |
|------|-----|-------------|
| 1 | Browser → Auth | `POST /auth/logout` |
| 2 | Auth → Redis | `DEL refresh:{hash}` — token is permanently revoked |
| 3 | Auth → Browser | `204 No Content` |

---

## JWT Token Design (Note Box)

Two tokens are issued together on every successful login:

**Access Token (HS256, 15 minutes)**
```
{
  sub:   "<user_uuid>",
  role:  "user | admin | superadmin",
  email: "user@example.com",
  jti:   "<unique_id>",        ← prevents replay
  iat:   <issued_at_unix>,
  exp:   <expiry_unix>
}
```
Short-lived so a stolen token expires quickly.

**Refresh Token (opaque, 7 days)**
- Random 64-byte hex string
- SHA-256 hash stored in Redis as `refresh:{hash} → user_id`
- Never decoded — only compared against Redis
- Rotated on every use (a used token cannot be used twice)

---

## RBAC — Who Can Access What

| Role | Access Level |
|------|-------------|
| `anonymous` | `/auth/login`, `/auth/register`, `/auth/reset-password`, `/search/questions` |
| `user` | All own data: sessions, feedback, analytics, profile, billing |
| `admin` | All user routes + `/admin/*` endpoints |
| `superadmin` | All admin routes + impersonation + hard delete |

Role is encoded in the JWT `role` claim and checked in every service's auth middleware.
