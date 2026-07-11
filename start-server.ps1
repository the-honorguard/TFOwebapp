# Starts the TFO Attendance app (backend API + Vite dev server) for local development.
# Usage: right-click > Run with PowerShell, or from a terminal: .\start-server.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Test-Path "$PSScriptRoot\node_modules")) {
    Write-Host "node_modules not found, running npm install..." -ForegroundColor Yellow
    npm install
}

Write-Host "Starting TFO Attendance (server on :3000, client on :5173)..." -ForegroundColor Cyan
npm run dev
