# USB摄像头录制系统 - Windows 开发模式启动脚本

$ErrorActionPreference = "Stop"

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  USB摄像头录制系统 - 开发模式" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查依赖
Write-Host "检查依赖..." -ForegroundColor Yellow

# 检查后端依赖
$backendModules = "$ProjectDir\backend\node_modules"
if (-not (Test-Path $backendModules)) {
    Write-Host "安装后端依赖..." -ForegroundColor Cyan
    Set-Location "$ProjectDir\backend"
    npm install
}

# 检查前端依赖
$frontendModules = "$ProjectDir\frontend\node_modules"
if (-not (Test-Path $frontendModules)) {
    Write-Host "安装前端依赖..." -ForegroundColor Cyan
    Set-Location "$ProjectDir\frontend"
    npm install
}

Write-Host ""
Write-Host "启动开发服务器..." -ForegroundColor Green
Write-Host ""
Write-Host "后端: http://localhost:3001" -ForegroundColor White
Write-Host "前端: http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "按 Ctrl+C 停止所有服务" -ForegroundColor Yellow
Write-Host ""

# 启动后端（在新窗口）
$backendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectDir\backend'; npm run dev" -PassThru

# 启动前端（在新窗口）
$frontendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectDir\frontend'; npm run dev" -PassThru

Write-Host "开发服务器已启动！" -ForegroundColor Green
Write-Host ""
Write-Host "后端进程 ID: $($backendJob.Id)" -ForegroundColor Cyan
Write-Host "前端进程 ID: $($frontendJob.Id)" -ForegroundColor Cyan
Write-Host ""

# 等待3秒后打开浏览器
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host "按任意键关闭开发服务器..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# 关闭进程
Write-Host ""
Write-Host "正在关闭服务器..." -ForegroundColor Yellow

Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue

# 关闭所有 node 子进程
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -like "*npm*" -or $_.MainWindowTitle -like "*dev*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "开发服务器已关闭" -ForegroundColor Green
