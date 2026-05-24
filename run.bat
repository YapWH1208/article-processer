@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Article Processor - Run Services

if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage
if not "%~1"=="" (
    echo [ERROR] Unknown option: %~1
    echo.
    goto usage_error
)

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%services\api"
set "FRONTEND_DIR=%SCRIPT_DIR%apps\web"
set "VENV_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"

echo.
echo   ================================================
echo     Article Processor - Run Services
echo   ================================================
echo.
echo     Backend:  http://localhost:8000
echo     Frontend: http://localhost:3000
echo     Health:   http://localhost:8000/health
echo.
echo     This script only starts services.
echo     Run start.bat first if dependencies are not installed.
echo.

echo [*] Starting backend...
start "Article Processor - Backend" /D "%BACKEND_DIR%" "%ComSpec%" /k ""%VENV_PYTHON%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

echo [*] Starting frontend...
start "Article Processor - Frontend" /D "%FRONTEND_DIR%" "%ComSpec%" /k "npm run dev"

echo.
echo    Services started in separate windows.
echo    Press Ctrl+C in each server window to stop.
echo.
exit /b 0

:usage
echo Usage: run.bat
echo.
echo Starts the backend and frontend services without setup checks.
exit /b 0

:usage_error
echo Usage: run.bat
exit /b 1
