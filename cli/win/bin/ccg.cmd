@echo off
rem ccg.cmd - entry point for ccg on native Windows (CMD and PowerShell).
rem Runs ..\main.ps1 with -ExecutionPolicy Bypass so a locked-down policy does not block it.
rem One line on purpose: cmd reads a batch file piece by piece, and self-update may rewrite this file while it runs.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\main.ps1" %* & call exit /b %%errorlevel%%
