# USB摄像头录制系统 - Windows 诊断脚本
# 检测系统环境和依赖是否满足运行条件

$ErrorActionPreference = "SilentlyContinue"

function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Pass($message) {
    Write-Host "[√] $message" -ForegroundColor Green
}

function Write-Fail($message) {
    Write-Host "[×] $message" -ForegroundColor Red
}

function Write-Warn($message) {
    Write-Host "[!] $message" -ForegroundColor Yellow
}

function Write-Info($message) {
    Write-Host "[i] $message" -ForegroundColor Cyan
}

function Test-Command($command) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try {
        if (Get-Command $command) { return $true }
    }
    catch { return $false }
    finally { $ErrorActionPreference = $oldPreference }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  USB摄像头录制系统 - 环境诊断" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# 1. 系统信息
Write-Host "1. 系统信息" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

$osInfo = Get-CimInstance -ClassName Win32_OperatingSystem
Write-Info "操作系统: $($osInfo.Caption)"
Write-Info "版本: $($osInfo.Version)"
$arch = if ([Environment]::Is64BitOperatingSystem) { '64位' } else { '32位' }
Write-Info "架构: $arch"

if ($osInfo.Version -ge "10.0") {
    Write-Pass "Windows 10/11 兼容"
} else {
    Write-Warn "建议使用 Windows 10 或更高版本"
}

Write-Host ""

# 2. Node.js
Write-Host "2. Node.js 检测" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

if (Test-Command "node") {
    $nodeVersion = node --version 2>&1
    Write-Pass "Node.js 已安装: $nodeVersion"
    
    # 检查版本
    $versionNum = [version]($nodeVersion -replace 'v', '')
    if ($versionNum.Major -ge 18) {
        Write-Pass "Node.js 版本满足要求 (>= 18)"
    } else {
        Write-Warn "建议使用 Node.js 18.x 或更高版本"
        $allPassed = $false
    }
} else {
    Write-Fail "Node.js 未安装"
    Write-Info "下载地址: https://nodejs.org/"
    $allPassed = $false
}

if (Test-Command "npm") {
    $npmVersion = npm --version 2>&1
    Write-Pass "npm 已安装: $npmVersion"
} else {
    Write-Fail "npm 未安装"
    $allPassed = $false
}

Write-Host ""

# 3. FFmpeg
Write-Host "3. FFmpeg 检测" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

if (Test-Command "ffmpeg") {
    $ffmpegVersion = ffmpeg -version 2>&1 | Select-String "ffmpeg version" | ForEach-Object { $_.Line }
    Write-Pass "FFmpeg 已安装"
    Write-Info "$ffmpegVersion"
    
    # 检查编码器
    $encoders = ffmpeg -encoders 2>&1 | Out-String
    if ($encoders -match "libx264") {
        Write-Pass "libx264 编码器可用"
    } else {
        Write-Warn "libx264 编码器不可用，可能影响录制质量"
    }
} else {
    Write-Fail "FFmpeg 未安装"
    Write-Info "下载地址: https://www.gyan.dev/ffmpeg/builds/"
    Write-Info "请下载 ffmpeg-release-full.7z 并将 bin 目录添加到 PATH"
    $allPassed = $false
}

Write-Host ""

# 4. 摄像头检测
Write-Host "4. 摄像头检测" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

if (Test-Command "ffmpeg") {
    Write-Info "正在检测摄像头设备..."
    
    $ffmpegOutput = ffmpeg -list_devices true -f dshow -i dummy 2>&1 | Out-String
    
    # 解析视频设备
    $inVideoSection = $false
    $videoDevices = @()
    
    foreach ($line in $ffmpegOutput -split "`n") {
        if ($line -match "DirectShow video devices" -or $line -match "video devices") {
            $inVideoSection = $true
            continue
        }
        if ($line -match "DirectShow audio devices" -or $line -match "audio devices") {
            $inVideoSection = $false
            continue
        }
        if ($inVideoSection -and $line -match '"([^"]+)"' -and $line -notmatch "Alternative name") {
            $deviceName = $Matches[1]
            if ($deviceName -notmatch "Virtual|Screen Capture") {
                $videoDevices += $deviceName
            }
        }
    }
    
    if ($videoDevices.Count -gt 0) {
        Write-Pass "检测到 $($videoDevices.Count) 个摄像头设备:"
        foreach ($device in $videoDevices) {
            Write-Info "  - $device"
        }
    } else {
        Write-Warn "未检测到摄像头设备"
        Write-Info "请确保摄像头已正确连接"
        Write-Info "如果是 USB 摄像头，请尝试重新插拔"
    }
} else {
    Write-Warn "无法检测摄像头（需要 FFmpeg）"
}

Write-Host ""

# 5. 网络端口
Write-Host "5. 网络端口检测" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

$port = 3001
$tcpConnection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if ($tcpConnection) {
    $process = Get-Process -Id $tcpConnection.OwningProcess -ErrorAction SilentlyContinue
    Write-Warn "端口 $port 已被占用"
    Write-Info "占用进程: $($process.ProcessName) (PID: $($tcpConnection.OwningProcess))"
} else {
    Write-Pass "端口 $port 可用"
}

Write-Host ""

# 6. 磁盘空间
Write-Host "6. 磁盘空间检测" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

$drives = Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }

foreach ($drive in $drives) {
    $freeGB = [math]::Round($drive.FreeSpace / 1GB, 2)
    $totalGB = [math]::Round($drive.Size / 1GB, 2)
    $usedPercent = [math]::Round((1 - ($drive.FreeSpace / $drive.Size)) * 100, 1)
    
    $driveLetter = $drive.DeviceID
    if ($freeGB -ge 100) {
        Write-Pass "$driveLetter 可用空间: ${freeGB}GB / ${totalGB}GB (使用率: ${usedPercent}%)"
    } elseif ($freeGB -ge 50) {
        Write-Warn "$driveLetter 可用空间: ${freeGB}GB / ${totalGB}GB (使用率: ${usedPercent}%)"
        Write-Info "建议保留至少 100GB 用于录制"
    } else {
        Write-Fail "$driveLetter 可用空间不足: ${freeGB}GB / ${totalGB}GB"
        Write-Info "录制功能需要足够的磁盘空间"
    }
}

Write-Host ""

# 7. 权限检查
Write-Host "7. 权限检查" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

$user = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal $user
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    Write-Pass "当前以管理员权限运行"
} else {
    Write-Info "当前以普通用户权限运行"
    Write-Info "安装 Windows 服务需要管理员权限"
}

# 检查摄像头权限
$cameraPrivacy = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam" -ErrorAction SilentlyContinue
if ($cameraPrivacy -and $cameraPrivacy.Value -eq "Allow") {
    Write-Pass "摄像头访问权限已开启"
} else {
    Write-Warn "请确保已在 Windows 设置中允许应用访问摄像头"
    Write-Info "设置 > 隐私 > 摄像头 > 允许应用访问摄像头"
}

Write-Host ""

# 8. 项目文件检查
Write-Host "8. 项目文件检查" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

$requiredFiles = @(
    "backend\package.json",
    "backend\src\index.ts",
    "frontend\package.json",
    "frontend\src\App.tsx"
)

$requiredDirs = @(
    "backend",
    "frontend",
    "scripts"
)

foreach ($dir in $requiredDirs) {
    $path = Join-Path $ProjectDir $dir
    if (Test-Path $path) {
        Write-Pass "目录存在: $dir"
    } else {
        Write-Fail "目录不存在: $dir"
        $allPassed = $false
    }
}

# 检查是否已构建
$backendDist = Join-Path $ProjectDir "backend\dist"
$frontendDist = Join-Path $ProjectDir "frontend\dist"

if (Test-Path $backendDist) {
    Write-Pass "后端已构建"
} else {
    Write-Warn "后端未构建，请运行 'npm run build'"
}

if (Test-Path $frontendDist) {
    Write-Pass "前端已构建"
} else {
    Write-Warn "前端未构建，请运行 'npm run build'"
}

Write-Host ""

# 总结
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "                诊断总结" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if ($allPassed) {
    Write-Host "所有检查通过！系统满足运行条件。" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步:" -ForegroundColor Yellow
    Write-Host "  1. 运行 .\scripts\install.ps1 安装依赖和构建项目"
    Write-Host "  2. 或直接运行 启动服务.bat 启动应用"
    Write-Host "  3. 打开浏览器访问 http://localhost:3001"
} else {
    Write-Host "存在问题需要解决，请查看上方的错误信息。" -ForegroundColor Red
    Write-Host ""
    Write-Host "常见解决方案:" -ForegroundColor Yellow
    Write-Host "  - Node.js: 从 https://nodejs.org/ 下载安装"
    Write-Host "  - FFmpeg: 从 https://www.gyan.dev/ffmpeg/builds/ 下载"
    Write-Host "  - 摄像头: 检查设备管理器中是否正确识别"
}

Write-Host ""
