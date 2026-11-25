@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0BASLAT-V2.ps1" -Team
if errorlevel 1 pause
