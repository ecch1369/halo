:: HALO - made by hworks (ecchworks@gmail.com)
@echo off
chcp 65001 >nul
where node >nul 2>nul || (echo Node.js is not installed. Download it from https://nodejs.org & pause & exit /b 1)
rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" >nul 2>nul
call npm install || (pause & exit /b 1)
call npm run dist || (pause & exit /b 1)
echo.
echo Done! Installer is in the "dist" folder.
explorer dist
pause
