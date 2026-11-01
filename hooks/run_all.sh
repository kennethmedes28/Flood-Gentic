#!/usr/bin/env bash
#
# Run the whole app for local work: the FastAPI backend and the Next.js frontend, side by side.
# This is a short launcher; the work is done by scripts/run_dev.py (see that file for what it checks and prints).
#
#   hooks/run_all.sh                      backend on :8000, frontend on :3000
#   hooks/run_all.sh --memory             keep chats in memory instead of Postgres
#   hooks/run_all.sh --no-reload          do not restart the backend when its files change
#   hooks/run_all.sh --backend-port 8001 --frontend-port 3001
#   hooks/run_all.sh --help
#
# Every option is passed on to run_dev.py unchanged. Ctrl+C stops both programs.

# This file lives in hooks/, so the repository root is one level up.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[run_all] python3 is not installed or not on your PATH."
  exit 1
fi

# exec replaces this shell with Python, so Ctrl+C goes straight to run_dev.py, which stops both programs.
exec python3 "$ROOT/scripts/run_dev.py" "$@"
