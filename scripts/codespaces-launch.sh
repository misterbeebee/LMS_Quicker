#!/usr/bin/env bash
# Interactive launcher for Velm on GitHub Codespaces (desktop-lite / noVNC) or any Linux VM.
# Supports both interactive menu and direct flags (--download, --desktop, --extension, --web).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export DISPLAY="${DISPLAY:-:1}"

run_download() {
  echo ""
  echo "=== One-Time Account Data Downloader (Sanitized by Default) ==="
  pnpm run mock:download
}

run_desktop() {
  echo ""
  echo "=== Building & Launching Velm Electron Desktop App on DISPLAY=${DISPLAY} ==="
  echo "Tip: In GitHub Codespaces, open forwarded port 6080 (noVNC) in your browser to see the window."
  pnpm run build:desktop
  # --no-sandbox is required when running Electron inside Docker/Codespaces containers
  pnpm --filter @velm/desktop exec electron . --no-sandbox
}

run_extension() {
  echo ""
  echo "=== Building & Launching Chromium with Unpacked Velm MV3 Extension on DISPLAY=${DISPLAY} ==="
  echo "Tip: In GitHub Codespaces, open forwarded port 6080 (noVNC) in your browser to see Chromium."
  pnpm run build:extension
  local chrome_bin
  chrome_bin="$(command -v chromium || command -v google-chrome || command -v chromium-browser || true)"
  if [[ -z "$chrome_bin" ]]; then
    echo "Error: Chromium not found on PATH. Install chromium or run inside the Velm devcontainer."
    exit 1
  fi
  local profile_dir="/tmp/velm-chrome-profile"
  mkdir -p "$profile_dir"
  "$chrome_bin" \
    --no-sandbox \
    --disable-dev-shm-usage \
    --user-data-dir="$profile_dir" \
    --load-extension="${ROOT_DIR}/apps/extension/dist" \
    "chrome://extensions"
}

run_web() {
  echo ""
  echo "=== Starting Velm Web Dev Server (Port 3000) ==="
  pnpm run dev:web
}

case "${1:-}" in
  --download)  run_download; exit 0 ;;
  --desktop)   run_desktop; exit 0 ;;
  --extension) run_extension; exit 0 ;;
  --web)       run_web; exit 0 ;;
esac

echo "=============================================="
echo "  Velm Remote Launcher (DISPLAY=${DISPLAY})"
echo "=============================================="
echo "  1) Download sanitized mock account data (velm-mock-store.v1.json)"
echo "  2) Launch Electron Desktop App (in noVNC port 6080)"
echo "  3) Launch Chromium with unpacked MV3 Extension (in noVNC port 6080)"
echo "  4) Start Web Dev Server (port 3000)"
echo "  q) Quit"
echo ""
read -r -p "Choose an option [1-4/q]: " choice

case "$choice" in
  1) run_download ;;
  2) run_desktop ;;
  3) run_extension ;;
  4) run_web ;;
  q|Q) exit 0 ;;
  *) echo "Invalid option: $choice"; exit 1 ;;
esac
