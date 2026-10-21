# DevMeet — Docker, Cloudflare Tunnel & Deployment Commands

---

## 1. Start Docker Containers

### Start all services in background
```powershell
docker compose up -d
```

### Check status of all containers
```powershell
docker compose ps
```

### Stop all containers
```powershell
docker compose down
```

### Stop and remove volumes (clean wipe)
```powershell
docker compose down -v
```

---

## 2. Cloudflare Public HTTPS Tunnel

Expose your local DevMeet instance to the internet with a free temporary HTTPS URL:

### Expose Frontend & API Gateway (Port 3000)
```powershell
cloudflared tunnel --url http://localhost:3000
```
> Copy the generated `https://<random-name>.trycloudflare.com` URL and open it in any browser or share with interviewers.

### Expose API Gateway directly (Port 8000)
```powershell
cloudflared tunnel --url http://localhost:8000
```

---

## 3. Rebuild & Redeploy Commands

### Rebuild and restart the entire stack
```powershell
docker compose build
docker compose up -d
```

### Force clean rebuild without cache
```powershell
docker compose build --no-cache
docker compose up -d --force-recreate
```

---

## 4. Rebuild / Restart Specific Services

### Frontend only (Next.js)
```powershell
docker compose build frontend
docker compose up -d --no-deps frontend
```

### Feedback Service only
```powershell
docker compose build feedback-service
docker compose up -d --no-deps feedback-service
```

### AI Interviewer Service only
```powershell
docker compose build ai-interviewer-service
docker compose up -d --no-deps ai-interviewer-service
```

### Code Execution Sandbox only
```powershell
docker compose build code-execution-service
docker compose up -d --no-deps code-execution-service
```

### Video Service only
```powershell
docker compose build video-service
docker compose up -d --no-deps video-service
```

### Search Service only
```powershell
docker compose build search-service
docker compose up -d --no-deps search-service
```

### Quick Restart (without rebuild, picks up volume edits)
```powershell
docker compose restart <service-name>
# Example:
docker compose restart feedback-service
docker compose restart frontend
```

---

## 5. Logs & Health Checks

### View live logs of all services
```powershell
docker compose logs -f
```

### View logs of a specific service
```powershell
docker compose logs -f frontend
docker compose logs -f feedback-service
docker compose logs -f ai-interviewer-service
```

### Test API Gateway health
```powershell
curl.exe http://localhost:8000/api/v1/feedback/health
```

### Test Frontend HTTP status
```powershell
curl.exe -I http://localhost:3000
```
