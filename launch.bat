@echo off
cd /d "%~dp0"
:: Start Vite silently via VBS
start "" /b cscript //nologo //e:vbscript "%~dp0vite-hidden.vbs"
:: Wait for Vite to be ready
timeout /t 4 /nobreak >nul
:: Start Tauri (no console thanks to windows_subsystem)
start "" "src-tauri\target\debug\soul-writer.exe"
exit
