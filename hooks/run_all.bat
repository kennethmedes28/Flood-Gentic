@echo off
rem Run the whole app for local work: the FastAPI backend and the Next.js frontend, side by side (Windows).
rem This is a short launcher; the work is done by scripts\run_dev.py (see that file for what it checks and prints).
rem
rem   hooks\run_all.bat                      backend on :8000, frontend on :3000
rem   hooks\run_all.bat --memory             keep chats in memory instead of Postgres
rem   hooks\run_all.bat --no-reload          do not restart the backend when its files change
rem   hooks\run_all.bat --backend-port 8001 --frontend-port 3001
rem   hooks\run_all.bat --help
rem
rem Every option is passed on to run_dev.py unchanged. Ctrl+C stops both programs.

setlocal

rem This file lives in hooks\, so the repository root is one folder up.
set "ROOT=%~dp0.."

rem Python is "python" on most installs and "py" (the launcher) on others.
where python >nul 2>nul && (
    python "%ROOT%\scripts\run_dev.py" %*
    exit /b %errorlevel%
)
where py >nul 2>nul && (
    py -3 "%ROOT%\scripts\run_dev.py" %*
    exit /b %errorlevel%
)

echo [run_all] Python is not installed or not on your PATH. Install it from https://www.python.org/downloads/
exit /b 1
