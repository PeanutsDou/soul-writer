@echo off
cd /d "%~dp0"
:: Start Vite in the background. Reusing an existing dev server is harmless.
start "" /b cmd /c "npm run dev > vite.log 2>&1"
:: Wait for Vite to be ready
timeout /t 4 /nobreak >nul
:: Start Tauri (no console thanks to windows_subsystem)
start "" "src-tauri\target\debug\soul-writer.exe"
exit
