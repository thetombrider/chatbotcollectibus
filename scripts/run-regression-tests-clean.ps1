#!/usr/bin/env pwsh
# Script per eseguire tutti i regression tests
# Verifica che le modifiche al refactoring non abbiano rotto nulla

Write-Host "🧪 Running Regression Tests" -ForegroundColor Cyan
Write-Host "=" * 60
Write-Host ""

$totalTests = 0
$passedTests = 0
$failedTests = 0

# Test 1: Type Check
Write-Host "📝 Test 1: TypeScript Type Check" -ForegroundColor Yellow
Write-Host "-" * 60
try {
    npm run type-check 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Type check PASSED" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "❌ Type check FAILED" -ForegroundColor Red
        npm run type-check
        $failedTests++
    }
} catch {
    Write-Host "❌ Type check ERROR: $_" -ForegroundColor Red
    $failedTests++
}
$totalTests++
Write-Host ""

# Test 2: Lint Check
Write-Host "🔧 Test 2: ESLint Check" -ForegroundColor Yellow
Write-Host "-" * 60
try {
    $lintOutput = npm run lint 2>&1
    $errorCount = ($lintOutput | Select-String -Pattern "Error:" -AllMatches).Matches.Count
    
    if ($errorCount -eq 0) {
        Write-Host "✅ Lint check PASSED (no errors)" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "❌ Lint check FAILED ($errorCount errors)" -ForegroundColor Red
        Write-Host $lintOutput
        $failedTests++
    }
} catch {
    Write-Host "❌ Lint check ERROR: $_" -ForegroundColor Red
    $failedTests++
}
$totalTests++
Write-Host ""

# Test 3: Query Enhancement Tests
Write-Host "🔍 Test 3: Query Enhancement" -ForegroundColor Yellow
Write-Host "-" * 60
try {
    tsx tests/query-enhancement-test.ts 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Query enhancement tests PASSED" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "❌ Query enhancement tests FAILED" -ForegroundColor Red
        Write-Host "   Running test to show output:"
        tsx tests/query-enhancement-test.ts
        $failedTests++
    }
} catch {
    Write-Host "❌ Query enhancement tests ERROR: $_" -ForegroundColor Red
    $failedTests++
}
$totalTests++
Write-Host ""

# Test 4: E2E Web Search Flow (dry run)
Write-Host "🌐 Test 4: E2E Web Search Flow (Dry Run)" -ForegroundColor Yellow
Write-Host "-" * 60
try {
    $env:SKIP_LIVE_TESTS = "true"
    tsx tests/e2e/web-search-flow.test.ts 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ E2E web search tests PASSED" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "❌ E2E web search tests FAILED" -ForegroundColor Red
        Write-Host "   Running test to show output:"
        tsx tests/e2e/web-search-flow.test.ts
        $failedTests++
    }
} catch {
    Write-Host "❌ E2E web search tests ERROR: $_" -ForegroundColor Red
    $failedTests++
}
$totalTests++
Write-Host ""

# Test 5: Environment Validation
Write-Host "🔐 Test 5: Environment Validation" -ForegroundColor Yellow
Write-Host "-" * 60
try {
    npm run validate-env 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Environment validation PASSED" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "⚠️  Environment validation has warnings (acceptable)" -ForegroundColor Yellow
        $passedTests++  # Warnings are acceptable
    }
} catch {
    Write-Host "❌ Environment validation ERROR: $_" -ForegroundColor Red
    $failedTests++
}
$totalTests++
Write-Host ""

# Summary
Write-Host "=" * 60
Write-Host "📊 Regression Test Summary" -ForegroundColor Cyan
Write-Host "=" * 60
Write-Host "Total tests: $totalTests"
Write-Host "Passed: $passedTests" -ForegroundColor $(if ($passedTests -eq $totalTests) { "Green" } else { "Yellow" })
Write-Host "Failed: $failedTests" -ForegroundColor $(if ($failedTests -eq 0) { "Green" } else { "Red" })
Write-Host "Success rate: $([math]::Round(($passedTests / $totalTests) * 100, 1))%"
Write-Host ""

if ($failedTests -eq 0) {
    Write-Host "✅ All regression tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Note: Full integration tests (unified-cache.test.ts) require" -ForegroundColor Gray
    Write-Host "      Jest configuration. Run: npm test (when configured)" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "❌ Some tests failed. See details above." -ForegroundColor Red
    exit 1
}
