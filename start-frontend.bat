@echo off
cd /d "%~dp0frontend"
echo ========================================================
echo   Starting CITIMART Frontend on http://localhost:5173
echo ========================================================
call npm.cmd run dev
pause
