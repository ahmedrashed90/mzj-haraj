@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Installing MZJ Haraj Manager dependencies...
npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)
echo.
echo Done. Run npm run build to test the project.
pause
