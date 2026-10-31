#!/usr/bin/env bash
# Re-HUB for ATK: install (first run only) and open the app in your browser. Run with: ./start.sh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then run ./start.sh again."
  exit 1
fi

if [ ! -x node_modules/.bin/vite ]; then
  echo "Installing Re-HUB. This happens only the first time and takes about a minute..."
  npm ci --no-audit --no-fund --loglevel=error
fi

echo
echo "Starting Re-HUB. Your browser opens automatically. Press Ctrl+C here to stop."
echo
npm run dev -- --open
