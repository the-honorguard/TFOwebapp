# Starts the TFO Attendance app (backend API + Vite dev server) for local development.
# Usage: right-click > Run with PowerShell, or from a terminal: .\start-server.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Test-Path "$PSScriptRoot\node_modules")) {
    Write-Host "node_modules not found, running npm install..." -ForegroundColor Yellow
    npm install
}

Write-Host "Checking database availability..." -ForegroundColor Cyan

# Try a quick DB check with the existing wait-for-db.js using a short timeout.
try {
    $env:WAIT_DB_SECONDS = "5"
    & node scripts/wait-for-db.js
    $dbReady = $LASTEXITCODE -eq 0
} catch {
    Write-Host "Could not run wait-for-db.js (node might be missing). Assuming DB is not ready." -ForegroundColor Yellow
    $dbReady = $false
}

if (-not $dbReady) {
    Write-Host "Database not reachable - starting Docker and database (this may take a minute)..." -ForegroundColor Yellow
    if (Test-Path "$PSScriptRoot\scripts\start-db-and-migrate.ps1") {
        # Use the repository helper which brings up Docker, waits for DB and runs migrations
        powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\scripts\start-db-and-migrate.ps1"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to start database with scripts\start-db-and-migrate.ps1 (exit $LASTEXITCODE). Aborting."
            exit $LASTEXITCODE
        }
    } else {
        Write-Host "start-db-and-migrate.ps1 not found; attempting docker compose up -d" -ForegroundColor Yellow
        docker compose up -d
        Write-Host "Waiting for DB to become available..." -ForegroundColor Cyan
        # Try full wait (default WAIT_DB_SECONDS in script)
        & node scripts/wait-for-db.js
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Database did not become ready after docker compose. Aborting (exit $LASTEXITCODE)."
            exit $LASTEXITCODE
        }
    }
} else {
    Write-Host "Database is reachable." -ForegroundColor Green
}

Write-Host "Starting frontend and backend (npm run dev)..." -ForegroundColor Cyan
npm run dev
