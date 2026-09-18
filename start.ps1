# Nihon App Launcher
Write-Host "Starting Nihon Japanese Touch-Typing App..." -ForegroundColor Cyan

# Start Backend in background
$backendPath = Join-Path $PSScriptRoot "backend"
$pythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"
if (-Not (Test-Path $pythonPath)) {
    $pythonPath = "python"
}

Write-Host "Launching Backend on http://localhost:8000..." -ForegroundColor Green
Start-Process -FilePath $pythonPath -ArgumentList "run.py" -WorkingDirectory $backendPath

# Start Frontend
$frontendPath = Join-Path $PSScriptRoot "frontend"
Write-Host "Launching Frontend on http://localhost:3000..." -ForegroundColor Green
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory $frontendPath

Write-Host "Nihon services launched!" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Backend:  http://localhost:8000" -ForegroundColor Yellow
