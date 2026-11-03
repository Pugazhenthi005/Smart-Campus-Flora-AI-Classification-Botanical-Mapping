@echo off
title UCEV Smart Campus Flora Server
echo ========================================================
echo   Starting UCEV Smart Campus Flora Server...
echo   URL: http://localhost:8000
echo ========================================================
echo.

cd /d "%~dp0"
set "KERAS_HOME=%~dp0.keras"
set "MPLCONFIGDIR=%~dp0.matplotlib"
set "TF_ENABLE_ONEDNN_OPTS=0"
set "TF_CPP_MIN_LOG_LEVEL=2"

echo [1/2] Launching Python FastAPI Server...
start "" http://localhost:8000
python run_server.py

pause
