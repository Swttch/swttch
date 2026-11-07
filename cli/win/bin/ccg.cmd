@echo off
rem ccg.cmd - entry point for ccg on native Windows (CMD and PowerShell).
rem Runs ..\main.ps1 with -ExecutionPolicy Bypass so a locked-down policy does not block it.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\main.ps1" %*
exit /b %ERRORLEVEL%
