<#
PowerShell script to delete all tables from the configured MySQL database
Usage: .\scripts\clear-db.ps1
It looks for env vars DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT,
or falls back to config\mysql.json (same precedence as db.js).
This script is destructive — it will prompt for a typed confirmation.
#>

param(
    [switch]$Force
)

Set-StrictMode -Version Latest

# Load config from env or config/mysql.json
 $envHost = $env:DB_HOST
 $envUser = $env:DB_USER
 $envPassword = $env:DB_PASSWORD
 $envName = $env:DB_NAME
 $envPort = $env:DB_PORT

$cfgPath = Join-Path (Get-Location) 'config\mysql.json'
$config = $null
if (Test-Path $cfgPath) {
    try { $config = Get-Content $cfgPath -Raw | ConvertFrom-Json } catch { $config = $null }
}

 $dbHost = if ($envHost) { $envHost } elseif ($config -and $config.host) { $config.host } else { '127.0.0.1' }
 $dbUser = if ($envUser) { $envUser } elseif ($config -and $config.user) { $config.user } else { 'tfo' }
 $dbPassword = if ($envPassword) { $envPassword } elseif ($config -and $config.password) { $config.password } else { 'tfo_pass' }
 $dbName = if ($envName) { $envName } elseif ($config -and $config.database) { $config.database } else { 'tfowebapp' }
 $dbPort = if ($envPort) { [int]$envPort } elseif ($config -and $config.port) { [int]$config.port } else { 3306 }

Write-Host "Database target: $($dbHost):$($dbPort) / $dbName" -ForegroundColor Yellow

# Confirm (skip when -Force passed)
if (-not $Force) {
    $confirm = Read-Host "Type DELETE to confirm wiping all tables in database '$dbName'"
    if ($confirm -ne 'DELETE') {
        Write-Host 'Aborted by user.' -ForegroundColor Cyan
        exit 1
    }
} else {
    Write-Host "-Force supplied: skipping interactive confirmation" -ForegroundColor Yellow
}

# Check for mysql CLI; if missing, fallback to node script
$mysqlExe = "mysql"
$which = Get-Command $mysqlExe -ErrorAction SilentlyContinue
if (-not $which) {
    Write-Host "mysql client not found in PATH. Will try Node fallback script (requires node and project deps)." -ForegroundColor Yellow
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Host "Neither 'mysql' CLI nor 'node' found in PATH. Install one of them to proceed." -ForegroundColor Red
        exit 2
    }
    # Build node command args (call .cjs to avoid ESM CommonJS issues)
    if ($Force) { $forceArg = '-Force' } else { $forceArg = '' }
    Write-Host "Running Node fallback: node .\scripts\clear-db.cjs $forceArg" -ForegroundColor Yellow
    $nodeExe = 'node'
    $nodeArgs = @('.\scripts\clear-db.cjs')
    if ($Force) { $nodeArgs += '-Force' }
    $proc = & $nodeExe $nodeArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Node fallback failed: $proc" -ForegroundColor Red
        exit 3
    }
    Write-Host $proc
    exit 0
}

# Build command to list drop statements
 $dropQuery = "SELECT CONCAT('DROP TABLE IF EXISTS `', TABLE_NAME, '`;') FROM information_schema.TABLES WHERE TABLE_SCHEMA = '" + $dbName + "';"

# Retrieve drop statements
 $cmdList = & $mysqlExe -h $dbHost -P $dbPort -u $dbUser -p$($dbPassword) -N -e $dropQuery 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error listing tables: $cmdList" -ForegroundColor Red
    exit 3
}

$dropStmts = $cmdList -split "\r?\n" | Where-Object { $_ -and $_ -ne '' }
if ($dropStmts.Count -eq 0) {
    Write-Host "No tables found in database '$dbName'. Nothing to do." -ForegroundColor Green
    exit 0
}

# Compose full SQL
$fullSql = "SET FOREIGN_KEY_CHECKS=0;`n" + ($dropStmts -join "`n") + "`nSET FOREIGN_KEY_CHECKS=1;"

# Execute drop statements
Write-Host "Dropping $($dropStmts.Count) tables..." -ForegroundColor Yellow
$exec = & $mysqlExe -h $dbHost -P $dbPort -u $dbUser -p$($dbPassword) -D $dbName -e $fullSql 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error executing drop statements: $exec" -ForegroundColor Red
    exit 4
}

Write-Host "All tables dropped from '$dbName'." -ForegroundColor Green
exit 0
