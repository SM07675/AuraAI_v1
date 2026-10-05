# Aura AI 2.0 — One-Command Full Stack Launcher (PowerShell)
Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "   AURA AI 2.0 -- Starting Full Stack (Local Dev)   " -ForegroundColor Cyan
Write-Host "======================================================`n" -ForegroundColor Cyan

$rootDir = $PSScriptRoot
$backendDir = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"
$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"

# 1. Launch Frontend Vite server in a separate window
Write-Host "[*] Launching Frontend on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; npm run dev"

# 2. Launch Backend FastAPI server in the current window
Write-Host "[*] Starting Backend on http://localhost:8000 ...`n" -ForegroundColor Green
Set-Location $backendDir
& $pythonExe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
