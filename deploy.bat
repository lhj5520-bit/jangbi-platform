@echo off
cd /d C:\Users\mac55\jangbi-platform
echo Deploying... please wait 1-2 minutes.
echo (Log is saved to deploy-log.txt)
echo.
echo ===== deploy started ===== > deploy-log.txt
where vercel >> deploy-log.txt 2>&1
if errorlevel 1 goto usenpx
call vercel --prod --yes >> deploy-log.txt 2>&1
goto done
:usenpx
echo vercel not found, trying npx... >> deploy-log.txt
call npx vercel --prod --yes >> deploy-log.txt 2>&1
:done
echo ===== deploy finished ===== >> deploy-log.txt
echo.
type deploy-log.txt
echo.
echo FINISHED - you can close this window.
pause
