@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 空我人生
python server.py 8765 --open
if errorlevel 3 exit /b 0
if errorlevel 1 (
  echo.
  echo 启动失败：请确认已安装 Python。
  pause
)
