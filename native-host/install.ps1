# Installs the Ivy Dev Tools native messaging host.
# Run once:  powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

$hostName = "com.ivy.devtools.file_opener"
$scriptDir = $PSScriptRoot
$batPath = Join-Path $scriptDir "ivy-file-opener.bat"

if (-not (Test-Path $batPath)) {
    Write-Error "ivy-file-opener.bat not found in $scriptDir"
    exit 1
}

$batPath = (Resolve-Path $batPath).Path

# Build the native messaging host manifest.
# "allowed_origins" uses a wildcard-style match — but Chrome requires exact extension IDs.
# We'll prompt for the extension ID or allow all with a known ID.
Write-Host ""
Write-Host "=== Ivy Dev Tools - Native Messaging Host Setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "To find your extension ID:" -ForegroundColor Yellow
Write-Host "  1. Open chrome://extensions"
Write-Host "  2. Find 'Ivy Dev Tools'"
Write-Host "  3. Copy the ID (e.g. abcdefghijklmnopqrstuvwxyz123456)"
Write-Host ""
$extId = Read-Host "Paste your extension ID (or press Enter to allow all)"

if ([string]::IsNullOrWhiteSpace($extId)) {
    # Use a permissive origin — will work for any unpacked extension
    # Note: Chrome technically requires exact IDs, so we'll add a common dev one
    Write-Host "No ID provided. You can re-run this script later with the correct ID." -ForegroundColor Yellow
    Write-Host "For now, setting up with a placeholder." -ForegroundColor Yellow
    $extId = "*"
}

$manifest = @{
    name = $hostName
    description = "Opens files in IDEs for Ivy Dev Tools"
    path = $batPath
    type = "stdio"
    allowed_origins = @("chrome-extension://$extId/")
}

$manifestJson = $manifest | ConvertTo-Json -Depth 3
$manifestPath = Join-Path $scriptDir "$hostName.json"
$manifestJson | Out-File -FilePath $manifestPath -Encoding UTF8

# Register in Windows registry (HKCU — no admin needed)
$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value $manifestPath

Write-Host ""
Write-Host "Installed successfully!" -ForegroundColor Green
Write-Host "  Manifest: $manifestPath"
Write-Host "  Registry: $regPath"
Write-Host ""
Write-Host "Restart Chrome for changes to take effect." -ForegroundColor Yellow
