@echo off
echo ========================================================
echo    Smart Campus Flora - FastAPI Server + Web App
echo ========================================================
echo Starting server at http://localhost:8000 ...
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
