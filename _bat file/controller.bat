@echo off
setlocal
cd /d C:\inetpub\websites\Controller

start "Controller Dev Server" cmd /c "npm run start"

:: Wait up to 30s for http://localhost:5175 to respond
for /l %%i in (1,1,30) do (
  >nul 2>&1 powershell -NoProfile -Command ^
    "try { (Invoke-WebRequest -UseBasicParsing http://localhost:5175) | Out-Null; exit 0 } catch { exit 1 }"
  if not errorlevel 1 goto :open
  timeout /t 1 >nul
)

:open
start "" "http://localhost:5175"
endlocal
