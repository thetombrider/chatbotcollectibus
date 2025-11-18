#!/usr/bin/env pwsh
# Script per eseguire E2E test web search flow
# Usage: .\scripts\run-e2e-web-search-test.ps1 [-SkipLive]

param(
    [switch]$SkipLive
)

Write-Host "🚀 Running E2E Web Search Flow Test" -ForegroundColor Cyan
Write-Host ""

if ($SkipLive) {
    Write-Host "⚠️  Skipping live API tests (SKIP_LIVE_TESTS=true)" -ForegroundColor Yellow
    $env:SKIP_LIVE_TESTS = "true"
} else {
    Write-Host "⚠️  Including live API tests (will consume API credits)" -ForegroundColor Yellow
    $env:SKIP_LIVE_TESTS = "false"
}

Write-Host ""

# Execute test
tsx tests/e2e/web-search-flow.test.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Test completed successfully" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Test failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
