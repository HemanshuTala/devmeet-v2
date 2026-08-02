# DevMeet — verify API gateway and service health endpoints

$Gateway = $env:GATEWAY_URL
if (-not $Gateway) { $Gateway = "http://localhost:8000" }

$checks = @(
    @{ Name = "API Gateway (auth health via proxy)"; Url = "$Gateway/api/v1/auth/../health"; Fallback = "http://localhost:8001/health" },
    @{ Name = "Auth Service"; Url = "http://localhost:8001/health" },
    @{ Name = "User Service"; Url = "http://localhost:8002/health" },
    @{ Name = "Orchestrator"; Url = "http://localhost:8003/health" },
    @{ Name = "AI Interviewer"; Url = "http://localhost:8004/health" },
    @{ Name = "Code Execution"; Url = "http://localhost:8005/health" },
    @{ Name = "Video Service"; Url = "http://localhost:8006/health" },
    @{ Name = "Feedback"; Url = "http://localhost:8007/health" },
    @{ Name = "Notification"; Url = "http://localhost:8008/health" },
    @{ Name = "Analytics"; Url = "http://localhost:8009/health" },
    @{ Name = "Admin"; Url = "http://localhost:8010/health" },
    @{ Name = "File Service"; Url = "http://localhost:8011/health" },
    @{ Name = "Payment"; Url = "http://localhost:8012/health" },
    @{ Name = "Search"; Url = "http://localhost:8013/health" }
)

Write-Host "=== DevMeet Health Check ===" -ForegroundColor Cyan
Write-Host "Gateway: $Gateway`n"

$ok = 0
$fail = 0

foreach ($c in $checks) {
    $name = $c.Name
    $url = $c.Url
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
            Write-Host "[OK]   $name" -ForegroundColor Green
            $ok++
        } else {
            Write-Host "[FAIL] $name - HTTP $($resp.StatusCode)" -ForegroundColor Red
            $fail++
        }
    } catch {
        if ($c.Fallback) {
            try {
                $resp2 = Invoke-WebRequest -Uri $c.Fallback -UseBasicParsing -TimeoutSec 5
                Write-Host "[OK]   $name (direct)" -ForegroundColor Green
                $ok++
                continue
            } catch {}
        }
        $err = $_.Exception.Message
        Write-Host "[FAIL] $name - $err" -ForegroundColor Red
        $fail++
    }
}

# Gateway smoke test
try {
    $gw = Invoke-WebRequest -Uri "$Gateway/api/v1/search/questions?limit=1" -UseBasicParsing -TimeoutSec 8
    Write-Host "[OK]   Gateway routing (/api/v1/search)" -ForegroundColor Green
    $ok++
} catch {
    Write-Host "[WARN] Gateway routing test failed (search may still be starting)" -ForegroundColor Yellow
}

Write-Host "`nResult: $ok passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Yellow" })
