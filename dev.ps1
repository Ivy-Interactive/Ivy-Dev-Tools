<#
.SYNOPSIS
    Ivy Dev Tools — one-command dev setup.
    Installs deps, builds, launches Chrome with the extension loaded,
    then watches for changes and rebuilds automatically.

.USAGE
    .\dev.ps1
    .\dev.ps1 -ChromePath "C:\Program Files\Google\Chrome\Application\chrome.exe"
    .\dev.ps1 -Url "http://localhost:3000"
#>

param(
    [string]$ChromePath,
    [string]$Url = "about:blank"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# ── Find Chrome ──────────────────────────────────────────────────────
if (-not $ChromePath) {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $ChromePath = $c; break }
    }
}

if (-not $ChromePath -or -not (Test-Path $ChromePath)) {
    Write-Error "Chrome not found. Pass -ChromePath explicitly."
    exit 1
}

Write-Host "[ivy] Chrome: $ChromePath" -ForegroundColor Cyan

# ── Install deps if needed ───────────────────────────────────────────
if (-not (Test-Path "$root\node_modules")) {
    Write-Host "[ivy] Installing dependencies..." -ForegroundColor Yellow
    npm install --prefix $root
}

# ── Initial build ────────────────────────────────────────────────────
Write-Host "[ivy] Building extension..." -ForegroundColor Yellow
npx --prefix $root vite build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

$distPath = Resolve-Path "$root\dist"
Write-Host "[ivy] Extension built at: $distPath" -ForegroundColor Green

# ── Launch Chrome with extension loaded ──────────────────────────────
$userDataDir = "$root\.chrome-dev-profile"

$chromeArgs = @(
    "--auto-open-devtools-for-tabs",
    "--load-extension=$distPath",
    "--user-data-dir=$userDataDir",
    "--no-first-run",
    "--no-default-browser-check",
    $Url
)

Write-Host "[ivy] Launching Chrome (dev profile)..." -ForegroundColor Cyan
$chromeProc = Start-Process -FilePath $ChromePath -ArgumentList $chromeArgs -PassThru

# ── Watch mode ───────────────────────────────────────────────────────
Write-Host "[ivy] Starting watch mode (Ctrl+C to stop)..." -ForegroundColor Yellow
Write-Host "[ivy] Changes rebuild automatically. Reload the DevTools panel to pick them up." -ForegroundColor DarkGray

try {
    npx --prefix $root vite build --watch
}
finally {
    # Clean up Chrome on exit
    if (-not $chromeProc.HasExited) {
        Write-Host "`n[ivy] Stopping Chrome..." -ForegroundColor Yellow
        Stop-Process -Id $chromeProc.Id -ErrorAction SilentlyContinue
    }
    Write-Host "[ivy] Done." -ForegroundColor Green
}
