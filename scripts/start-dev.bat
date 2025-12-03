@echo off
chcp 65001 >nul
title USB摄像头录制系统 - 开发模式

cd /d "%~dp0\..\backend"

echo ==========================================
echo   USB摄像头录制系统 - 开发模式
echo ==========================================
echo.

REM 检查后端依赖
if not exist "node_modules" (
    echo 安装后端依赖...
    call npm install
)

echo 启动后端服务...
echo 地址: http://localhost:3001
echo.
echo 按 Ctrl+C 停止服务
echo.

call npm run dev
