# 启用自动启动录制的 PowerShell 脚本

Write-Host "=== 配置自动启动录制 ===" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误: 未找到 Node.js" -ForegroundColor Red
    exit 1
}

# 检查当前目录
if (-not (Test-Path ".\package.json")) {
    Write-Host "❌ 错误: 请在 backend 目录下运行此脚本" -ForegroundColor Red
    exit 1
}

# 运行 Node.js 脚本设置配置
$nodeScript = @"
const { getConfig, setConfig } = require('./dist/config/database');

console.log('📋 当前配置:');
console.log('  auto_start:', getConfig('auto_start'));
console.log('  selected_camera:', getConfig('selected_camera'));
console.log('');

// 启用自动启动
setConfig('auto_start', 'true');
console.log('✅ 已启用自动启动录制 (auto_start = true)');
console.log('');

// 设置默认摄像头（如果未设置）
const selectedCamera = getConfig('selected_camera');
if (!selectedCamera) {
    console.log('⚠️  警告: 未设置默认摄像头');
    console.log('   请通过以下方式设置:');
    console.log('   1. 使用 Web 界面: http://localhost:3000');
    console.log('   2. 或运行: node -e \"require('./dist/config/database').setConfig('selected_camera', 'video=USB2.0 UVC PC Camera')\"');
    console.log('');
}

console.log('📌 验证配置:');
console.log('  auto_start:', getConfig('auto_start'));
console.log('  selected_camera:', getConfig('selected_camera'));
console.log('');
console.log('🔄 下次启动服务时将自动开始录制');
"@

# 执行配置
node -e $nodeScript

Write-Host ""
Write-Host "=== 配置完成 ===" -ForegroundColor Green
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "  1. 确认摄像头已选择"
Write-Host "  2. 重启服务: npm run dev"
Write-Host "  3. 检查日志确认自动录制启动"
Write-Host ""
