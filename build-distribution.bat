@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 goto failure

echo.
echo Make My Lithophane - Windows distribution build
echo ==================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22.12 or newer, then run this file again.
  goto failure
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm included.
  goto failure
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<12)){console.error('Node.js 22.12 or newer is required.');process.exit(1)}"
if errorlevel 1 goto failure

rem Honor an existing CA configuration. Otherwise use Windows' trusted public
rem root/intermediate certificates so Node also works on managed networks.
rem This does not disable TLS verification or change system trust settings.
if defined NODE_EXTRA_CA_CERTS goto certificates_ready
set "NODE_EXTRA_CA_CERTS=%TEMP%\make-my-lithophane-system-ca.pem"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\export-system-ca.ps1"
if errorlevel 1 goto failure

:certificates_ready
echo [1/3] Installing locked dependencies...
call npm ci --no-fund
if errorlevel 1 goto failure

echo.
echo [2/3] Checking geometry and export logic...
call npm test
if errorlevel 1 goto failure

echo.
echo [3/3] Building installer and portable executable...
call npm run package
if errorlevel 1 goto failure

echo.
echo Build complete. Files are in:
echo   "%~dp0release"
echo.
echo Run "Make My Lithophane 0.1.0 Portable.exe" without installation.
echo Run "Make My Lithophane Setup 0.1.0.exe" to install the app.
echo The unpacked app is also in "release\win-unpacked".
echo Keep the unpacked EXE beside its supporting files.
echo.
if /i not "%~1"=="--no-pause" pause
exit /b 0

:failure
set "BUILD_EXIT=%ERRORLEVEL%"
if "%BUILD_EXIT%"=="0" set "BUILD_EXIT=1"
echo.
echo Build failed. See the error above; no successful build is being reported.
if /i not "%~1"=="--no-pause" pause
exit /b %BUILD_EXIT%
