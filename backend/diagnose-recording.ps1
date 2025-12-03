# 快速诊断录制问题

Write-Host "=== 录制问题诊断 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 检查录制文件
Write-Host "1. 检查录制文件:" -ForegroundColor Yellow
$recordingPath = ".\data\recordings"
if (Test-Path $recordingPath) {
    $files = Get-ChildItem $recordingPath -Filter "*.mp4" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
    
    if ($files.Count -gt 0) {
        Write-Host "  找到最近的录制文件:" -ForegroundColor Green
        foreach ($file in $files) {
            $sizeKB = [math]::Round($file.Length / 1KB, 2)
            $sizeMB = [math]::Round($file.Length / 1MB, 2)
            Write-Host "    - $($file.Name)" -ForegroundColor White
            Write-Host "      大小: $sizeMB MB ($sizeKB KB)" -ForegroundColor Gray
            Write-Host "      修改时间: $($file.LastWriteTime)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ❌ 没有找到 MP4 文件" -ForegroundColor Red
    }
} else {
    Write-Host "  ❌ 录制目录不存在: $recordingPath" -ForegroundColor Red
}

Write-Host ""

# 2. 检查 FFmpeg 进程
Write-Host "2. 检查 FFmpeg 进程:" -ForegroundColor Yellow
$ffmpegProcesses = Get-Process -Name ffmpeg -ErrorAction SilentlyContinue

if ($ffmpegProcesses) {
    Write-Host "  ✅ 找到 $($ffmpegProcesses.Count) 个 FFmpeg 进程:" -ForegroundColor Green
    foreach ($proc in $ffmpegProcesses) {
        Write-Host "    - PID: $($proc.Id)" -ForegroundColor White
        Write-Host "      CPU: $($proc.CPU)" -ForegroundColor Gray
        Write-Host "      内存: $([math]::Round($proc.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
    }
} else {
    Write-Host "  ❌ 没有找到 FFmpeg 进程" -ForegroundColor Red
}

Write-Host ""

# 3. 检查配置
Write-Host "3. 检查配置:" -ForegroundColor Yellow
$configCheck = node -e "
const { getConfig } = require('./dist/config/database');
console.log('  auto_start:', getConfig('auto_start'));
console.log('  selected_camera:', getConfig('selected_camera'));
console.log('  storage_limit:', (parseInt(getConfig('storage_limit')) / 1024 / 1024 / 1024).toFixed(0) + 'GB');
"
$configCheck

Write-Host ""

# 4. 修复建议
Write-Host "4. 修复建议:" -ForegroundColor Yellow

if (-not $ffmpegProcesses) {
    Write-Host "  ❌ FFmpeg 未运行 - 录制未启动" -ForegroundColor Red
    Write-Host "     解决: 重启服务" -ForegroundColor Gray
}

if ($files -and $files[0].Length -eq 0) {
    Write-Host "  ❌ 文件大小为 0 - FFmpeg 可能崩溃" -ForegroundColor Red
    Write-Host "     解决: 检查 FFmpeg 日志，重启服务" -ForegroundColor Gray
}

if ($files -and $files[0].Length -gt 0 -and $files[0].Length -lt 1MB) {
    Write-Host "  ⚠️  文件很小但在增长 - 录制正常" -ForegroundColor Yellow
    Write-Host "     等待几秒后再次运行此脚本检查" -ForegroundColor Gray
}

if ($files -and $files[0].Length -gt 1MB) {
    Write-Host "  ✅ 文件正常增长 - 录制工作中" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== 诊断完成 ===" -ForegroundColor Cyan
