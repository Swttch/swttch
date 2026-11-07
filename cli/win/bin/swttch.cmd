@echo off
rem swttch.cmd - the Swttch launcher on native Windows (CMD and PowerShell); ccg.cmd is the deprecated name of `swttch browser`.
rem One line on purpose (see ccg.cmd). setlocal keeps CCG_PROGRAM out of the caller's CMD session; leaving the batch ends it.
setlocal & set "CCG_PROGRAM=swttch" & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\main.ps1" %* & call exit /b %%errorlevel%%
