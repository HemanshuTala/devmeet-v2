# DevMeet — End-to-End Smoke Test
# Verifies the core user journey works: register -> login -> create session -> cancel

$Gateway = $env:GATEWAY_URL
if (-not $Gateway) { $Gateway = "http://localhost:8000" }

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$email = "smoketest_${ts}@devmeet.test"
$password = "SmokeTest123!"

Write-Host "=== DevMeet E2E Smoke Test ===" -ForegroundColor Cyan
Write-Host "Gateway: $Gateway"
Write-Host "Test user: $email`n"

$pass = 0
$fail = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Block)
    try {
        $result = & $Block
        Write-Host "[PASS] $Name" -ForegroundColor Green
        $script:pass++
        return $result
    } catch {
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:fail++
        return $null
    }
}

# 1. Health check
Test-Step "Auth service healthy" {
    $r = Invoke-RestMethod -Uri "$Gateway/api/v1/auth/health" -Method Get -TimeoutSec 5
    if (-not $r.status) { throw "No status field" }
}

# 2. Register
$token = Test-Step "Register new user" {
    $body = @{ email = $email; password = $password; full_name = "Smoke Test" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Gateway/api/v1/auth/register" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
    if (-not $r.access_token) { throw "No access_token in response" }
    $r.access_token
}

if (-not $token) {
    # Try login if register failed (user may already exist)
    $token = Test-Step "Login existing user" {
        $body = @{ email = $email; password = $password } | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$Gateway/api/v1/auth/login" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
        if (-not $r.access_token) { throw "No access_token" }
        $r.access_token
    }
}

if (-not $token) {
    Write-Host "`nCannot proceed without auth token. Aborting." -ForegroundColor Red
    exit 1
}

$headers = @{ Authorization = "Bearer $token" }

# 3. Get profile
Test-Step "Fetch user profile" {
    $r = Invoke-RestMethod -Uri "$Gateway/api/v1/users/me" -Method Get -Headers $headers -TimeoutSec 5
    if (-not $r.email) { throw "No email in profile" }
}

# 4. Create session
$sessionId = Test-Step "Create interview session" {
    $body = @{ interview_type = "dsa"; difficulty = "easy"; duration_minutes = 30 } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Gateway/api/v1/sessions" -Method Post -Body $body -ContentType "application/json" -Headers $headers -TimeoutSec 10
    if (-not $r.id) { throw "No session id" }
    $r.id
}

# 5. Get session
if ($sessionId) {
    Test-Step "Fetch session details" {
        $r = Invoke-RestMethod -Uri "$Gateway/api/v1/sessions/$sessionId" -Method Get -Headers $headers -TimeoutSec 5
        if ($r.status -ne "created") { throw "Expected status 'created', got '$($r.status)'" }
    }

    # 6. Cancel session
    Test-Step "Cancel session" {
        $r = Invoke-RestMethod -Uri "$Gateway/api/v1/sessions/$sessionId/cancel" -Method Post -Headers $headers -TimeoutSec 5
        if ($r.status -ne "cancelled") { throw "Expected 'cancelled', got '$($r.status)'" }
    }
}

# 7. Check payment plans endpoint
Test-Step "Fetch payment plans" {
    $r = Invoke-RestMethod -Uri "$Gateway/api/v1/payments/plans" -Method Get -Headers $headers -TimeoutSec 5
    if (-not $r.plans) { throw "No plans array" }
}

# 8. Check AI service health
Test-Step "AI Interviewer service healthy" {
    $r = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/health" -Method Get -TimeoutSec 5
    if (-not $r.status) { throw "No status" }
}

Write-Host "`n=== Results ===" -ForegroundColor Cyan
Write-Host "Passed: $pass | Failed: $fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Yellow" })

if ($fail -gt 0) { exit 1 }
