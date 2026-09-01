@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  Aura AI 2.0 — Management Script
::  Usage: run.bat [command]
::  Commands: start | stop | restart | logs | status | test
::            shell | migrate | clean | setup | dev | build
:: ============================================================

set "COMPOSE_FILE=%~dp0docker-compose.yml"
set "BACKEND_DIR=%~dp0backend"
set "ENV_FILE=%~dp0.env"
set "VENV_DIR=%~dp0backend\.venv"
set "DOCKER_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"

:: Parse command
set "CMD=%~1"
if "%CMD%"=="" set "CMD=menu"

if /i "%CMD%"=="start"   goto :cmd_start
if /i "%CMD%"=="stop"    goto :cmd_stop
if /i "%CMD%"=="restart" goto :cmd_restart
if /i "%CMD%"=="logs"    goto :cmd_logs
if /i "%CMD%"=="status"  goto :cmd_status
if /i "%CMD%"=="test"    goto :cmd_test
if /i "%CMD%"=="shell"   goto :cmd_shell
if /i "%CMD%"=="migrate" goto :cmd_migrate
if /i "%CMD%"=="clean"   goto :cmd_clean
if /i "%CMD%"=="build"   goto :cmd_build
if /i "%CMD%"=="setup"   goto :cmd_setup
if /i "%CMD%"=="dev"     goto :cmd_dev
if /i "%CMD%"=="menu"    goto :show_menu

echo [ERROR] Unknown command: %CMD%
goto :show_help

:: ============================================================
::  MENU
:: ============================================================
:show_menu
cls
echo.
echo  +------------------------------------------+
echo  ^|       AURA AI 2.0  --  Manager           ^|
echo  +------------------------------------------+
echo.
echo   --- Local (no Docker required) ---
echo   [S] Setup          -- Create venv + install dependencies
echo   [M] Models         -- Download AI and Facial Expression models
echo   [D] Dev            -- Run backend locally (needs PostgreSQL + Redis)
echo   [T] Test           -- Run pytest locally
echo.
echo   --- Docker ---
echo   [1] Start          -- Start all services (instant)
echo   [2] Stop           -- Stop all services
echo   [3] Restart        -- Restart all services
echo   [4] Logs           -- Tail live logs
echo   [5] Status         -- Show container status
echo   [6] Migrate        -- Apply Alembic migrations
echo   [7] Shell          -- Open bash in backend container
echo   [8] Build          -- Rebuild Docker images
echo   [9] Clean          -- Remove containers + volumes (DANGER)
echo   [0] Exit
echo.
set /p "CHOICE=  Choose an option: "

if /i "%CHOICE%"=="s" goto :cmd_setup
if /i "%CHOICE%"=="m" goto :cmd_models
if /i "%CHOICE%"=="d" goto :cmd_dev
if /i "%CHOICE%"=="t" goto :cmd_test
if "%CHOICE%"=="1" goto :cmd_start
if "%CHOICE%"=="2" goto :cmd_stop
if "%CHOICE%"=="3" goto :cmd_restart
if "%CHOICE%"=="4" goto :cmd_logs
if "%CHOICE%"=="5" goto :cmd_status
if "%CHOICE%"=="6" goto :cmd_migrate
if "%CHOICE%"=="7" goto :cmd_shell
if "%CHOICE%"=="8" goto :cmd_build
if /i "%CHOICE%"=="b" goto :cmd_build
if "%CHOICE%"=="9" goto :cmd_clean
if "%CHOICE%"=="0" exit /b 0

echo  Invalid choice. Press any key...
pause >nul
goto :show_menu

:: ============================================================
::  MODELS -- Download & verify all AI / Facial models
:: ============================================================
:cmd_models
echo.
echo  [*] Downloading and verifying all AI and Facial models...
call "%~dp0download_models.bat"
goto :done

:: ============================================================
::  SETUP -- Create venv and install all Python dependencies
:: ============================================================
:cmd_setup
echo.
echo  [*] Setting up local Python environment...

:: Find Python 3.11+ generically (works on any machine)
set "PYTHON="
where python >nul 2>&1
if not errorlevel 1 set "PYTHON=python"

if "!PYTHON!"=="" (
    where py >nul 2>&1
    if not errorlevel 1 set "PYTHON=py"
)

if "!PYTHON!"=="" (
    for %%P in ("%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
                 "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
                 "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
                 "%LOCALAPPDATA%\Programs\Python\Python311\python.exe") do (
        if exist %%P if "!PYTHON!"=="" set "PYTHON=%%~P"
    )
)

if "!PYTHON!"=="" (
    echo  [ERROR] Python 3.11+ not found. Install from python.org and retry.
    goto :done
)

echo  [OK] Using Python: !PYTHON!

:: Create virtual environment
if not exist "!VENV_DIR!" (
    echo  [*] Creating virtual environment at backend\.venv ...
    "!PYTHON!" -m venv "!VENV_DIR!"
    if errorlevel 1 (
        echo  [ERROR] Failed to create venv.
        goto :done
    )
    echo  [OK] Virtual environment created.
) else (
    echo  [OK] Virtual environment already exists.
)

:: Activate and install
echo  [*] Installing dependencies from pyproject.toml ...
call "!VENV_DIR!\Scripts\activate.bat"

:: Upgrade pip first
python -m pip install --upgrade pip --quiet

:: Install with dev extras
pip install -e "%BACKEND_DIR%[dev]"

if errorlevel 1 (
    echo  [ERROR] Dependency installation failed.
    goto :done
)

echo.
echo  [OK] All dependencies installed successfully!
echo.
echo  Next steps:
echo    1. Add your API keys to .env
echo    2. Start PostgreSQL and Redis (or use Docker: run.bat start)
echo    3. Run locally:  run.bat dev
echo    4. Run tests:    run.bat test

goto :done

:: ============================================================
::  DEV -- Run backend locally without Docker
:: ============================================================
:cmd_dev
echo.
echo  [*] Starting Aura AI 2.0 backend in LOCAL mode...

if not exist "!VENV_DIR!\Scripts\activate.bat" (
    echo  [ERROR] Virtual environment not found. Run first:  run.bat setup
    goto :done
)

if not exist "!ENV_FILE!" (
    echo  [WARN] .env not found. Copying from .env.example...
    copy "%~dp0.env.example" "!ENV_FILE!" >nul
)

call "!VENV_DIR!\Scripts\activate.bat"

:: Override postgres/redis hosts to localhost for local dev
set "POSTGRES_HOST=localhost"
set "REDIS_HOST=localhost"

echo  [*] Running migrations...
cd /d "!BACKEND_DIR!"
python -m alembic upgrade head 2>nul
if errorlevel 1 echo  [WARN] Migration skipped (DB may not be available yet)

echo.
echo  [*] Starting uvicorn at http://localhost:8000
echo      Swagger: http://localhost:8000/docs
echo      Press Ctrl+C to stop.
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app

goto :done

:: ============================================================
::  START -- Docker Compose
:: ============================================================
:cmd_start
echo.
echo  [*] Checking Docker...

docker info >nul 2>&1
if not errorlevel 1 goto :docker_ok

echo  [*] Docker daemon not running. Launching Docker Desktop...
if not exist "!DOCKER_EXE!" (
    echo  [ERROR] Docker Desktop not found.
    echo          Install from: https://www.docker.com/products/docker-desktop
    goto :done
)

start "" "!DOCKER_EXE!"
echo  [*] Waiting for Docker daemon (up to 90s)...

set "TRIES=0"
:wait_docker
timeout /t 4 /nobreak >nul
set /a TRIES+=1
docker info >nul 2>&1
if not errorlevel 1 goto :docker_ok
if !TRIES! lss 22 (
    set /a SECS=!TRIES!*4
    echo  [*]   ...!SECS!s elapsed
    goto :wait_docker
)
echo  [ERROR] Docker did not start in 88 seconds.
echo          Open Docker Desktop manually, wait for it to say "Docker is running", then retry.
goto :done

:docker_ok
echo  [OK] Docker is running.

:: Check for .env
if not exist "!ENV_FILE!" (
    echo  [WARN] .env not found - copying from .env.example...
    copy "%~dp0.env.example" "!ENV_FILE!" >nul
    echo  [WARN] Fill in your AI API keys in .env before using chat!
)
if not exist "%BACKEND_DIR%\.env" (
    copy "!ENV_FILE!" "%BACKEND_DIR%\.env" >nul
)

echo  [*] Starting all services...
echo.
docker compose -f "!COMPOSE_FILE!" up -d

if errorlevel 1 (
    echo.
    echo  [ERROR] Failed to start. See error above.
    goto :done
)

timeout /t 3 /nobreak >nul
docker compose -f "!COMPOSE_FILE!" ps

echo.
echo  +------------------------------------------+
echo  ^|          AURA AI 2.0 IS UP               ^|
echo  ^|                                          ^|
echo  ^|  API      :  http://localhost:8000        ^|
echo  ^|  Swagger  :  http://localhost:8000/docs   ^|
echo  ^|  Frontend :  http://localhost:3000        ^|
echo  +------------------------------------------+
echo.
set /p "OPEN=  Open Swagger in browser? (y/N): "
if /i "!OPEN!"=="y" start "" "http://localhost:8000/docs"

goto :done

:: ============================================================
::  STOP
:: ============================================================
:cmd_stop
echo.
echo  [*] Stopping services...
docker compose -f "!COMPOSE_FILE!" down
echo  [OK] Stopped.
goto :done

:: ============================================================
::  RESTART
:: ============================================================
:cmd_restart
echo.
echo  [*] Restarting services...
docker compose -f "!COMPOSE_FILE!" restart
docker compose -f "!COMPOSE_FILE!" ps
goto :done

:: ============================================================
::  LOGS
:: ============================================================
:cmd_logs
echo.
echo  [*] Streaming logs (Ctrl+C to stop)...
set "SVC=%~2"
if "!SVC!"=="" (
    docker compose -f "!COMPOSE_FILE!" logs -f --tail=50
) else (
    docker compose -f "!COMPOSE_FILE!" logs -f --tail=50 !SVC!
)
goto :done

:: ============================================================
::  STATUS
:: ============================================================
:cmd_status
echo.
docker compose -f "!COMPOSE_FILE!" ps
echo.
echo  [*] API Health Check:
powershell -NoProfile -Command "try { $r = Invoke-RestMethod 'http://localhost:8000/api/v1/health' -TimeoutSec 5; Write-Host ('  Status  : ' + $r.status); Write-Host ('  App     : ' + $r.app + ' v' + $r.version); Write-Host ('  Env     : ' + $r.environment) } catch { Write-Host '  Backend not reachable.' }"
goto :done

:: ============================================================
::  TEST
:: ============================================================
:cmd_test
echo.
echo  [*] Running pytest...

:: Try local venv first (preferred)
if exist "!VENV_DIR!\Scripts\activate.bat" (
    call "!VENV_DIR!\Scripts\activate.bat"
    cd /d "!BACKEND_DIR!"
    python -m pytest tests/ -v --tb=short
    goto :done
)

:: Fallback: Docker container
docker compose -f "!COMPOSE_FILE!" ps --services --filter status=running 2>nul | findstr "backend" >nul 2>&1
if not errorlevel 1 (
    docker compose -f "!COMPOSE_FILE!" exec backend python -m pytest tests/ -v --tb=short
    goto :done
)

echo  [ERROR] No venv found and Docker backend is not running.
echo          Run "run.bat setup" to install dependencies locally.
goto :done

:: ============================================================
::  MIGRATE
:: ============================================================
:cmd_migrate
echo.
echo  [*] Running Alembic migrations...

if exist "!VENV_DIR!\Scripts\activate.bat" (
    call "!VENV_DIR!\Scripts\activate.bat"
    cd /d "!BACKEND_DIR!"
    python -m alembic upgrade head
    goto :done
)

docker compose -f "!COMPOSE_FILE!" exec backend python -m alembic upgrade head
goto :done

:: ============================================================
::  SHELL
:: ============================================================
:cmd_shell
echo.
echo  [*] Opening backend shell...
docker compose -f "!COMPOSE_FILE!" exec backend bash
goto :done

:: ============================================================
::  BUILD
:: ============================================================
:cmd_build
echo.
echo  [*] Rebuilding Docker images (no cache)...
docker compose -f "!COMPOSE_FILE!" build --no-cache
echo  [OK] Done. Run "run.bat start" to launch.
goto :done

:: ============================================================
::  CLEAN
:: ============================================================
:cmd_clean
echo.
echo  +------------------------------------------+
echo  ^|  WARNING: This removes ALL data!         ^|
echo  ^|  Containers, volumes, and the database   ^|
echo  ^|  will be permanently deleted.            ^|
echo  +------------------------------------------+
echo.
set /p "CONFIRM=  Type YES to confirm: "
if /i not "!CONFIRM!"=="YES" (
    echo  [CANCELLED]
    goto :done
)
docker compose -f "!COMPOSE_FILE!" down -v --remove-orphans
echo  [OK] Clean complete.
goto :done

:: ============================================================
::  HELP
:: ============================================================
:show_help
echo.
echo  Usage: run.bat [command]
echo.
echo  Local commands (no Docker):
echo    setup     Create venv and install all Python dependencies
echo    dev       Run backend locally on http://localhost:8000
echo    test      Run pytest test suite
echo.
echo  Docker commands:
echo    start     Build and start all services
echo    stop      Stop all services
echo    restart   Restart services
echo    logs      Tail logs  (logs backend for one service)
echo    status    Container status + API health check
echo    migrate   Apply Alembic DB migrations
echo    shell     Open bash in backend container
echo    build     Rebuild Docker images (no-cache)
echo    clean     Remove all containers + volumes (DANGER)
echo.

:: ============================================================
::  DONE
:: ============================================================
:done
echo.
if "%~1"=="" (
    echo  Press any key to return to menu...
    pause >nul
    goto :show_menu
)
endlocal
