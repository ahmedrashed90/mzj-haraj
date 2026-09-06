@echo off
chcp 65001 >nul
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo Git غير مثبت على الجهاز.
  pause
  exit /b 1
)
if not exist .git git init
git add .
git commit -m "MZJ Haraj Manager v1.1.0"
git branch -M main
echo.
echo تم تجهيز Git محلياً.
echo أنشئ Repository Private على GitHub ثم نفذ:
echo git remote add origin https://github.com/YOUR-USER/mzj-haraj-manager.git
echo git push -u origin main
echo.
pause
