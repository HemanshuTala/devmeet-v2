# DevMeet — microservices on host (Python) + infra in Docker
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== DevMeet Without Docker (host services) ===" -ForegroundColor Cyan

function Find-Python {
    foreach ($cmd in @("python3.11", "python3", "python")) {
        $exe = Get-Command $cmd -ErrorAction SilentlyContinue
        if ($exe) {
            try {
                $null = & $exe.Source -c "import sys; print(sys.version)" 2>&1
                if ($LASTEXITCODE -eq 0) { return $exe.Source }
            } catch {}
        }
    }
    return $null
}

$python = Find-Python
if (-not $python) {
    Write-Error "Python 3.11+ required. Install from python.org and add to PATH."
}

Write-Host "Python: $python" -ForegroundColor Green

docker compose -f docker-compose.yml up -d
Start-Sleep -Seconds 8
Get-Content ".\migrations\init_dev_schema.sql" | docker compose -f docker-compose.yml exec -T postgres psql -U devmeet -d devmeet

$services = @(
    @{ Dir = "auth-service"; Port = 8001 },
    @{ Dir = "user-service"; Port = 8002 },
    @{ Dir = "orchestrator-service"; Port = 8003 },
    @{ Dir = "ai-interviewer-service"; Port = 8004 },
    @{ Dir = "code-execution-service"; Port = 8005 },
    @{ Dir = "video-service"; Port = 8006 },
    @{ Dir = "feedback-service"; Port = 8007 },
    @{ Dir = "notification-service"; Port = 8008 },
    @{ Dir = "analytics-service"; Port = 8009 },
    @{ Dir = "admin-service"; Port = 8010 },
    @{ Dir = "file-service"; Port = 8011 },
    @{ Dir = "payment-service"; Port = 8012 },
    @{ Dir = "search-service"; Port = 8013 }
)

foreach ($svc in $services) {
    $path = Join-Path $Root "services\$($svc.Dir)"
    $port = $svc.Port
    $inner = "Set-Location '$path'; if (-not (Test-Path .venv)) { & '$python' -m venv .venv }; .\.venv\Scripts\Activate.ps1; pip install -q -r requirements.txt; `$env:POSTGRES_HOST='localhost'; `$env:REDIS_HOST='localhost'; `$env:RABBITMQ_HOST='localhost'; `$env:AUTH_SERVICE_URL='http://localhost:8001'; `$env:USER_SERVICE_URL='http://localhost:8002'; `$env:JWT_SECRET_KEY='devmeet_jwt_secret_change_in_prod'; uvicorn app.main:app --host 0.0.0.0 --port $port"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $inner
    Start-Sleep -Milliseconds 500
}

Write-Host "`nStart API gateway (Docker): docker compose -f docker-compose.yml -f docker-compose.services.yml up -d api-gateway" -ForegroundColor Yellow
Write-Host "Start frontend: cd frontend; npm run dev" -ForegroundColor Yellow
Write-Host "Open http://localhost:3000" -ForegroundColor Green
