@echo off
REM Electron must not inherit ELECTRON_RUN_AS_NODE (set by some IDE/agent shells).
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
start "" "%~dp0Evaluchat.exe"
