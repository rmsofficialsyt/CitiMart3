@echo off
cd /d "%~dp0backend"
echo ========================================================
echo   CITIMART Single-Server Mode (App + API on Port 8000)
echo   Open in browser: http://127.0.0.1:8000
echo ========================================================
"%~dp0.venv\Scripts\python.exe" app.py
pause
