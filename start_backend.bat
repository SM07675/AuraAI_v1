@echo off
setlocal EnableDelayedExpansion

title Aura AI 2.0 -- Backend Server

echo ========================================================
echo               Aura AI 2.0 -- Backend Server
echo ========================================================
echo.

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "VENV_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "!VENV_PYTHON!" (
    echo [ERROR] Virtual environment not found at backend\.venv
    echo Please run run.bat and select [S] Setup, or create the venv first.
    pause
    exit /b 1
)

:: Ensure .env exists in backend
if not exist "%BACKEND_DIR%\.env" (
    if exist "%ROOT_DIR%.env" (
        echo [*] Syncing .env to backend\.env...
        copy "%ROOT_DIR%.env" "%BACKEND_DIR%\.env" >nul
    ) else if exist "%ROOT_DIR%.env.example" (
        echo [WARN] Creating .env from .env.example...
        copy "%ROOT_DIR%.env.example" "%BACKEND_DIR%\.env" >nul
    )
)

cd /d "%BACKEND_DIR%"

echo [*] Applying database migrations...
"!VENV_PYTHON!" -m alembic upgrade head
if errorlevel 1 (
    echo [WARN] Alembic migration warning - fallback to SQLite auto-schema will apply if DB is unavailable.
)

echo.
echo +---------------------------------------------------------+
echo ^|  Aura AI 2.0 Backend is starting...                      ^|
echo ^|                                                         ^|
echo ^|  HTTP API        : http://127.0.0.1:8000                ^|
echo ^|  Swagger Docs    : http://127.0.0.1:8000/docs           ^|
echo ^|  Health Check    : http://127.0.0.1:8000/api/v1/health  ^|
echo ^|  Live Voice WS   : ws://127.0.0.1:8000/api/v1/ws/voice  ^|
echo ^|  Chat WS         : ws://127.0.0.1:8000/api/v1/ws/chat   ^|
echo +---------------------------------------------------------+
echo.
echo Press Ctrl+C to stop the server.
echo.

"!VENV_PYTHON!" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
