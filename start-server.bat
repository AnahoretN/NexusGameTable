@echo off
REM Set the target folder
cd /d "%~dp0"
set "PROJ_DIR=%~dp0"
echo.
echo Go to directory: %PROJ_DIR%

echo.
echo Launch: npm install (Installing dependencies...)
call npm install
REM 'call' гарантирует, что мы дождемся завершения npm install

echo.
echo Launch: npm run start:local (Starting a local server)
call npm run dev

REM If the server stops, the console window will close.
REM If you want the window to remain open, add 'pause' to the end.
pause