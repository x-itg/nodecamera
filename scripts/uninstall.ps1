# USB摄像头录制系统 - Windows 卸载脚本
# 需要以管理员权限运行

param(
    [switch]$KeepData,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

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

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  USB摄像头录制系统 - Windows 卸载" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Write-Info "项目目录: $ProjectDir"

# 确认卸载
if (-not $Force) {
    Write-Warning "此操作将卸载 USB 摄像头录制系统"
    if (-not $KeepData) {
        Write-Warning "包括删除所有录制数据！"
    }
    Write-Host ""
    $confirm = Read-Host "确认卸载? (输入 'yes' 确认)"
    if ($confirm -ne 'yes') {
        Write-Info "已取消卸载"
        exit 0
    }
}

# 步骤1: 停止服务
Write-Host ""
Write-Host "步骤 1/4: 停止服务" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

# 尝试停止 Windows 服务
if (Test-Administrator) {
    $service = Get-Service -Name "USBCameraRecorder" -ErrorAction SilentlyContinue
    if ($service) {
        Write-Info "正在停止 Windows 服务..."
        Stop-Service -Name "USBCameraRecorder" -Force -ErrorAction SilentlyContinue
        Write-Success "服务已停止"
    }
} else {
    Write-Warning "需要管理员权限来停止服务"
}

# 停止可能运行的 Node.js 进程
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*$ProjectDir*" -or $_.CommandLine -like "*usb-camera-recorder*"
}

if ($nodeProcesses) {
    Write-Info "正在停止相关进程..."
    $nodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Success "进程已停止"
} else {
    Write-Info "没有发现运行中的进程"
}

# 步骤2: 卸载服务
Write-Host ""
Write-Host "步骤 2/4: 卸载 Windows 服务" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

if (Test-Administrator) {
    # 使用 node-windows 卸载服务
    $uninstallScript = @"
const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'USB Camera Recorder',
  script: path.join(__dirname, 'dist', 'index.js')
});

svc.on('uninstall', function() {
  console.log('服务卸载完成');
});

svc.uninstall();
"@
    
    $uninstallScriptPath = "$ProjectDir\backend\uninstall-service.js"
    
    # 检查 node-windows 是否安装
    $nodeWindowsPath = "$ProjectDir\backend\node_modules\node-windows"
    if (Test-Path $nodeWindowsPath) {
        Set-Content -Path $uninstallScriptPath -Value $uninstallScript -Encoding UTF8
        
        try {
            Set-Location "$ProjectDir\backend"
            node $uninstallScriptPath
            Write-Success "Windows 服务已卸载"
            
            # 清理卸载脚本
            Remove-Item -Path $uninstallScriptPath -Force -ErrorAction SilentlyContinue
        }
        catch {
            Write-Warning "服务卸载失败: $_"
        }
    } else {
        Write-Info "未安装 node-windows，跳过服务卸载"
    }
    
    # 备用方法：使用 sc 命令
    $service = Get-Service -Name "USBCameraRecorder" -ErrorAction SilentlyContinue
    if ($service) {
        Write-Info "使用 sc 命令删除服务..."
        sc.exe delete "USBCameraRecorder"
        Write-Success "服务已删除"
    }
} else {
    Write-Warning "需要管理员权限来卸载服务"
}

# 步骤3: 删除快捷方式
Write-Host ""
Write-Host "步骤 3/4: 删除快捷方式" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

# 删除桌面快捷方式
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$desktopPath\USB摄像头录制.lnk"

if (Test-Path $shortcutPath) {
    Remove-Item -Path $shortcutPath -Force
    Write-Success "已删除桌面快捷方式"
} else {
    Write-Info "未找到桌面快捷方式"
}

# 删除启动脚本
$startScriptPath = "$ProjectDir\启动服务.bat"
if (Test-Path $startScriptPath) {
    Remove-Item -Path $startScriptPath -Force
    Write-Success "已删除启动脚本"
}

# 步骤4: 删除数据
Write-Host ""
Write-Host "步骤 4/4: 清理数据" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

if (-not $KeepData) {
    $dataDir = "$env:LOCALAPPDATA\usb-camera-recorder"
    
    if (Test-Path $dataDir) {
        # 统计数据大小
        $size = (Get-ChildItem -Path $dataDir -Recurse | Measure-Object -Property Length -Sum).Sum
        $sizeMB = [math]::Round($size / 1MB, 2)
        
        Write-Info "数据目录大小: ${sizeMB}MB"
        
        if (-not $Force) {
            $confirmData = Read-Host "确认删除数据目录? (y/n)"
            if ($confirmData -ne 'y') {
                Write-Info "保留数据目录"
            } else {
                Remove-Item -Path $dataDir -Recurse -Force
                Write-Success "已删除数据目录"
            }
        } else {
            Remove-Item -Path $dataDir -Recurse -Force
            Write-Success "已删除数据目录"
        }
    } else {
        Write-Info "数据目录不存在"
    }
} else {
    Write-Info "保留数据目录 (使用了 -KeepData 参数)"
}

# 完成
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "          卸载完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

if ($KeepData) {
    Write-Info "数据目录已保留: $env:LOCALAPPDATA\usb-camera-recorder"
}

Write-Info "如需重新安装，请运行: .\scripts\install.ps1"
Write-Host ""

Set-Location $ProjectDir
