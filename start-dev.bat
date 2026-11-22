@echo off
setlocal enabledelayedexpansion
title CITIMART Daily Operations Launcher

echo ======================================================================
echo           CITIMART DAILY OPERATIONS - LOCAL DEV LAUNCHER
echo ======================================================================
echo.

cd /d "%~dp0"

set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"

if not exist "!PYTHON_EXE!" (
    echo [ERROR] Virtual environment not found at .venv\Scripts\python.exe!
    pause
    exit /b 1
)

echo [1/2] Starting Backend API (FastAPI on http://127.0.0.1:8000)...
start "CITIMART Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && "!PYTHON_EXE!" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Starting Frontend UI (Vite on http://localhost:5173)...
start "CITIMART Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && call npm.cmd run dev"

echo.
echo ======================================================================
echo   Both servers launched!
echo.
echo   - Frontend Web App : http://localhost:5173
echo   - Backend API Docs : http://127.0.0.1:8000/docs
echo   - Single-Server Mode: http://127.0.0.1:8000
echo.
echo   Account credentials:
echo   - See backend/CREDENTIALS.txt or backend/.env
echo   - Account selection available on the Login page
echo ======================================================================
echo.
echo (You can close this window. Backend and Frontend will keep running in their own windows.)
timeout /t 5
