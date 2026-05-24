#!/usr/bin/env bash
set -euo pipefail

# Article Processor - Run Services (macOS / Linux)
# Usage: ./run.sh

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      echo "Usage: ./run.sh"
      echo
      echo "Starts the backend and frontend services without setup checks."
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown option: $arg"
      echo "Usage: ./run.sh"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/services/api"
FRONTEND_DIR="$SCRIPT_DIR/apps/web"
VENV_PYTHON="$BACKEND_DIR/.venv/bin/python"

echo
echo "================================================"
echo "  Article Processor - Run Services"
echo "================================================"
echo
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:3000"
echo "   Health:   http://localhost:8000/health"
echo
echo "This script only starts services."
echo "Run ./start.sh first if dependencies are not installed."
echo
echo "Press Ctrl+C to stop both servers"
echo

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  trap - EXIT INT TERM
  echo
  echo "Shutting down..."
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  echo "Done."
}

trap cleanup EXIT INT TERM

echo "[*] Starting backend..."
(
  cd "$BACKEND_DIR"
  "$VENV_PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) &
BACKEND_PID=$!

sleep 2

echo "[*] Starting frontend..."
npm --prefix "$FRONTEND_DIR" run dev &
FRONTEND_PID=$!

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
