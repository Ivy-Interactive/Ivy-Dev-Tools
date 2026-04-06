# Register "rider-open" protocol handler for opening files in JetBrains Rider.
# Run this once as Administrator:  powershell -ExecutionPolicy Bypass -File register-rider-protocol.ps1

$ErrorActionPreference = "Stop"

$riderExe = "C:\Program Files\JetBrains\JetBrains Rider 2025.3.3\bin\rider64.exe"
if (-not (Test-Path $riderExe)) {
    # Try to find Rider automatically
    $found = Get-ChildItem "C:\Program Files\JetBrains" -Filter "rider64.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $riderExe = $found.FullName }
    else { Write-Error "Could not find rider64.exe. Update the path in this script."; exit 1 }
}

# Create the launcher script next to this file
$launcherPath = Join-Path $PSScriptRoot "rider-open.cmd"
@"
@echo off
setlocal
set URL=%1
set URL=%URL:rider-open://=%
set URL=%URL:/=\%
rem Strip trailing slash if present
if "%URL:~-1%"=="\" set URL=%URL:~0,-1%
rem URL is now file:line or just file
"$riderExe" --line %URL:*:=% "%URL::=" & rem %"
endlocal
"@ | Out-File -FilePath $launcherPath -Encoding ASCII

# Actually write a proper launcher that parses file:line
@"
@echo off
setlocal EnableDelayedExpansion
set "RAW=%~1"
set "RAW=!RAW:rider-open://=!"
rem Decode common URL encodings
set "RAW=!RAW:%%20= !"
set "RAW=!RAW:%%3A=:!"
rem Remove trailing slash
if "!RAW:~-1!"=="/" set "RAW=!RAW:~0,-1!"
rem Split on last colon (line number)
for /f "tokens=1* delims=?" %%a in ("!RAW!") do set "FILEPATH=%%a" & set "PARAMS=%%b"
rem Extract line from query params or from path:line format
set "LINE="
if defined PARAMS (
    for /f "tokens=1,2 delims=&" %%x in ("!PARAMS!") do (
        for /f "tokens=1,2 delims==" %%m in ("%%x") do (
            if "%%m"=="line" set "LINE=%%n"
        )
    )
)
if defined LINE (
    "$riderExe" --line !LINE! "!FILEPATH!"
) else (
    "$riderExe" "!FILEPATH!"
)
"@ | Out-File -FilePath $launcherPath -Encoding ASCII

$launcherPath = (Resolve-Path $launcherPath).Path

# Register protocol handler in registry
$regPath = "HKCU:\Software\Classes\rider-open"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(Default)" -Value "URL:Rider Open Protocol"
Set-ItemProperty -Path $regPath -Name "URL Protocol" -Value ""

New-Item -Path "$regPath\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$regPath\shell\open\command" -Name "(Default)" -Value "`"$launcherPath`" `"%1`""

Write-Host "Registered rider-open:// protocol handler successfully!" -ForegroundColor Green
Write-Host "Launcher: $launcherPath"
Write-Host "Rider: $riderExe"
Write-Host ""
Write-Host "Test it by opening in a browser: rider-open://D:/Repos/_Ivy/test.cs?line=1"
