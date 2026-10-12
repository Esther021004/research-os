@echo off
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "PATH=%CD%\tools\poppler\bin;%PATH%"
if exist ".venv\Scripts\python.exe" goto deps
py -3 --version >nul 2>&1
if errorlevel 1 goto pythonfallback
py -3 -m venv .venv
if errorlevel 1 goto fail
goto deps
:pythonfallback
python --version >nul 2>&1
if errorlevel 1 goto missingpython
python -m venv .venv
if errorlevel 1 goto fail
:deps
.venv\Scripts\python.exe -c "import jwt, cryptography" >nul 2>&1
if not errorlevel 1 goto run
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto fail
:run
.venv\Scripts\python.exe launch-source.py
if errorlevel 1 goto fail
exit /b 0
:missingpython
echo Install Python 3.10 or newer from python.org, then run this file again.
pause
exit /b 1
:fail
echo Research OS did not start. Please share the error above. Do not delete your data.
pause
exit /b 1
