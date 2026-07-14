# Start MySQL with Docker Compose, wait for readiness, then run migration script
param(
  [int]$TimeoutSeconds = 120
)

Set-Location -Path $PSScriptRoot\..\

docker compose up -d

$cli = Get-Command docker -ErrorAction SilentlyContinue
$dockerAvailable = $false
if ($cli) {
  # check whether Docker engine responds
  try {
    docker info > $null 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerAvailable = $true }
  } catch { $dockerAvailable = $false }
}

if ($dockerAvailable) {
  Write-Host "Docker detected and engine responding - bringing up database with docker compose..." -ForegroundColor Cyan
  docker compose up -d
} else {
  Write-Host "Docker CLI missing or engine not responding - will attempt to connect to a local MySQL instance using environment/config values." -ForegroundColor Yellow
}


# Use cross-platform wait script to detect DB readiness
Write-Host "Waiting for DB to become available..." -ForegroundColor Cyan
& node scripts/wait-for-db.js
$rc = $LASTEXITCODE
if ($rc -ne 0) {
    Write-Error "Database did not become ready (exit $rc). Aborting migration."
    exit $rc
}

# Run migration with env vars set from .env if present
Write-Host "Running migration script..." -ForegroundColor Cyan
npm run migrate

Write-Host 'Migration finished. You can now run npm run server or start the dev environment.' -ForegroundColor Green
