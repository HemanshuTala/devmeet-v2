# DevMeet - hybrid mode: Docker for infra + backend, Next.js frontend on host
# Use this when you want hot-reload on frontend without rebuilding Docker images.

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== DevMeet Local Dev (Hybrid) ===" -ForegroundColor Cyan

# Use E:\tmp for temp if C: is low (npm/Next.js)
if (-not (Test-Path "E:\tmp")) { New-Item -ItemType Directory -Force -Path "E:\tmp" | Out-Null }
$env:TEMP = "E:\tmp"
$env:TMP = "E:\tmp"

# 1. Start Docker backend
& "$PSScriptRoot\start-docker.ps1"

# 2. Ensure frontend env points to gateway
$envFile = Join-Path $Root "frontend\.env.local"
$envContent = @"
NEXT_PUBLIC_GATEWAY_URL=http://localhost:8000
NEXT_PUBLIC_NOTIF_WS_URL=ws://localhost:8008
"@
$envContent | Set-Content $envFile -Encoding UTF8

Write-Host "`n[Frontend] Installing deps if needed..." -ForegroundColor Yellow
Set-Location (Join-Path $Root "frontend")
if (-not (Test-Path "node_modules")) {
    npm install
}

Write-Host "`n[Frontend] Starting Next.js dev server on http://localhost:3000 ..." -ForegroundColor Green
npm run dev
