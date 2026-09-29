@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0Make My Lithophane.exe" "%~dp0resources\app.asar\cli\launch.cjs" %*
exit /b %ERRORLEVEL%
