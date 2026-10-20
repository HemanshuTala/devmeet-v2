# Docker Commands Cheat Sheet

All frontend and backend services run through `docker-compose.yml`.

---

## 1. Start Services

### Start all services in background
```bash
docker compose up -d
```

### Rebuild and start after code changes
```bash
docker compose up -d --build
```

### Rebuild only one specific service
```bash
docker compose up -d --build <service-name>
# Examples:
# docker compose up -d --build frontend
# docker compose up -d --build auth-service
# docker compose up -d --build api-gateway
```

---

## 2. Stop Services

### Stop all running containers
```bash
docker compose down
```

### Stop all containers and delete volumes (WARNING: deletes DB data)
```bash
docker compose down -v
```

### Restart all containers
```bash
docker compose restart
```

### Restart a single service
```bash
docker compose restart <service-name>
# Example: docker compose restart api-gateway
```

---

## 3. Check Status & Health

### List running containers
```bash
docker ps
```

### List all containers (including stopped)
```bash
docker ps -a
```

### Check service health via API Gateway
```bash
curl http://localhost:8000/health
```

---

## 4. View Logs

### View logs of all services in real time
```bash
docker compose logs -f
```

### View logs of a specific service
```bash
docker compose logs -f <service-name>
# Examples:
# docker compose logs -f frontend
# docker compose logs -f auth-service
# docker compose logs -f orchestrator-service
```

### View the last 50 lines of logs
```bash
docker compose logs --tail=50 <service-name>
```

---

## 5. Free Up Disk Space (Clean Docker)

### Check disk space used by Docker
```bash
docker system df
```

### Clear build cache (frees up 10+ GB)
```bash
docker builder prune -a -f
```

### Remove dangling/unused images
```bash
docker image prune -f
```

### Remove unused volumes
```bash
docker volume prune -f
```

### Full cleanup (removes unused containers, networks, images, and build cache)
```bash
docker system prune -a --volumes -f
```

---

## 6. Access URLs

| Component | URL |
|---|---|
| **Frontend & API Gateway** | http://localhost:8000 |
| **Frontend Direct** | http://localhost:3000 |
| **RabbitMQ Dashboard** | http://localhost:15672 (user: `guest`, pass: `guest`) |
| **PostgreSQL** | `localhost:5432` (db: `devmeet`, user: `devmeet`, pass: `devmeet_password`) |
| **Redis** | `localhost:6379` |

---

## 7. Make Platform Live on Internet (100% Free, No Credit Card)

```powershell
cloudflared tunnel --url http://localhost:8000
```
*(Copy the `https://xxxx.trycloudflare.com` URL printed in the terminal).*
