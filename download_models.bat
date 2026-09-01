@echo off
setlocal EnableDelayedExpansion

title Aura AI 2.0 - Download Models
echo ============================================================
echo        AURA AI 2.0 -- Model Setup and Downloader
echo ============================================================
echo.

:: Detect Python
set "PYTHON="

:: Check virtual env first
if exist "%~dp0backend\.venv\Scripts\python.exe" (
    set "PYTHON=%~dp0backend\.venv\Scripts\python.exe"
    goto :found_python
)
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PYTHON=%~dp0.venv\Scripts\python.exe"
    goto :found_python
)

:: Check PATH python
where python >nul 2>&1
if not errorlevel 1 (
    set "PYTHON=python"
    goto :found_python
)

:: Check py launcher
where py >nul 2>&1
if not errorlevel 1 (
    set "PYTHON=py"
    goto :found_python
)

:: Check LocalAppData
for %%P in ("%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
             "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
             "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
             "%LOCALAPPDATA%\Programs\Python\Python311\python.exe") do (
    if exist %%P (
        if "!PYTHON!"=="" set "PYTHON=%%~P"
    )
)

:found_python
if "!PYTHON!"=="" (
    echo [ERROR] Python 3.11+ was not found on your system.
    echo Please install Python from https://www.python.org/downloads/
    echo or start Aura AI with Docker.
    echo.
    pause
    exit /b 1
)

echo [*] Using Python: !PYTHON!
echo [*] Downloading and verifying all required model assets...
echo.

"!PYTHON!" "%~dp0backend\scripts\download_models.py"

echo.
echo [DONE] Model setup complete. You can now run Aura AI 2.0!
echo.
pause
