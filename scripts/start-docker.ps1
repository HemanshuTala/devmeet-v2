# DevMeet - start full stack with Docker (infra + all microservices + API gateway)
# Frontend runs separately: cd frontend && npm run dev

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== DevMeet Docker Startup ===" -ForegroundColor Cyan
Write-Host "Project root: $Root"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed or not in PATH."
}

# Check free space
$cFreeGb = [math]::Round((Get-PSDrive C).Free / 1GB, 2)
$projDrive = (Get-Item $Root).PSDrive.Name
$projFreeGb = [math]::Round((Get-PSDrive $projDrive).Free / 1GB, 2)
if ($cFreeGb -lt 10) {
    Write-Host "`nWARNING: C: has only $cFreeGb GB free. Docker builds need ~10-15 GB on C:." -ForegroundColor Red
    Write-Host "Free C: space or move Docker disk image to E: (Docker Desktop Settings Resources)." -ForegroundColor Yellow
    Write-Host "Then run .\scripts\cleanup-disk.ps1`n" -ForegroundColor Yellow
    if ($cFreeGb -lt 2) {
        Write-Error "C: drive critically full. Free space before continuing."
    }
}
if ($projFreeGb -lt 2) {
    Write-Error "Project drive $projDrive has only $projFreeGb GB free."
}

# Sequential builds avoid Docker I/O errors on Windows when disk is tight
$env:COMPOSE_PARALLEL_LIMIT = "2"
$env:DOCKER_BUILDKIT = "1"

# Load .env if present
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

Write-Host "`n[1/3] Starting infrastructure (Postgres, Redis, RabbitMQ, Elasticsearch, Kafka)..." -ForegroundColor Yellow
docker compose -f docker-compose.yml up -d

Write-Host "`n[2/3] Waiting for Postgres to be healthy..." -ForegroundColor Yellow
$retries = 30
for ($i = 0; $i -lt $retries; $i++) {
    $health = docker inspect --format='{{.State.Health.Status}}' (docker compose -f docker-compose.yml ps -q postgres 2>$null) 2>$null
    if ($health -eq "healthy") { break }
    Start-Sleep -Seconds 2
}

Write-Host "`n[2b] Applying DB schema..." -ForegroundColor Yellow
docker compose -f docker-compose.yml exec -T postgres psql -U devmeet -d devmeet -f /docker-entrypoint-initdb.d/01_init_dev_schema.sql 2>$null
if ($LASTEXITCODE -ne 0) {
    Get-Content ".\migrations\init_dev_schema.sql" | docker compose -f docker-compose.yml exec -T postgres psql -U devmeet -d devmeet
}
if (Test-Path ".\migrations\002_rename_stripe_to_provider.sql") {
    Get-Content ".\migrations\002_rename_stripe_to_provider.sql" | docker compose -f docker-compose.yml exec -T postgres psql -U devmeet -d devmeet 2>$null
}

Write-Host "`n[3/3] Building and starting all microservices + API gateway..." -ForegroundColor Yellow
$serviceNames = @(
    "auth-service", "user-service", "orchestrator-service", "ai-interviewer-service",
    "code-execution-service", "video-service", "feedback-service", "notification-service",
    "analytics-service", "admin-service", "file-service", "payment-service", "search-service"
)
foreach ($name in $serviceNames) {
    Write-Host "  Building $name..." -ForegroundColor DarkGray
    docker compose -f docker-compose.yml -f docker-compose.services.yml build $name
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Build failed for $name. Try: .\scripts\cleanup-disk.ps1" -ForegroundColor Red
        exit 1
    }
}
docker compose -f docker-compose.yml -f docker-compose.services.yml build api-gateway
docker compose -f docker-compose.yml -f docker-compose.services.yml up -d

Write-Host "`n=== Stack Status ===" -ForegroundColor Green
docker compose -f docker-compose.yml -f docker-compose.services.yml ps

$accessInfo = @"

=== Access URLs ===
  API Gateway:     http://localhost:8000
  Frontend:        http://localhost:3000  (run separately)
  RabbitMQ UI:     http://localhost:15672  (guest/guest)
  Postgres:        localhost:5432  (devmeet / devmeet_password)

=== Start Frontend ===
  cd frontend
  npm run dev

=== Health Check ===
  .\scripts\health-check.ps1
"@

Write-Host $accessInfo -ForegroundColor Cyan
