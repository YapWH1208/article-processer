#!/usr/bin/env bash
set -euo pipefail

# ── Article Processor — Quick Start Script (macOS / Linux) ──────────────
# Usage: ./start.sh [--skip-install]

SKIP_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --skip-install|-S) SKIP_INSTALL=true ;;
    --help|-h) echo "Usage: ./start.sh [--skip-install]"; exit 0 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   📄 Article Processor — Quick Start         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Check prerequisites ─────────────────────────────────────────────────

check_cmd() {
    if ! command -v "$1" &>/dev/null; then
        echo -e "${RED}❌ Missing: $1 — please install it first${NC}"
        exit 1
    fi
}

echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
check_cmd python3
check_cmd node
check_cmd npm

PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo -e "   Python ${PY_VERSION} ✓"
echo -e "   Node   $(node --version) ✓"
echo -e "   npm    $(npm --version) ✓"

# ── Backend setup ────────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}📦 Setting up backend...${NC}"

BACKEND_DIR="$SCRIPT_DIR/services/api"

if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo -e "   Creating Python virtual environment..."
    python3 -m venv "$BACKEND_DIR/.venv"
fi

source "$BACKEND_DIR/.venv/bin/activate"

if [ "$SKIP_INSTALL" = false ]; then
    echo -e "   Installing Python dependencies..."
    pip install -e "$BACKEND_DIR/.[dev]" -q
else
    echo -e "   ⏭ Skipping pip install (--skip-install)"
fi

# Create .env from example if missing
if [ ! -f "$BACKEND_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env.example" "$BACKEND_DIR/.env"
    echo -e "   Created services/api/.env from .env.example"
fi

# Ensure data directory exists
mkdir -p "$SCRIPT_DIR/data"

echo -e "   Running database migrations..."
cd "$BACKEND_DIR"
alembic upgrade head 2>/dev/null || alembic -c "$BACKEND_DIR/alembic.ini" upgrade head
cd "$SCRIPT_DIR"

# ── Frontend setup ───────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}📦 Setting up frontend...${NC}"

FRONTEND_DIR="$SCRIPT_DIR/apps/web"

if [ "$SKIP_INSTALL" = false ]; then
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        echo -e "   Installing npm dependencies..."
        npm --prefix "$FRONTEND_DIR" install --silent
    else
        echo -e "   Node modules already present"
    fi
else
    echo -e "   ⏭ Skipping npm install (--skip-install)"
fi

# Create .env.local from example if missing
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > "$FRONTEND_DIR/.env.local"
    echo -e "   Created apps/web/.env.local"
fi

# ── Start servers ────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}✅ Setup complete! Starting servers...${NC}"
echo ""
echo -e "   Backend:  ${CYAN}http://localhost:8000${NC}"
echo -e "   Frontend: ${CYAN}http://localhost:3000${NC}"
echo -e "   Health:   ${CYAN}http://localhost:8000/health${NC}"
echo -e "   Mock AI:  ${GREEN}enabled${NC} (no API key required)"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both servers${NC}"
echo ""

# Trap to kill both processes on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

# Start backend
cd "$BACKEND_DIR"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Wait briefly for backend to start
sleep 2

# Start frontend
npm --prefix "$FRONTEND_DIR" run dev &
FRONTEND_PID=$!

# Wait for either to exit
wait -n $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
cleanup
