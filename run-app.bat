@echo off
title Transport Admin Launcher
cd /d "C:\Users\�吼�{��\Projects\transport-admin"
if not exist package.json goto BAD
for %%P in (3000 3001 3002) do for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P" ^| findstr LISTENING') do taskkill /PID %%A /F >nul 2>&1
if exist ".next\dev\lock" del /f /q ".next\dev\lock" >nul 2>&1
start /min cmd /c "ping -n 9 127.0.0.1 >nul && start http://localhost:3000"
call npm.cmd run dev
pause
exit /b 0
:BAD
echo ERROR: project folder not found
pause
exit /b 1