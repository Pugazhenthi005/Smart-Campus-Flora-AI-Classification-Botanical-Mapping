@echo off
title UCEV Smart Campus Flora
echo ========================================================
echo   University College of Engineering Villupuram (UCEV)
echo   Smart Campus Flora - Botanical Classifier Server
echo ========================================================
echo.
echo Starting FastAPI Backend Server on http://localhost:8000 ...
echo.

cd /d "%~dp0"
python run_server.py

pause
