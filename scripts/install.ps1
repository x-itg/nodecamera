# USB摄像头录制系统 - Windows 10 安装脚本
# 需要以管理员权限运行

param(
    [switch]$SkipDependencies,
    [switch]$SkipBuild,
    [switch]$SkipService
)

$ErrorActionPreference = "Stop"

# 颜色输出
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Success($message) {
    Write-ColorOutput Green "[成功] $message"
}

function Write-Info($message) {
    Write-ColorOutput Cyan "[信息] $message"
}

function Write-Warning($message) {
    Write-ColorOutput Yellow "[警告] $message"
}

function Write-Error($message) {
    Write-ColorOutput Red "[错误] $message"
}

# 检查管理员权限
function Test-Administrator {
    $user = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal $user
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 检查命令是否存在
function Test-Command($command) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try {
        if (Get-Command $command) { return $true }
    }
    catch { return $false }
    finally { $ErrorActionPreference = $oldPreference }
}

# 主安装脚本
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  USB摄像头录制系统 - Windows 10 安装" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限（安装服务时需要）
if (-not $SkipService -and -not (Test-Administrator)) {
    Write-Warning "建议以管理员权限运行此脚本以安装Windows服务"
    Write-Info "如果不需要开机自启服务，可以继续"
    $continue = Read-Host "是否继续? (y/n)"
    if ($continue -ne 'y') {
        exit 1
    }
}

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Write-Info "项目目录: $ProjectDir"

# 步骤1: 检查依赖
Write-Host ""
Write-Host "步骤 1/5: 检查依赖" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

# 检查 Node.js
if (Test-Command "node") {
    $nodeVersion = node --version
    Write-Success "Node.js 已安装: $nodeVersion"
} else {
    Write-Error "Node.js 未安装"
    Write-Info "请从 https://nodejs.org/ 下载并安装 Node.js LTS 版本"
    exit 1
}

# 检查 npm
if (Test-Command "npm") {
    $npmVersion = npm --version
    Write-Success "npm 已安装: $npmVersion"
} else {
    Write-Error "npm 未安装"
    exit 1
}

# 检查 FFmpeg
if (Test-Command "ffmpeg") {
    $ffmpegVersion = ffmpeg -version 2>&1 | Select-String "ffmpeg version" | ForEach-Object { $_.Line }
    Write-Success "FFmpeg 已安装: $ffmpegVersion"
} else {
    Write-Error "FFmpeg 未安装"
    Write-Info ""
    Write-Info "请按以下步骤安装 FFmpeg:"
    Write-Info "1. 访问 https://www.gyan.dev/ffmpeg/builds/"
    Write-Info "2. 下载 ffmpeg-release-full.7z"
    Write-Info "3. 解压到 C:\ffmpeg"
    Write-Info "4. 将 C:\ffmpeg\bin 添加到系统 PATH 环境变量"
    Write-Info "5. 重新打开命令提示符并重新运行此脚本"
    Write-Host ""
    
    $installFFmpeg = Read-Host "是否自动下载并安装 FFmpeg? (y/n)"
    if ($installFFmpeg -eq 'y') {
        Write-Info "正在下载 FFmpeg..."
        
        # 创建临时目录
        $tempDir = "$env:TEMP\ffmpeg-install"
        New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
        
        # 下载 FFmpeg
        $ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        $ffmpegZip = "$tempDir\ffmpeg.zip"
        
        try {
            Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip -UseBasicParsing
            Write-Success "FFmpeg 下载完成"
            
            # 解压
            Write-Info "正在解压 FFmpeg..."
            Expand-Archive -Path $ffmpegZip -DestinationPath $tempDir -Force
            
            # 找到解压后的目录
            $ffmpegDir = Get-ChildItem -Path $tempDir -Directory | Where-Object { $_.Name -like "ffmpeg-*" } | Select-Object -First 1
            
            # 移动到 C:\ffmpeg
            $targetDir = "C:\ffmpeg"
            if (Test-Path $targetDir) {
                Remove-Item -Path $targetDir -Recurse -Force
            }
            Move-Item -Path "$($ffmpegDir.FullName)\bin" -Destination $targetDir
            
            # 添加到 PATH
            $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
            if ($currentPath -notlike "*C:\ffmpeg*") {
                [Environment]::SetEnvironmentVariable("Path", "$currentPath;C:\ffmpeg", "Machine")
                $env:Path = "$env:Path;C:\ffmpeg"
                Write-Success "FFmpeg 已添加到系统 PATH"
            }
            
            Write-Success "FFmpeg 安装完成"
            
            # 清理
            Remove-Item -Path $tempDir -Recurse -Force
        }
        catch {
            Write-Error "FFmpeg 下载失败: $_"
            Write-Info "请手动安装 FFmpeg"
            exit 1
        }
    } else {
        exit 1
    }
}

# 检查摄像头
Write-Info "正在检测摄像头设备..."
try {
    $ffmpegOutput = ffmpeg -list_devices true -f dshow -i dummy 2>&1 | Out-String
    if ($ffmpegOutput -match '"([^"]+)"' -and $ffmpegOutput -match "video devices") {
        Write-Success "检测到视频设备"
    } else {
        Write-Warning "未检测到视频设备，请确保摄像头已连接"
    }
}
catch {
    Write-Warning "无法检测摄像头设备"
}

if (-not $SkipDependencies) {
    # 步骤2: 安装项目依赖
    Write-Host ""
    Write-Host "步骤 2/5: 安装项目依赖" -ForegroundColor Yellow
    Write-Host "-------------------------------------------"

    # 安装后端依赖
    Write-Info "安装后端依赖..."
    Set-Location "$ProjectDir\backend"
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Success "后端依赖安装完成"
    } else {
        Write-Error "后端依赖安装失败"
        exit 1
    }

    # 安装前端依赖
    Write-Info "安装前端依赖..."
    Set-Location "$ProjectDir\frontend"
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Success "前端依赖安装完成"
    } else {
        Write-Error "前端依赖安装失败"
        exit 1
    }
} else {
    Write-Info "跳过依赖安装"
}

if (-not $SkipBuild) {
    # 步骤3: 构建项目
    Write-Host ""
    Write-Host "步骤 3/5: 构建项目" -ForegroundColor Yellow
    Write-Host "-------------------------------------------"

    # 构建后端
    Write-Info "构建后端..."
    Set-Location "$ProjectDir\backend"
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Success "后端构建完成"
    } else {
        Write-Error "后端构建失败"
        exit 1
    }

    # 构建前端
    Write-Info "构建前端..."
    Set-Location "$ProjectDir\frontend"
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Success "前端构建完成"
    } else {
        Write-Error "前端构建失败"
        exit 1
    }
} else {
    Write-Info "跳过项目构建"
}

# 步骤4: 创建数据目录
Write-Host ""
Write-Host "步骤 4/5: 创建数据目录" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

$dataDir = "$env:LOCALAPPDATA\usb-camera-recorder"
$recordingsDir = "$dataDir\recordings"

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    Write-Success "创建数据目录: $dataDir"
}

if (-not (Test-Path $recordingsDir)) {
    New-Item -ItemType Directory -Force -Path $recordingsDir | Out-Null
    Write-Success "创建录制目录: $recordingsDir"
}

# 步骤5: 创建启动脚本
Write-Host ""
Write-Host "步骤 5/5: 创建启动脚本" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

# 创建启动脚本
$startScript = @"
@echo off
cd /d "$ProjectDir\backend"
echo 正在启动 USB 摄像头录制服务...
echo 访问地址: http://localhost:3001
echo.
echo 按 Ctrl+C 停止服务
echo.
node dist/index.js
pause
"@

$startScriptPath = "$ProjectDir\启动服务.bat"
Set-Content -Path $startScriptPath -Value $startScript -Encoding UTF8
Write-Success "创建启动脚本: $startScriptPath"

# 创建桌面快捷方式
$desktopPath = [Environment]::GetFolderPath("Desktop")
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$desktopPath\USB摄像头录制.lnk")
$Shortcut.TargetPath = $startScriptPath
$Shortcut.WorkingDirectory = "$ProjectDir\backend"
$Shortcut.Description = "USB摄像头录制系统"
$Shortcut.Save()
Write-Success "创建桌面快捷方式"

# 如果需要安装Windows服务
if (-not $SkipService -and (Test-Administrator)) {
    Write-Host ""
    Write-Host "安装 Windows 服务" -ForegroundColor Yellow
    Write-Host "-------------------------------------------"
    
    Set-Location "$ProjectDir\backend"
    
    # 安装 node-windows 依赖
    Write-Info "正在安装 node-windows 依赖..."
    npm install node-windows --save
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "node-windows 安装失败"
        Write-Info "您可以稍后手动安装服务:"
        Write-Info "  cd backend"
        Write-Info "  npm install node-windows"
        Write-Info "  npm run service:install"
    } else {
        Write-Success "node-windows 安装成功"
        
        # 检查服务安装脚本是否存在
        $serviceScriptPath = "$ProjectDir\backend\scripts\install-service.js"
        if (Test-Path $serviceScriptPath) {
            # 运行服务安装
            Write-Info "正在安装 Windows 服务..."
            node $serviceScriptPath
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Windows 服务安装完成"
                Write-Info "服务名称: USB Camera Recorder"
                Write-Info "可以通过 services.msc 管理服务"
                Write-Info ""
                Write-Info "服务管理命令:"
                Write-Info "  启动: Start-Service 'USB Camera Recorder'"
                Write-Info "  停止: Stop-Service 'USB Camera Recorder'"
                Write-Info "  状态: Get-Service 'USB Camera Recorder'"
            } else {
                Write-Warning "Windows 服务安装失败"
                Write-Info "您可以稍后手动安装:"
                Write-Info "  cd backend && npm run service:install"
            }
        } else {
            Write-Warning "服务安装脚本不存在，跳过服务安装"
            Write-Info "您可以稍后手动安装:"
            Write-Info "  cd backend && npm run service:install"
        }
    }
}

# 完成
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "          安装完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Info "使用方法:"
Write-Host "  1. 双击桌面上的 'USB摄像头录制' 快捷方式" -ForegroundColor White
Write-Host "  2. 或运行: $startScriptPath" -ForegroundColor White
Write-Host "  3. 打开浏览器访问: http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Info "数据目录: $dataDir"
Write-Info "录制目录: $recordingsDir"
Write-Host ""

# 询问是否立即启动
$startNow = Read-Host "是否立即启动服务? (y/n)"
if ($startNow -eq 'y') {
    Start-Process $startScriptPath
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3001"
}

Set-Location $ProjectDir
