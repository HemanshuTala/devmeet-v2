# DevMeet — free disk space before Docker builds (fixes ENOSPC / I/O errors)
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "=== DevMeet Disk Cleanup ===" -ForegroundColor Cyan

function Show-FreeSpace {
    Get-PSDrive -PSProvider FileSystem | ForEach-Object {
        $gb = [math]::Round($_.Free / 1GB, 2)
        Write-Host "  $($_.Name): $gb GB free" -ForegroundColor $(if ($gb -lt 5) { "Red" } elseif ($gb -lt 15) { "Yellow" } else { "Green" })
    }
}

Write-Host "`nBefore:" -ForegroundColor Yellow
Show-FreeSpace

Write-Host "`n[1] Docker prune..." -ForegroundColor Yellow
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker builder prune -af 2>$null
    docker image prune -af 2>$null
    docker container prune -f 2>$null
    docker volume prune -f 2>$null
}

Write-Host "`n[2] npm cache clean..." -ForegroundColor Yellow
if (Get-Command npm -ErrorAction SilentlyContinue) { npm cache clean --force 2>$null }

Write-Host "`n[3] Next.js build cache..." -ForegroundColor Yellow
$nextCache = Join-Path $Root "frontend\.next"
if (Test-Path $nextCache) { Remove-Item $nextCache -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "`nAfter:" -ForegroundColor Yellow
Show-FreeSpace
Write-Host "`nThen run: .\scripts\start-docker.ps1" -ForegroundColor Cyan
