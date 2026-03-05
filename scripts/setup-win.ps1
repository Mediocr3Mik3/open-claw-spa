#Requires -Version 5.0
<#
.SYNOPSIS
  Windows pre-flight setup for openclaw-spa.
  Enables long paths, clears npm cache, installs deps, and rebuilds native addons.

.DESCRIPTION
  This script is idempotent — safe to re-run at any time.
  Run as Administrator for first-time setup (long path enablement).

.EXAMPLE
  npm run setup:win
  # Or directly:
  powershell -ExecutionPolicy Bypass -File scripts/setup-win.ps1
#>

$ErrorActionPreference = "Stop"

function Write-Step { param([string]$msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "    [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$msg) Write-Host "    [FAIL] $msg" -ForegroundColor Red }

# ─── Step 1: Check / Enable LongPathsEnabled ──────────────────────────────

Write-Step "Checking Windows LongPathsEnabled registry key"

$regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
$currentValue = $null
try {
    $currentValue = (Get-ItemProperty -Path $regPath -Name "LongPathsEnabled" -ErrorAction SilentlyContinue).LongPathsEnabled
} catch {}

if ($currentValue -eq 1) {
    Write-Ok "LongPathsEnabled is already set to 1"
} else {
    # Check if we are running elevated
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )

    if ($isAdmin) {
        try {
            Set-ItemProperty -Path $regPath -Name "LongPathsEnabled" -Value 1 -Type DWord
            Write-Ok "LongPathsEnabled set to 1 (long file paths now enabled)"
        } catch {
            Write-Fail "Could not set LongPathsEnabled: $_"
            Write-Warn "You may encounter path-length errors with deep node_modules trees"
        }
    } else {
        Write-Warn "LongPathsEnabled is NOT set and this shell is not elevated."
        Write-Warn "Re-run this script as Administrator to enable long paths, or set it manually:"
        Write-Warn "  reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f"
    }
}

# ─── Step 2: Clear npm cache ──────────────────────────────────────────────

Write-Step "Clearing npm cache (removes corrupt native addon downloads)"

try {
    & npm cache clean --force 2>&1 | Out-Null
    Write-Ok "npm cache cleared"
} catch {
    Write-Warn "npm cache clean failed: $_"
}

# ─── Step 3: Remove node_modules ──────────────────────────────────────────

Write-Step "Removing node_modules (clean slate)"

$nodeModules = Join-Path $PSScriptRoot "..\node_modules"
if (Test-Path $nodeModules) {
    try {
        Remove-Item -Recurse -Force $nodeModules
        Write-Ok "node_modules deleted"
    } catch {
        Write-Fail "Could not delete node_modules: $_"
        Write-Warn "Close any editors or terminals using this folder and retry"
        exit 1
    }
} else {
    Write-Ok "node_modules does not exist (nothing to remove)"
}

# ─── Step 4: npm install ─────────────────────────────────────────────────

Write-Step "Running npm install"

try {
    Push-Location (Join-Path $PSScriptRoot "..")
    & npm install 2>&1 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) { throw "npm install exited with code $LASTEXITCODE" }
    Write-Ok "npm install completed"
} catch {
    Write-Fail "npm install failed: $_"
    exit 1
} finally {
    Pop-Location
}

# ─── Step 5: Rebuild native addons for Electron ─────────────────────────

Write-Step "Rebuilding native addons for Electron (electron-rebuild)"

try {
    Push-Location (Join-Path $PSScriptRoot "..")
    & npm run rebuild 2>&1 | ForEach-Object { Write-Host "    $_" }
    if ($LASTEXITCODE -ne 0) { throw "npm run rebuild exited with code $LASTEXITCODE" }
    Write-Ok "Native addons rebuilt successfully"
} catch {
    Write-Fail "electron-rebuild failed: $_"
    Write-Warn "Try: npx @electron/rebuild"
    exit 1
} finally {
    Pop-Location
}

# ─── Done ────────────────────────────────────────────────────────────────

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Setup complete! You can now run:" -ForegroundColor Green
Write-Host "    npm run electron" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Green
