@echo off
cd /d "%~dp0"
echo Stopping old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
echo Starting Jira Dashboard...
start "" http://localhost:5173
npm run dev
