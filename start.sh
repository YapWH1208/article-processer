#!/usr/bin/env bash
set -euo pipefail

# Article Processor - Quick Start Script (macOS / Linux)
# Usage: ./start.sh [--skip-install]

SKIP_INSTALL=false

for arg in "$@"; do
  case "$arg" in
    --skip-install|-S)
      SKIP_INSTALL=true
      ;;
    --help|-h)
      echo "Usage: ./start.sh [--skip-install]"
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown option: $arg"
      echo "Usage: ./start.sh [--skip-install]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo
echo "================================================"
echo "  Article Processor - Quick Start"
echo "================================================"
echo

check_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Missing: $1. Please install it first."
    exit 1
  fi
}

echo "[*] Checking prerequisites..."
check_cmd python3
check_cmd node
check_cmd npm

python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' || {
  echo "[ERROR] Python 3.11 or newer is required."
  python3 --version
  exit 1
}

PY_VERSION="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
echo "   Python ${PY_VERSION} OK"
echo "   Node   $(node --version) OK"
echo "   npm    $(npm --version) OK"

echo
echo "[*] Setting up backend..."

BACKEND_DIR="$SCRIPT_DIR/services/api"
VENV_DIR="$BACKEND_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"

if [ ! -x "$VENV_PYTHON" ]; then
  echo "   Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

if [ "$SKIP_INSTALL" = false ]; then
  echo "   Installing Python dependencies..."
  (
    cd "$BACKEND_DIR"
    "$VENV_PYTHON" -m pip install -e ".[dev]" -q
  )
else
  echo "   [skip] Skipping pip install (--skip-install)"
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
  if [ -f "$SCRIPT_DIR/.env.example" ]; then
    cp "$SCRIPT_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "   Created services/api/.env from .env.example"
  else
    echo "[WARN] .env.example not found; skipping backend .env creation."
  fi
fi

mkdir -p "$SCRIPT_DIR/data"

echo "   Running database migrations..."
(
  cd "$BACKEND_DIR"
  "$VENV_PYTHON" -m alembic -c "$BACKEND_DIR/alembic.ini" upgrade head
)

echo
echo "[*] Setting up frontend..."

FRONTEND_DIR="$SCRIPT_DIR/apps/web"

if [ "$SKIP_INSTALL" = false ]; then
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "   Installing npm dependencies..."
    npm --prefix "$FRONTEND_DIR" install --silent
  else
    echo "   Node modules already present"
  fi
else
  echo "   [skip] Skipping npm install (--skip-install)"
fi

if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > "$FRONTEND_DIR/.env.local"
  echo "   Created apps/web/.env.local"
fi

echo
echo "Setup complete. Starting servers..."
echo
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:3000"
echo "   Health:   http://localhost:8000/health"
echo "   Mock AI:  enabled when configured in services/api/.env"
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

(
  cd "$BACKEND_DIR"
  "$VENV_PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) &
BACKEND_PID=$!

sleep 2

npm --prefix "$FRONTEND_DIR" run dev &
FRONTEND_PID=$!

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
