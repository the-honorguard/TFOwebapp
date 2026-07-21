[CmdletBinding()]
param(
    [string]$HostName = 'tour.o2switch.net',
    [string]$CpanelUser = 'hazo1679',
    [string]$IdentityFile = (Join-Path $env:USERPROFILE '.ssh\id_ed25519')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$resolvedIdentity = (Resolve-Path -LiteralPath $IdentityFile).Path
$publicKeyFile = "$resolvedIdentity.pub"
if (-not (Test-Path -LiteralPath $publicKeyFile -PathType Leaf)) {
    throw "Public key not found: $publicKeyFile"
}

$publicKey = (Get-Content -LiteralPath $publicKeyFile -Raw).Trim()
if ($publicKey -notmatch '^ssh-(ed25519|rsa)\s+') {
    throw "Unsupported public key format in $publicKeyFile"
}

$encodedKey = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($publicKey))
$remoteScript = @"
set -e
umask 077
mkdir -p "`$HOME/.ssh"
touch "`$HOME/.ssh/authorized_keys"
PUBLIC_KEY=`$(printf '%s' '$encodedKey' | base64 -d)
grep -qxF "`$PUBLIC_KEY" "`$HOME/.ssh/authorized_keys" || printf '%s\n' "`$PUBLIC_KEY" >> "`$HOME/.ssh/authorized_keys"
chmod 700 "`$HOME/.ssh"
chmod 600 "`$HOME/.ssh/authorized_keys"
"@
$remoteScript = $remoteScript.Replace("`r`n", "`n").Replace("`r", "`n")
$encodedScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
$remote = "$CpanelUser@$HostName"

Write-Host "Installing SSH key on $HostName (your password is required once)..."
& ssh $remote "echo '$encodedScript' | base64 -d | bash -se"
if ($LASTEXITCODE -ne 0) {
    throw "SSH key installation failed with exit code $LASTEXITCODE."
}

Write-Host 'SSH key installed. Future deployments will use it automatically.' -ForegroundColor Green
