#!/usr/bin/env bash
#
# Unix (macOS / Linux) setup for openclaw-spa.
# Installs dependencies and rebuilds native addons for Electron.
# Idempotent — safe to re-run at any time.
#
# Usage:
#   npm run setup:unix
#   # Or directly:
#   bash scripts/setup-unix.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

step()  { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()    { printf '    \033[32m[OK]\033[0m %s\n' "$1"; }
warn()  { printf '    \033[33m[WARN]\033[0m %s\n' "$1"; }
fail()  { printf '    \033[31m[FAIL]\033[0m %s\n' "$1"; }

cd "$PROJECT_DIR"

# ─── Step 1: npm install ─────────────────────────────────────────────────

step "Running npm install"

if npm install; then
    ok "npm install completed"
else
    fail "npm install failed"
    exit 1
fi

# ─── Step 2: Rebuild native addons for Electron ─────────────────────────

step "Rebuilding native addons for Electron (electron-rebuild)"

if npm run rebuild; then
    ok "Native addons rebuilt successfully"
else
    fail "electron-rebuild failed"
    warn "Try: npx @electron/rebuild"
    exit 1
fi

# ─── Done ────────────────────────────────────────────────────────────────

printf '\n\033[32m========================================\033[0m\n'
printf '\033[32m  Setup complete! You can now run:\033[0m\n'
printf '    npm run electron\n'
printf '\033[32m========================================\033[0m\n\n'
