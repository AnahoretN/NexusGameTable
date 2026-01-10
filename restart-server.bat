@echo off
echo Killing any process on port 5177...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5177 ^| findstr LISTENING') do (
    taskkill /F /PID %%a 2>nul
)
timeout /t 1 /nobreak >nul
echo Starting dev server...
npm run dev
