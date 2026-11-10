@echo off
:: Usage: set-account.bat NEW-USERNAME
if "%~1"=="" (echo Usage: set-account.bat GITHUB-USERNAME & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-account.ps1" -Account "%~1"
pause
