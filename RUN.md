# DevMeet — Run Guide

## Troubleshooting: disk full (ENOSPC)

Docker and `npm run dev` use **C:** for temp/cache. If builds fail with `Input/output error` or `ENOSPC`:

1. Check space: `Get-PSDrive C,E`
2. Free **C:** (Recycle Bin, Windows Storage > Temporary files) — need **≥ 10 GB** for Docker builds
3. Optional cleanup: `.\scripts\cleanup-disk.ps1` (prunes Docker cache/images)
4. Move Docker Desktop disk image to **E:** (Settings > Resources > Advanced > Disk image location)
5. Run frontend with temp on E::
   ```powershell
   $env:TEMP="E:\tmp"; $env:TMP="E:\tmp"
   cd frontend; npm run dev
   ```

---

## Quick start (recommended)

### With Docker (full backend)

```powershell
# From project root
.\scripts\start-docker.ps1

# In a second terminal — frontend
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

### One command (Docker backend + frontend)

```powershell
.\scripts\start-local.ps1
```

---

## URLs

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:3000 |
| **API Gateway** | http://localhost:8000 |
| Auth (direct) | http://localhost:8001 |
| User | http://localhost:8002 |
| Sessions | http://localhost:8003 |
| AI Interviewer | http://localhost:8004 |
| Code Execution | http://localhost:8005 |
| Video | http://localhost:8006 |
| Feedback | http://localhost:8007 |
| Notifications (WS) | ws://localhost:8008 |
| Analytics | http://localhost:8009 |
| Admin | http://localhost:8010 |
| Files | http://localhost:8011 |
| Payments | http://localhost:8012 |
| Search | http://localhost:8013 |
| RabbitMQ UI | http://localhost:15672 (guest/guest) |

---

## Frontend environment (`frontend/.env.local`)

```env
NEXT_PUBLIC_GATEWAY_URL=http://localhost:8000
NEXT_PUBLIC_NOTIF_WS_URL=ws://localhost:8008
```

All API calls go through the gateway on port **8000**. WebSocket notifications connect directly to port **8008**.

---

## Without Docker (script)

Requires **Python 3.11+** on PATH.

```powershell
.\scripts\start-without-docker.ps1
# Second terminal:
$env:TEMP="E:\tmp"; $env:TMP="E:\tmp"
cd frontend; npm run dev
```

---

## Without Docker (manual)

### 1. Infrastructure only in Docker

```powershell
docker compose -f docker-compose.yml up -d
```

### 2. Apply database schema

```powershell
Get-Content .\migrations\init_dev_schema.sql | docker compose -f docker-compose.yml exec -T postgres psql -U devmeet -d devmeet
```

### 3. Run each service locally

Copy `.env` and set `POSTGRES_HOST=localhost`, `REDIS_HOST=localhost`, etc.

```powershell
# Auth (port 8001)
cd services\auth-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001

# Repeat for user-service (8002), orchestrator (8003), ai-interviewer (8004), etc.
```

### 4. API Gateway

Either run nginx gateway in Docker only:

```powershell
docker compose -f docker-compose.yml -f docker-compose.services.yml up -d api-gateway
```

Or point frontend directly at individual service ports (not recommended).

### 5. Frontend

```powershell
cd frontend
npm run dev
```

---

## Health check

```powershell
.\scripts\health-check.ps1
```

---

## Stop everything

```powershell
docker compose -f docker-compose.yml -f docker-compose.services.yml down
```

---

## Optional: Groq AI

Add your key to `.env`:

```env
GROQ_API_KEY=gsk_your_key_here
```

Without it, AI interview and feedback use local fallback responses.

---

## Test the product

1. Open http://localhost:3000
2. **Register** a new account
3. **Dashboard** → Create Session → Start Interview
4. Complete interview → View **Feedback** report
5. Check **Analytics** and **Profile** pages
