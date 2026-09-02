@echo off
setlocal EnableDelayedExpansion
title Aura AI 2.0 — Dev Launcher

echo.
echo  ======================================================
echo     AURA AI 2.0 -- Starting Full Stack (Local Dev)
echo  ======================================================
echo.

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "VENV_DIR=%BACKEND_DIR%\.venv"

:: Check virtual environment
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo  [!] Backend virtual environment not found at %VENV_DIR%
    echo      Running automatic setup...
    call "%ROOT_DIR%run.bat" setup
)

:: 1. Start Frontend in a new window
echo  [*] Starting Frontend (Vite) on http://localhost:5173 ...
start "Aura AI — Frontend (Vite)" cmd /k "cd /d %FRONTEND_DIR% && npm run dev"

:: 2. Start Backend in current window
echo  [*] Starting Backend (FastAPI) on http://localhost:8000 ...
call "%VENV_DIR%\Scripts\activate.bat"
cd /d "%BACKEND_DIR%"

set "POSTGRES_HOST=localhost"
set "REDIS_HOST=localhost"

echo.
echo  +----------------------------------------------------+
echo  ^|  Frontend : http://localhost:5173                 ^|
echo  ^|  Backend  : http://localhost:8000                 ^|
echo  ^|  Swagger  : http://localhost:8000/docs            ^|
echo  +----------------------------------------------------+
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
