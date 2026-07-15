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

    function Ensure-DockerReady {
        param(
            [int]$WaitSeconds = 60
        )

        $dockerReady = $false
        try { docker info > $null 2>&1; if ($LASTEXITCODE -eq 0) { $dockerReady = $true } } catch {}

        if ($dockerReady) { return $true }

        Write-Host "Docker CLI not responding; attempting to start Docker..." -ForegroundColor Yellow

        # Try starting the Docker Windows service if present
        try {
            $svc = Get-Service -Name com.docker.service -ErrorAction SilentlyContinue
            if ($svc -and $svc.Status -ne 'Running') {
                Start-Service -Name com.docker.service -ErrorAction Stop
                Start-Sleep -Seconds 2
            }
        } catch {}

        # If service isn't running, try to start Docker Desktop executable
        $svc = Get-Service -Name com.docker.service -ErrorAction SilentlyContinue
        if (-not ($svc -and $svc.Status -eq 'Running')) {
            $possiblePaths = @(
                "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
                "$env:ProgramFiles(x86)\Docker\Docker\Docker Desktop.exe"
            )
            $startedExe = $false
            foreach ($p in $possiblePaths) {
                if (Test-Path $p) {
                    Write-Host "Starting Docker Desktop: $p" -ForegroundColor Cyan
                    Start-Process -FilePath $p
                    $startedExe = $true
                    break
                }
            }
            if (-not $startedExe) {
                Write-Host "Docker Desktop executable not found; please start Docker Desktop manually." -ForegroundColor Red
            }
        }

        # Wait for Docker to become ready
        $deadline = (Get-Date).AddSeconds($WaitSeconds)
        while ((Get-Date) -lt $deadline) {
            try { docker info > $null 2>&1; if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break } } catch {}
            Start-Sleep -Seconds 2
        }

        if (-not $dockerReady) {
            Write-Host "Docker did not become ready within $WaitSeconds seconds." -ForegroundColor Red
            return $false
        }

        return $true
    }

    # Attempt to ensure Docker is running before running helper script
    $dockerOk = Ensure-DockerReady -WaitSeconds 60
    if (-not $dockerOk) {
        Write-Host "Proceeding may fail because Docker is not available. You can start Docker Desktop manually and re-run this script." -ForegroundColor Yellow
    }
    # Start Docker and the MySQL (db) service via Docker Compose (no migrations)
    
        Write-Host "start-db-and-migrate.ps1 not found; attempting to start Docker and the MySQL (db) service via Docker Compose" -ForegroundColor Yellow

        # Ensure Docker engine is responsive, otherwise try to start Docker Desktop or the com.docker.service
        $dockerReady = $false
        try { docker info > $null 2>&1; if ($LASTEXITCODE -eq 0) { $dockerReady = $true } } catch {}

        if (-not $dockerReady) {
            Write-Host "Docker CLI not responding; attempting to start Docker..." -ForegroundColor Yellow

            # Try starting the Docker Windows service if present
            try {
                $svc = Get-Service -Name com.docker.service -ErrorAction SilentlyContinue
                if ($svc -and $svc.Status -ne 'Running') {
                    Start-Service -Name com.docker.service -ErrorAction Stop
                    Start-Sleep -Seconds 2
                }
            } catch {}

            # If service isn't running, try to start Docker Desktop executable
            $svc = Get-Service -Name com.docker.service -ErrorAction SilentlyContinue
            if (-not ($svc -and $svc.Status -eq 'Running')) {
                $possiblePaths = @(
                    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
                    "$env:ProgramFiles(x86)\Docker\Docker\Docker Desktop.exe"
                )
                $startedExe = $false
                foreach ($p in $possiblePaths) {
                    if (Test-Path $p) {
                        Write-Host "Starting Docker Desktop: $p" -ForegroundColor Cyan
                        Start-Process -FilePath $p
                        $startedExe = $true
                        break
                    }
                }
                if (-not $startedExe) {
                    Write-Host "Docker Desktop executable not found; please start Docker Desktop manually." -ForegroundColor Red
                }
            }

            # Wait for Docker to become ready (seconds configurable via WAIT_DOCKER_SECONDS)
            $waitSeconds = 60
            if ($env:WAIT_DOCKER_SECONDS) { $parsed = 0; if ([int]::TryParse($env:WAIT_DOCKER_SECONDS, [ref]$parsed)) { $waitSeconds = $parsed } }
            $deadline = (Get-Date).AddSeconds($waitSeconds)
            while ((Get-Date) -lt $deadline) {
                try { docker info > $null 2>&1; if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break } } catch {}
                Start-Sleep -Seconds 2
            }

            if (-not $dockerReady) {
                Write-Error "Docker did not become ready within $waitSeconds seconds. Aborting."
                exit 1
            }
        }

        # Start only the DB service
        $composeStarted = $false
        try {
            Write-Host "Running: docker compose up -d db" -ForegroundColor Cyan
            docker compose up -d db
            if ($LASTEXITCODE -eq 0) { $composeStarted = $true }
        } catch {
            Write-Host "'docker compose' failed or not available, trying 'docker-compose' fallback" -ForegroundColor Yellow
        }

        if (-not $composeStarted) {
            try {
                Write-Host "Running: docker-compose up -d db" -ForegroundColor Cyan
                docker-compose up -d db
                if ($LASTEXITCODE -eq 0) { $composeStarted = $true }
            } catch {
                Write-Host "Both 'docker compose' and 'docker-compose' attempts failed." -ForegroundColor Red
            }
        }

        if (-not $composeStarted) {
            Write-Error "Could not start Docker Compose for the DB service. Ensure Docker is installed and the docker-compose.yml exists. Aborting."
            exit 1
        }

        Write-Host "Waiting for DB to become available..." -ForegroundColor Cyan
        # Try full wait (default WAIT_DB_SECONDS in script)
        & node scripts/wait-for-db.js
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Database did not become ready after starting Docker Compose. Aborting (exit $LASTEXITCODE)."
            exit $LASTEXITCODE
        }
} else {
    Write-Host "Database is reachable." -ForegroundColor Green
}

Write-Host "Starting frontend and backend (npm run dev)..." -ForegroundColor Cyan
npm run dev
