@echo off
title TIA IDE Studio - Tirupati Intellect Authority
echo ===================================================
echo   LAUNCHING TIA IDE STUDIO (LOCAL SOFTWARE)
echo   Empowering Tirupati with AI
echo   CEO: M. Bhargav Rayudu (B.Tech Mechatronics - CAD Diploma)
echo   GSTIN: 37EYLPM8018M1ZN
echo ===================================================

cd /d "%~dp0"

:: Check if node is already running on port 3000
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
  echo Starting TIA IDE Backend Server...
  start "" /b node server.js
  timeout /t 2 /nobreak >nul
) else (
  echo TIA IDE Backend Server already active.
)

:: Open in application window mode (Edge / Chrome / default browser)
start "" msedge --app=http://localhost:3000 2>nul || start "" chrome --app=http://localhost:3000 2>nul || start "" http://localhost:3000

echo.
echo TIA IDE Studio running at http://localhost:3000
timeout /t 3 >nul
