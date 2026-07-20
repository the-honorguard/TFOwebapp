[CmdletBinding()]
param(
    [string]$HostName = 'tour.o2switch.net',

    [string]$CpanelUser = 'hazo1679',

    [string]$ApplicationPath = '/home/hazo1679/tfo.hazo1679.odns.fr',

    [string]$NodeActivatePath = '/home/hazo1679/nodevenv/tfo.hazo1679.odns.fr/20/bin/activate',

    [string]$IdentityFile,
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
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$ArchiveName = "tfo-release-$Timestamp.tar.gz"
$LocalArchive = Join-Path ([System.IO.Path]::GetTempPath()) $ArchiveName
$RemoteArchive = "/home/$CpanelUser/$ArchiveName"
$Remote = "$CpanelUser@$HostName"

$SshArguments = @()
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

    Write-Host "Uploading release to $HostName..."
    & scp @SshArguments $LocalArchive "${Remote}:$RemoteArchive"
    Assert-LastExitCode 'Release upload'

    $RemoteScript = @"
set -e
APP_PATH='$ApplicationPath'
RELEASE='$RemoteArchive'
mkdir -p "`$APP_PATH" "`$APP_PATH/uploads" "`$APP_PATH/logs" "`$APP_PATH/tmp"
tar -xzf "`$RELEASE" -C "`$APP_PATH"
cd "`$APP_PATH"
. '$NodeActivatePath'
npm install --omit=dev
touch tmp/restart.txt
rm -f "`$RELEASE"
echo 'Deployment completed successfully.'
"@
    $EncodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($RemoteScript))
    $RemoteCommand = "echo '$EncodedScript' | base64 -d | bash"

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
}
