@echo off
title Nihon Touch-Typing Launcher
echo ==============================================
echo   Starting Nihon Japanese Touch-Typing Studio
echo ==============================================

echo [1/2] Launching FastAPI Backend on http://localhost:8000...
start "Nihon Backend (FastAPI)" cmd /k "cd /d %~dp0backend && py -3.11 run.py"

echo [2/2] Launching Next.js Frontend on http://localhost:3000...
start "Nihon Frontend (Next.js)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are starting!
echo - Frontend: http://localhost:3000
echo - Backend:  http://localhost:8000
echo - Ollama:   http://localhost:11434
echo.
timeout /t 3 >nul
start http://localhost:3000
