@echo off
title Push UCEV Smart Flora to GitHub
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0push_to_github.ps1"
pause
