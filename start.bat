@echo off
rem Re-HUB for ATK: double-click to install (first run only) and open the app in your browser.
title Re-HUB for ATK
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Download the LTS version from https://nodejs.org , install it, then run start.bat again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Installing Re-HUB. This happens only the first time and takes about a minute...
  call npm ci --no-audit --no-fund --loglevel=error
  if errorlevel 1 (
    echo.
    echo Install failed. Close any other window that is running Re-HUB, then run start.bat again.
    pause
    exit /b 1
  )
)

echo.
echo Starting Re-HUB. Your browser opens automatically.
echo Keep this window open while you use Re-HUB. Close it to stop.
echo.
call npm run dev -- --open
pause
