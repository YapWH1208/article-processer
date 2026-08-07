@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Article Processor - Quick Start

set "SKIP_INSTALL=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--skip-install" (
    set "SKIP_INSTALL=1"
    shift
    goto parse_args
)
if /I "%~1"=="-S" (
    set "SKIP_INSTALL=1"
    shift
    goto parse_args
)
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage

echo [ERROR] Unknown option: %~1
echo.
goto usage_error

:usage
echo Usage: quickstart.bat [--skip-install]
exit /b 0

:usage_error
echo Usage: quickstart.bat [--skip-install]
exit /b 1

:args_done
echo.
echo   ================================================
echo     Article Processor - Quick Start (Windows)
echo   ================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo [*] Checking prerequisites...

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.11 or newer.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 18 or newer.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Please install Node.js with npm.
    pause
    exit /b 1
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 3.11 or newer is required.
    python --version
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo    Python %%v OK
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo    Node   %%v OK
for /f "tokens=*" %%v in ('npm --version 2^>^&1') do echo    npm    %%v OK

echo.
echo [*] Setting up backend...

set "BACKEND_DIR=%SCRIPT_DIR%services\api"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"

if not exist "%VENV_PYTHON%" (
    echo    Creating Python virtual environment...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to create Python virtual environment.
        pause
        exit /b 1
    )
)

if "%SKIP_INSTALL%"=="1" (
    echo    [skip] Skipping pip install (--skip-install)
) else (
    echo    Installing Python dependencies...
    pushd "%BACKEND_DIR%"
    "%VENV_PYTHON%" -m pip install -e ".[dev]" -q
    if errorlevel 1 (
        popd
        echo [ERROR] Failed to install Python dependencies.
        pause
        exit /b 1
    )
    popd
)

if not exist "%BACKEND_DIR%\.env" (
    if exist "%SCRIPT_DIR%.env.example" (
        copy "%SCRIPT_DIR%.env.example" "%BACKEND_DIR%\.env" >nul
        echo    Created services\api\.env from .env.example
    ) else (
        echo [WARN] .env.example not found; skipping backend .env creation.
    )
)

if not exist "%SCRIPT_DIR%data" mkdir "%SCRIPT_DIR%data"

echo    Running database migrations...
pushd "%BACKEND_DIR%"
"%VENV_PYTHON%" -m alembic -c "%BACKEND_DIR%\alembic.ini" upgrade head
if errorlevel 1 (
    popd
    echo [ERROR] Database migrations failed.
    pause
    exit /b 1
)
popd

echo.
echo [*] Setting up frontend...

set "FRONTEND_DIR=%SCRIPT_DIR%apps\web"

if "%SKIP_INSTALL%"=="1" (
    echo    [skip] Skipping npm install (--skip-install)
) else if not exist "%FRONTEND_DIR%\node_modules" (
    echo    Installing npm dependencies...
    call npm --prefix "%FRONTEND_DIR%" install --silent
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
) else (
    echo    Node modules already present
)

if not exist "%FRONTEND_DIR%\.env.local" (
    echo NEXT_PUBLIC_API_BASE_URL=http://localhost:8000> "%FRONTEND_DIR%\.env.local"
    echo    Created apps\web\.env.local
)

echo.
echo   ================================================
echo     Setup complete. Starting servers...
echo.
echo     Backend:  http://localhost:8000
echo     Frontend: http://localhost:3000
echo     Health:   http://localhost:8000/health
echo     Mock AI:  enabled when configured in services\api\.env
echo.
echo     Press Ctrl+C in each server window to stop.
echo   ================================================
echo.

start "Article Processor - Backend" /D "%BACKEND_DIR%" "%ComSpec%" /k ""%VENV_PYTHON%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

start "Article Processor - Frontend" /D "%FRONTEND_DIR%" "%ComSpec%" /k "npm run dev"

echo.
echo    Both servers started in separate windows.
echo    Close this window or the server windows to stop.
echo.

pause
