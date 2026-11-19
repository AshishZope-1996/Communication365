@echo off
title Campaign Portal Startup

echo ============================================
echo      Starting Campaign Portal...
echo ============================================

:: Project Paths
set PROJECT_PATH=C:\Users\zope1\OneDrive\Desktop\Repo\Communication365
set APP_PATH=%PROJECT_PATH%\app
set WRAPPER_PATH=%PROJECT_PATH%\Wrapper

echo.
echo Installing project dependencies...
python -m pip install -r "%PROJECT_PATH%\requirements.txt"

if defined PORTAL_ENV_FILE (
  if not exist "%PORTAL_ENV_FILE%" (
    echo WARNING: PORTAL_ENV_FILE does not point to an existing file.
  )
) else (
  if not exist "%PROJECT_PATH%\.env" (
    echo WARNING: No portal .env file found. Database and SMTP credentials must be set in the environment.
  )
)

echo.
echo Starting UI Server...
start "Portal UI" cmd /k "cd /d "%APP_PATH%" && python -m http.server 8000"

echo.
echo Starting Campaign API...
start "Campaign API" cmd /k "cd /d "%WRAPPER_PATH%" && python campaign_api.py"

echo.
echo Starting Dashboard Stats API...
start "Dashboard Stats API" cmd /k "cd /d "%WRAPPER_PATH%" && python dashboard_stats_api.py"

timeout /t 5 >nul

echo.
echo Opening Portal...
start http://127.0.0.1:8000/index.html

echo.
echo ============================================
echo All services started successfully.
echo ============================================
pause