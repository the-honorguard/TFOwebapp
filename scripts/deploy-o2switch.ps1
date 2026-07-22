[CmdletBinding()]
param(
    [string]$HostName = 'tour.o2switch.net',

    [string]$CpanelUser = 'hazo1679',

    [string]$ApplicationPath = '/home/hazo1679/tfo.hazo1679.odns.fr',

    [string]$NodeActivatePath = '/home/hazo1679/nodevenv/tfo.hazo1679.odns.fr/20/bin/activate',

    [string]$IdentityFile,
    [string]$EnvFile,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE."
    }
}

function Assert-SafeRemoteValue([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Contains("'") -or $Value.Contains("`n") -or $Value.Contains("`r")) {
        throw "$Name contains an unsupported value. Single quotes and newlines are not allowed."
    }
}

Assert-SafeRemoteValue 'HostName' $HostName
Assert-SafeRemoteValue 'CpanelUser' $CpanelUser
Assert-SafeRemoteValue 'ApplicationPath' $ApplicationPath
Assert-SafeRemoteValue 'NodeActivatePath' $NodeActivatePath

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LocalEnvFile = if ([string]::IsNullOrWhiteSpace($EnvFile)) { $null } else { (Resolve-Path -LiteralPath $EnvFile).Path }
if ($LocalEnvFile -and -not (Test-Path -LiteralPath $LocalEnvFile -PathType Leaf)) {
    throw "Environment file not found: $LocalEnvFile"
}

$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ArchiveName = "tfo-release-$Timestamp.tar.gz"
$LocalArchive = Join-Path ([System.IO.Path]::GetTempPath()) $ArchiveName
$EnvUploadName = if ($LocalEnvFile) { "tfo-env-$Timestamp" } else { '' }
$LocalEnvUpload = if ($LocalEnvFile) { Join-Path ([System.IO.Path]::GetTempPath()) $EnvUploadName } else { $null }
$RemoteArchive = "/home/$CpanelUser/$ArchiveName"
$RemoteEnvUpload = if ($LocalEnvFile) { "/home/$CpanelUser/$EnvUploadName" } else { '' }
$Remote = "$CpanelUser@$HostName"

$SshArguments = @()
if (-not $IdentityFile) {
    $defaultIdentity = Join-Path $env:USERPROFILE '.ssh\id_ed25519'
    if (Test-Path -LiteralPath $defaultIdentity -PathType Leaf) {
        $IdentityFile = $defaultIdentity
    }
}
if ($IdentityFile) {
    $resolvedIdentity = (Resolve-Path -LiteralPath $IdentityFile).Path
    $SshArguments += @('-i', $resolvedIdentity)
}

Push-Location $ProjectRoot
try {
    if (-not $SkipTests) {
        Write-Host 'Running tests...'
        & npm.cmd test
        Assert-LastExitCode 'Tests'
    }

    Write-Host 'Building production frontend...'
    & npm.cmd run build
    Assert-LastExitCode 'Production build'

    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'dist\index.html'))) {
        throw 'Production build did not create dist/index.html.'
    }

    Write-Host 'Creating release archive...'
    & tar.exe -czf $LocalArchive `
        --exclude=.git `
        --exclude=.env `
        --exclude=node_modules `
        --exclude=uploads `
        --exclude=logs `
        --exclude='*.log' `
        .
    Assert-LastExitCode 'Release packaging'

    $UploadFiles = @($LocalArchive)
    if ($LocalEnvFile) {
        Copy-Item -LiteralPath $LocalEnvFile -Destination $LocalEnvUpload -Force
        $UploadFiles += $LocalEnvUpload
        Write-Host "Uploading release and explicitly supplied environment configuration to $HostName..."
    } else {
        Write-Host "Uploading release to $HostName (preserving production .env)..."
    }
    & scp @SshArguments @UploadFiles "${Remote}:/home/$CpanelUser/"
    Assert-LastExitCode 'Release and environment upload'

    $RemoteScript = @"
set -Eeo pipefail
APP_PATH='$ApplicationPath'
RELEASE='$RemoteArchive'
ENV_SOURCE='$RemoteEnvUpload'
cleanup() { rm -f "`$RELEASE"; if [ -n "`$ENV_SOURCE" ]; then rm -f "`$ENV_SOURCE"; fi; }
trap cleanup EXIT
mkdir -p "`$APP_PATH" "`$APP_PATH/uploads" "`$APP_PATH/logs" "`$APP_PATH/tmp"
if [ -n "`$ENV_SOURCE" ]; then mv -f "`$ENV_SOURCE" "`$APP_PATH/.env"; fi
test -f "`$APP_PATH/.env" || { echo 'Production .env is missing; pass -EnvFile explicitly on first deployment.' >&2; exit 1; }
chmod 600 "`$APP_PATH/.env"
tar -xzf "`$RELEASE" -C "`$APP_PATH"
cd "`$APP_PATH"
. '$NodeActivatePath'
npm install --omit=dev
touch tmp/restart.txt
echo 'Deployment completed successfully.'
"@
    # PowerShell here-strings use CRLF on Windows. Normalize them before sending
    # the script to Bash, where a trailing CR would become part of each argument.
    $RemoteScript = $RemoteScript.Replace("`r`n", "`n").Replace("`r", "`n")
    $EncodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($RemoteScript))
    $RemoteCommand = "echo '$EncodedScript' | base64 -d | bash -se"

    Write-Host 'Installing production dependencies and restarting Passenger...'
    & ssh @SshArguments $Remote $RemoteCommand
    Assert-LastExitCode 'Remote deployment'

    Write-Host "Deployment $Timestamp completed." -ForegroundColor Green
}
finally {
    Pop-Location
    if (Test-Path -LiteralPath $LocalArchive) {
        Remove-Item -LiteralPath $LocalArchive -Force
    }
    if ($LocalEnvUpload -and (Test-Path -LiteralPath $LocalEnvUpload)) {
        Remove-Item -LiteralPath $LocalEnvUpload -Force
    }
}
