# ==============================================================================
# UCEV Smart Campus Flora - Automated GitHub Push Script
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  UCEV Smart Campus Flora - GitHub Push Automation" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Git is installed
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    # Check Program Files
    if (Test-Path "C:\Program Files\Git\cmd\git.exe") {
        $env:PATH += ";C:\Program Files\Git\cmd"
        $gitCmd = "C:\Program Files\Git\cmd\git.exe"
    } elseif (Test-Path "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe") {
        $env:PATH += ";$env:LOCALAPPDATA\Programs\Git\cmd"
        $gitCmd = "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
    } else {
        Write-Host "[!] Git is not found on your system." -ForegroundColor Yellow
        Write-Host "    Installing Git now via winget, please approve the Windows prompt if asked..." -ForegroundColor Cyan
        winget install --id Git.Git -e --source winget
        $env:PATH += ";C:\Program Files\Git\cmd"
    }
}

# 1. Initialize Git repository if not already initialized
if (-not (Test-Path ".git")) {
    Write-Host "[1/5] Initializing Git repository..." -ForegroundColor Green
    git init
} else {
    Write-Host "[1/5] Git repository already initialized." -ForegroundColor Green
}

# 2. Add all project files
Write-Host "[2/5] Staging files for commit..." -ForegroundColor Green
git add .

# 3. Commit
Write-Host "[3/5] Creating commit..." -ForegroundColor Green
git commit -m "Initial release: UCEV Smart Campus Flora with MobileNetV2 and Web GIS"

# 4. Set branch to main
git branch -M main

# 5. Remote URL prompt
Write-Host ""
Write-Host "Enter your GitHub Repository URL:" -ForegroundColor Yellow
Write-Host "Example: https://github.com/your-username/smart-campus-flora.git" -ForegroundColor DarkGray
$repoUrl = Read-Host "GitHub Repo URL"

if ($repoUrl -and $repoUrl.Trim() -ne "") {
    git remote remove origin 2>$null
    git remote add origin $repoUrl.Trim()
    Write-Host "[4/5] Remote added: $repoUrl" -ForegroundColor Green
    Write-Host "[5/5] Pushing to GitHub main branch..." -ForegroundColor Green
    git push -u origin main
    Write-Host ""
    Write-Host "SUCCESS! Code pushed to GitHub." -ForegroundColor Green
    Write-Host "You can now connect this repo to Render.com or Railway.app for permanent 24/7 hosting!" -ForegroundColor Cyan
} else {
    Write-Host "[!] No URL entered. Run 'git remote add origin <URL>' and 'git push -u origin main' whenever you are ready." -ForegroundColor Yellow
}

Write-Host ""
pause
