# PowerShell Dev Launcher for CITIMART Daily Operations
Set-Location -Path $PSScriptRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "          CITIMART DAILY OPERATIONS - LOCAL DEV LAUNCHER" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$pythonExe = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Error "Virtual environment not found at $pythonExe"
    exit 1
}

Write-Host "`n[1/2] Starting Backend API (FastAPI on http://127.0.0.1:8000)..." -ForegroundColor Green
Start-Process cmd.exe -ArgumentList "/k", "cd /d `"$PSScriptRoot\backend`" && `"$pythonExe`" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "[2/2] Starting Frontend UI (Vite on http://localhost:5173)..." -ForegroundColor Green
Start-Process cmd.exe -ArgumentList "/k", "cd /d `"$PSScriptRoot\frontend`" && call npm.cmd run dev"

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "Both servers launched in separate windows!" -ForegroundColor Yellow
Write-Host "  - Frontend Web App : http://localhost:5173" -ForegroundColor White
Write-Host "  - Backend API Docs : http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "  - Single-Server Mode: http://127.0.0.1:8000" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
