@echo off
REM Set the target folder
cd /d "%~dp0"
set "PROJ_DIR=%~dp0"
echo.
echo Go to directory: %PROJ_DIR%

echo.
echo Go to directory: %TARGET_DIR%
cd "%TARGET_DIR%"

echo.
echo Launch: npm run dev (Start in development mode)
call npm run dev

pause