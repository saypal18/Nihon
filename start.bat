@echo off
title Nihon Touch-Typing Launcher
echo ==============================================
echo   Starting Nihon Japanese Touch-Typing Studio
echo ==============================================

:: 1. VOICEVOX Engine check & launch
set "VV_PATH=%LOCALAPPDATA%\Microsoft\WinGet\Packages\HiroshibaKazuyuki.VOICEVOX_Microsoft.Winget.Source_8wekyb3d8bbwe\VOICEVOX\vv-engine\run.exe"
curl.exe -s http://127.0.0.1:50021/version >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/3] Starting VOICEVOX Engine on http://localhost:50021...
    if exist "%VV_PATH%" (
        start "VOICEVOX Engine" /min "%VV_PATH%" --host 127.0.0.1 --port 50021
    ) else (
        echo [WARN] VOICEVOX Engine executable not found at:
        echo        %VV_PATH%
    )
) else (
    echo [1/3] VOICEVOX Engine is already running on http://localhost:50021.
)

:: 2. Launch FastAPI Backend using virtual environment
echo [2/3] Launching FastAPI Backend on http://localhost:8000...
if exist "%~dp0backend\.venv\Scripts\python.exe" (
    start "Nihon Backend (FastAPI)" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe run.py"
) else (
    start "Nihon Backend (FastAPI)" cmd /k "cd /d %~dp0backend && py -3.11 run.py"
)

:: 3. Launch Next.js Frontend
echo [3/3] Launching Next.js Frontend on http://localhost:3000...
start "Nihon Frontend (Next.js)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo All services are configured and starting!
echo - Frontend: http://localhost:3000
echo - Backend:  http://localhost:8000
echo - VOICEVOX: http://localhost:50021
echo - Ollama:   http://localhost:11434
echo.
timeout /t 3 >nul
start http://localhost:3000
