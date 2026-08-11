@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem One-click standalone TTS setup and launcher. Configure TTS_DEVICE,
rem TTS_HOST, and TTS_PORT in .env (copy .env.example first if needed).
set "TTS_DEVICE=cpu"
set "TTS_HOST=0.0.0.0"
set "TTS_PORT=5123"
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /I "%%A"=="TTS_DEVICE" set "TTS_DEVICE=%%B"
    if /I "%%A"=="TTS_HOST" set "TTS_HOST=%%B"
    if /I "%%A"=="TTS_PORT" set "TTS_PORT=%%B"
  )
)

if /I "%TTS_DEVICE%"=="cuda" set "TTS_REQUIREMENTS=requirements\requirements-nvidia.txt"
if /I "%TTS_DEVICE%"=="rocm" set "TTS_REQUIREMENTS=requirements\requirements-amd.txt"
if not defined TTS_REQUIREMENTS set "TTS_REQUIREMENTS=requirements\requirements-cpu.txt"

if not exist ".venv\Scripts\python.exe" (
  echo Creating Python virtual environment...
  py -3 -m venv .venv 2>nul || python -m venv .venv
  if errorlevel 1 (
    echo Python 3 was not found. Install Python 3, then run this file again.
    pause
    exit /b 1
  )
)

set "TTS_PYTHON=.venv\Scripts\python.exe"
set "TTS_PROFILE_FILE=.venv\.tts-device"
set "TTS_NEEDS_INSTALL=0"
if not exist "%TTS_PROFILE_FILE%" set "TTS_NEEDS_INSTALL=1"
if exist "%TTS_PROFILE_FILE%" set /p TTS_LAST_DEVICE=<"%TTS_PROFILE_FILE%"
if /I not "%TTS_LAST_DEVICE%"=="%TTS_DEVICE%" set "TTS_NEEDS_INSTALL=1"
"%TTS_PYTHON%" -c "import chatterbox, torch, torchaudio" >nul 2>nul || set "TTS_NEEDS_INSTALL=1"

if "%TTS_NEEDS_INSTALL%"=="1" (
  echo Installing TTS dependencies for %TTS_DEVICE%...
  "%TTS_PYTHON%" -m pip install --upgrade pip
  "%TTS_PYTHON%" -m pip install --upgrade --force-reinstall -r "%TTS_REQUIREMENTS%"
  if errorlevel 1 (
    echo Dependency installation failed. Check your Python version, drivers, and TTS_DEVICE in .env.
    pause
    exit /b 1
  )
  >"%TTS_PROFILE_FILE%" echo %TTS_DEVICE%
)

echo Starting TTS server at %TTS_HOST%:%TTS_PORT% using %TTS_DEVICE%...
"%TTS_PYTHON%" main.py --host "%TTS_HOST%" --port "%TTS_PORT%"
pause
