@echo off
title Transport Admin Stop
for %%P in (3000 3001 3002) do for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P" ^| findstr LISTENING') do taskkill /PID %%A /F >nul 2>&1
cd /d "C:\Users\�吼�{��\Projects\transport-admin" 2>nul
if exist ".next\dev\lock" del /f /q ".next\dev\lock"
echo Done.
pause