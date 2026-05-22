@echo off
setlocal enabledelayedexpansion
title Article Processor — Quick Start

echo.
echo   ================================================
echo     Article Processor — Quick Start (Windows)
echo   ================================================
echo.

REM ── Get script directory ─────────────────────────────────────────────
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM ── Check prerequisites ──────────────────────────────────────────────
echo [*] Checking prerequisites...

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found — please install Python 3.11+
    pause
    exit /b 1
)

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found — please install Node 18+
    pause
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm not found
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo    Python %%v ✓
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo    Node   %%v ✓

REM ── Backend setup ────────────────────────────────────────────────────
echo.
echo [*] Setting up backend...

set "BACKEND_DIR=%SCRIPT_DIR%services\api"
set "VENV_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "%BACKEND_DIR%\.venv" (
    echo    Creating Python virtual environment...
    python -m venv "%BACKEND_DIR%\.venv"
)

echo    Installing Python dependencies...
"%BACKEND_DIR%\.venv\Scripts\pip.exe" install -e "%BACKEND_DIR%[dev]" -q

REM Create .env from example if missing
if not exist "%BACKEND_DIR%\.env" (
    copy "%SCRIPT_DIR%.env.example" "%BACKEND_DIR%\.env" >nul
    echo    Created services\api\.env from .env.example
)

REM Ensure data directory exists
if not exist "%SCRIPT_DIR%data" mkdir "%SCRIPT_DIR%data"

echo    Running database migrations...
cd /d "%BACKEND_DIR%"
"%BACKEND_DIR%\.venv\Scripts\alembic.exe" -c "%BACKEND_DIR%\alembic.ini" upgrade head
cd /d "%SCRIPT_DIR%"

REM ── Frontend setup ───────────────────────────────────────────────────
echo.
echo [*] Setting up frontend...

set "FRONTEND_DIR=%SCRIPT_DIR%apps\web"

if not exist "%FRONTEND_DIR%\node_modules" (
    echo    Installing npm dependencies...
    call npm --prefix "%FRONTEND_DIR%" install --silent
)

REM Create .env.local from example if missing
if not exist "%FRONTEND_DIR%\.env.local" (
    echo NEXT_PUBLIC_API_BASE_URL=http://localhost:8000> "%FRONTEND_DIR%\.env.local"
    echo    Created apps\web\.env.local
)

REM ── Start servers ────────────────────────────────────────────────────
echo.
echo   ================================================
echo     Setup complete! Starting servers...
echo.
echo     Backend:  http://localhost:8000
echo     Frontend: http://localhost:3000
echo     Health:   http://localhost:8000/health
echo     Mock AI:  enabled (no API key required)
echo.
echo     Press Ctrl+C in each window to stop.
echo   ================================================
echo.

REM Start backend in a new window
start "Article Processor — Backend" cmd /c ^
    "cd /d "%BACKEND_DIR%" && ^
     "%BACKEND_DIR%\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload && ^
     pause"

REM Brief wait
timeout /t 3 /nobreak >nul

REM Start frontend in a new window
start "Article Processor — Frontend" cmd /c ^
    "cd /d "%FRONTEND_DIR%" && ^
     npm run dev && ^
     pause"

echo.
echo    Both servers started in separate windows.
echo    Close this window or the server windows to stop.
echo.

pause
