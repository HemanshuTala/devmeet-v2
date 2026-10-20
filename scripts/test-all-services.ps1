# DevMeet Microservice Test Suite Runner
# Runs pytest across all 10 Python microservices with isolated PYTHONPATH

$services = @(
    "admin-service",
    "auth-service",
    "user-service",
    "orchestrator-service",
    "ai-interviewer-service",
    "code-execution-service",
    "feedback-service",
    "analytics-service",
    "payment-service",
    "file-service",
    "search-service"
)

$totalPass = 0
$totalFail = 0
$totalDuration = 0
$results = @()

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   DevMeet Microservices Automated Test Suite   " -ForegroundColor Cyan
Write-Host "=================================================`n" -ForegroundColor Cyan

foreach ($svc in $services) {
    $svcPath = "services/$svc"
    if (Test-Path "$svcPath/app") {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $output = & pytest "$svcPath" -o "pythonpath=$svcPath" -q --tb=short 2>&1
        $sw.Stop()
        $exitCode = $LASTEXITCODE
        $duration = [math]::Round($sw.Elapsed.TotalSeconds, 2)
        $totalDuration += $duration
        
        $line = ($output | Select-Object -Last 1) -as [string]
        if ($exitCode -eq 0) {
            Write-Host "[PASS] $svc ($duration s) - $line" -ForegroundColor Green
            if ($line -match "(\d+) passed") {
                $totalPass += [int]$Matches[1]
            }
            $results += [PSCustomObject]@{ Service = $svc; Status = "PASS"; Details = $line; Duration = "$duration s" }
        } else {
            Write-Host "[FAIL] $svc ($duration s) - $line" -ForegroundColor Red
            $totalFail++
            $results += [PSCustomObject]@{ Service = $svc; Status = "FAIL"; Details = $line; Duration = "$duration s" }
        }
    }
}

Write-Host "`n=================================================" -ForegroundColor Cyan
Write-Host "Test Results Summary:" -ForegroundColor Cyan
$results | Format-Table -AutoSize
Write-Host "Total Passed Tests: $totalPass" -ForegroundColor Green
if ($totalFail -gt 0) {
    Write-Host "Total Failed Suites: $totalFail" -ForegroundColor Red
    exit 1
} else {
    Write-Host "All suites passed cleanly in $totalDuration s!" -ForegroundColor Green
}
