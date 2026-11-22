@echo off
cd /d "%~dp0backend"
echo ========================================================
echo   Starting CITIMART Backend on http://127.0.0.1:8000
echo ========================================================
"%~dp0.venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
