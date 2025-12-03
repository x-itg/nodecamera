@echo off
cd /d "D:\z\tlGZ\canode\backend"
echo 正在启动 USB 摄像头录制服务...
echo 访问地址: http://localhost:3001
echo.
echo 按 Ctrl+C 停止服务
echo.
node dist/index.js
pause
