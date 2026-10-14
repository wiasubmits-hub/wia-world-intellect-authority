@echo off
title Git Credential Manager - Push TIA Portal to GitHub
echo ===================================================
echo   GIT CREDENTIAL MANAGER - GITHUB AUTHENTICATION
echo   Target Repo: https://github.com/wiasubmits-hub/wia-world-intellect-authority
echo   Account:     wiasubmits-hub
echo ===================================================
echo.

set "PATH=E:\ai course and more\Microsoft VS Code\Git\cmd;E:\ai course and more\Microsoft VS Code\Git\mingw64\bin;%PATH%"
cd /d "E:\TIA portal"

echo [1/2] Opening Git Credential Manager for account: wiasubmits-hub ...
git credential-manager github login --username wiasubmits-hub --browser

echo.
echo [2/2] Pushing main branch to GitHub ...
git push -u origin main

echo.
echo ===================================================
echo   Push process finished!
echo ===================================================
pause
