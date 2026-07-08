@echo off
cd /d C:\Users\mac55\jangbi-platform
if exist .git\index.lock del /f .git\index.lock
git add -A
git commit -m "update"
git push origin main
echo.
echo Done.
pause
