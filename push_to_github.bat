@echo off
title Push UCEV Smart Flora to GitHub
echo ========================================================
echo   Pushing Smart Campus Flora to GitHub
echo   Repository: Pugazhenthi005/Smart-Campus-Flora-AI-Classification-Botanical-Mapping
echo ========================================================
echo.

set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
cd /d "%~dp0"

echo [1/3] Checking Git status...
git status --short

echo.
echo [2/3] Setting remote origin...
git remote remove origin 2>nul
git remote add origin https://github.com/Pugazhenthi005/Smart-Campus-Flora-AI-Classification-Botanical-Mapping.git

echo.
echo [3/3] Pushing all website, AI model, and dataset files to GitHub...
echo (If prompted, please sign in with your GitHub account in the pop-up window)
echo.

git push -u origin main --force

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   SUCCESS! All files are now live on your GitHub repo:
    echo   https://github.com/Pugazhenthi005/Smart-Campus-Flora-AI-Classification-Botanical-Mapping
    echo ========================================================
) else (
    echo [!] Push failed. If authentication failed, create a Personal Access Token on GitHub (Settings - Developer Settings - Personal access tokens).
)

echo.
pause
