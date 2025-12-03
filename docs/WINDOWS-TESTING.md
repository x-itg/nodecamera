# USB摄像头录制系统 - Windows 10 测试验证指南

本文档提供完整的 Windows 10 环境测试步骤，帮助验证所有功能正常工作。

FFMPEG对USB适配进行解码编码存储，将FFMPEG的循环操作放到一个子线程中隔离起来，通过数据流输机制将FFMPEG循环操作过程中解码的单帧图像传到主线程中进行预览图的绘制：这样实现预览和录制同时进行；

好的！这是一个很好的架构设计。我会实现一个统一的媒体流服务，使用单个 FFmpeg 进程同时处理预览和录制。核心思路是：

单个 FFmpeg 进程从摄像头读取
使用 tee 或多输出同时生成：
MJPEG 流（通过 pipe 输出）用于浏览器预览
MP4 文件用于录制存储
事件机制在录制服务和流服务之间通信

文件无法打开说明 FFmpeg 没有正确写入文件。让我检查问题：

文件大小 0 B - FFmpeg 可能没有成功启动或立即崩溃
录制时长 00:00:00 - 进度事件没有被前端接收或处理
让我先检查日志，看看 FFmpeg 是否有错误。但更重要的是，我意识到一个严重的问题：

当我们"开始录制"时，只是创建了数据库记录，但 FFmpeg 早就在运行了，它一直在写入文件！ 这意味着：

预览时：FFmpeg 写入 recording_xxx.mp4（但没有数据库记录）
点击录制：创建数据库记录，但指向的是同一个文件，而这个文件已经在被写入了
停止录制时：FFmpeg 重启，生成新文件名
这个架构有问题。让我重新思考：我们需要让 FFmpeg 只在真正需要录制时才写入文件。

最简单的方案是：使用 FFmpeg 的 tee muxer 或者 segment muxer，或者更简单的：在点击录制时才启动文件输出。

让我修改为更合理的方案：预览时只输出 MJPEG，录制时才重启添加 MP4 输出。这样虽然有 1 秒延迟，但至少文件是正确的：

现在我明白问题了。架构有根本性错误：FFmpeg 总是在写入 MP4 文件，即使在预览模式下。这导致：

预览时生成空白 MP4 文件
点击录制时，文件已经存在且可能损坏
文件大小为 0 是因为 FFmpeg 可能因为参数问题崩溃了
让我修复为正确的架构：预览时只输出 MJPEG，录制时才添加 MP4 输出：

预览模式：只输出 MJPEG 流到 pipe:1，不写入任何文件
录制模式：同时输出 MP4 文件和 MJPEG 流（双输出）
切换录制：通过重启 FFmpeg 来切换模式（虽然有 1 秒延迟，但保证文件正确）

## 测试环境要求

### 硬件
- Windows 10 1903 或更高版本
- USB 摄像头（任意品牌，支持 UVC 协议）
- 至少 50GB 可用磁盘空间

### 软件
- Node.js 18.x 或更高版本
- FFmpeg 4.x 或更高版本

---

## 第一阶段：环境验证

### 1.1 运行诊断脚本

```powershell
# 以管理员身份打开 PowerShell
cd usb-camera-recorder
.\scripts\diagnose.ps1
```

**预期结果：**
- [√] Node.js 已安装: v18.x.x 或更高
- [√] FFmpeg 已安装
- [√] 检测到视频设备
- [√] 端口 3001 可用

**如果失败：**
- Node.js 缺失：访问 https://nodejs.org/ 安装
- FFmpeg 缺失：运行 `.\scripts\install.ps1` 自动安装

### 1.2 验证 FFmpeg 摄像头检测

```powershell
ffmpeg -list_devices true -f dshow -i dummy 2>&1 | Select-String "video"

winget install --id=Gyan.FFmpeg -e --source winget

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); & ffmpeg -f dshow -video_size 640x480 -framerate 30 -i "video=USB2.0 UVC PC Camera" -f mjpeg -q:v 5 -frames:v 1 test.jpg 2>&1 | Select-Object -Last 30

& ffmpeg -f dshow -list_options true -i "video=USB2.0 UVC PC Camera" 2>&1 | Select-String -Pattern "pixel_format|min s=|max s=" | Select-Object -First 20
```

**预期结果：**
```
[dshow @ ...] DirectShow video devices
[dshow @ ...]  "您的摄像头名称"
```

**如果失败：**
- 检查设备管理器中的摄像头状态
- 确保摄像头驱动已安装
- 检查隐私设置是否允许摄像头访问

### 1.3 测试 FFmpeg 录制能力

```powershell
# 替换 "摄像头名称" 为您的实际设备名
ffmpeg -f dshow -i video="摄像头名称" -t 5 -c:v libx264 test_video.mp4

# 检查生成的文件
dir test_video.mp4
ffprobe test_video.mp4
```

**预期结果：**
- 生成 test_video.mp4 文件
- ffprobe 显示视频信息（编码、分辨率、时长）

---

## 第二阶段：应用安装验证

### 2.1 安装依赖

```powershell
cd usb-camera-recorder\backend
npm install

cd ..\frontend
npm install
```

**预期结果：**
- 无错误信息
- node_modules 目录创建成功

### 2.2 构建项目

```powershell
cd usb-camera-recorder\backend
npm run build

cd ..\frontend
npm run build
```

**预期结果：**
- 后端 dist 目录创建
- 前端 dist 目录创建

### 2.3 启动服务

```powershell
cd usb-camera-recorder\backend
npm start
```

**预期结果：**
```
==========================================
  USB摄像头录制系统
==========================================

平台: windows
架构: x64
Node: v18.x.x
数据目录: C:\Users\...\AppData\Local\usb-camera-recorder

FFmpeg: x.x.x

------------------------------------------
服务已启动
地址: http://localhost:3001
API:  http://localhost:3001/api
WS:   ws://localhost:3001/ws
------------------------------------------
```

---

## 第三阶段：功能测试

### 3.1 API 测试

打开另一个 PowerShell 窗口执行：

```powershell
# 健康检查
Invoke-RestMethod -Uri "http://localhost:3001/api/health"

# 预期结果
# success : True
# message : USB摄像头录制服务运行正常
# timestamp : 2024-xx-xxTxx:xx:xx.xxxZ
# platform : windows
```

```powershell
# 获取摄像头列表
$cameras = Invoke-RestMethod -Uri "http://localhost:3001/api/cameras/devices"
$cameras.data | Format-Table

# 预期结果：显示检测到的摄像头列表
```

```powershell
# 选择摄像头（使用上一步返回的设备路径）
$body = @{ devicePath = "video=您的摄像头名称" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/cameras/select" -Method POST -Body $body -ContentType "application/json"
```

### 3.2 界面测试

1. 打开浏览器访问 http://localhost:3001
2. 检查以下功能：

| 功能 | 测试步骤 | 预期结果 |
|------|---------|----------|
| 页面加载 | 访问首页 | 显示暗黑主题界面 |
| 摄像头列表 | 查看设备选择 | 显示检测到的摄像头 |
| 实时预览 | 选择摄像头后 | 显示视频画面 |
| 开始录制 | 点击录制按钮 | 显示REC指示和计时 |
| 停止录制 | 点击停止按钮 | 录制结束，文件保存 |
| 录制历史 | 查看历史列表 | 显示录制文件 |
| 下载文件 | 点击下载 | 成功下载MP4 |
| 设置 | 修改配置 | 配置保存成功 |

### 3.3 录制文件验证

```powershell
# 检查录制目录
$dataDir = "$env:LOCALAPPDATA\usb-camera-recorder\recordings"
dir $dataDir

# 验证视频文件
ffprobe "$dataDir\recording_xxxx.mp4"
```

**预期结果：**
- 视频编码: h264
- 分辨率: 配置的分辨率
- 时长: 录制时长

---

## 第四阶段：Windows 服务测试

### 4.1 安装服务

```powershell
# 以管理员身份运行
cd usb-camera-recorder\backend
npm install node-windows
npm run service:install
```

**预期结果：**
- 服务安装成功
- 服务自动启动

### 4.2 验证服务

```powershell
# 查看服务状态
Get-Service "USB Camera Recorder"

# 预期结果
# Status   Name                    DisplayName
# ------   ----                    -----------
# Running  USB Camera Recorder     USB Camera Recorder
```

```powershell
# 打开服务管理器验证
services.msc
# 找到 "USB Camera Recorder" 服务
```

### 4.3 服务控制

```powershell
# 停止服务
Stop-Service "USB Camera Recorder"

# 启动服务
Start-Service "USB Camera Recorder"

# 重启服务
Restart-Service "USB Camera Recorder"
```

### 4.4 开机自启验证

1. 重启电脑
2. 登录后检查服务状态
3. 访问 http://localhost:3001 验证

### 4.5 卸载服务

```powershell
cd usb-camera-recorder\backend
npm run service:uninstall
```

---

## 第五阶段：问题排查

### 5.1 常见问题

#### 摄像头检测不到

```powershell
# 检查设备管理器
devmgmt.msc
# 查看 "图像设备" 或 "摄像头" 下是否有设备

# 检查Windows隐私设置
ms-settings:privacy-webcam

# 尝试直接使用FFmpeg测试
ffmpeg -list_devices true -f dshow -i dummy 2>&1
```

#### FFmpeg 命令失败

```powershell
# 检查FFmpeg版本
ffmpeg -version

# 检查编码器
ffmpeg -encoders 2>&1 | Select-String "libx264"

# 测试简单录制
ffmpeg -f dshow -i video="设备名称" -t 3 -f null NUL
```

#### 端口被占用

```powershell
# 查找占用进程
netstat -ano | findstr :3001
Get-Process -Id <PID>

# 结束进程或更改端口
```

#### 服务安装失败

```powershell
# 确保以管理员身份运行
# 检查node-windows是否安装
npm list node-windows

# 手动安装
npm install node-windows --save

# 检查构建产物
Test-Path "dist\index.js"
```

### 5.2 收集诊断信息

```powershell
# 生成诊断报告
.\scripts\diagnose.ps1 > diagnose-report.txt 2>&1

# 收集FFmpeg设备信息
ffmpeg -list_devices true -f dshow -i dummy 2>&1 > ffmpeg-devices.txt

# 收集系统信息
systeminfo > system-info.txt
```

---

## 测试报告模板

请填写以下测试结果：

```
## Windows 10 测试报告

### 测试环境
- Windows 版本：
- Node.js 版本：
- FFmpeg 版本：
- 摄像头型号：
- 测试日期：

### 测试结果

| 测试项 | 结果 | 备注 |
|--------|------|------|
| 环境诊断 | 通过/失败 | |
| FFmpeg摄像头检测 | 通过/失败 | |
| FFmpeg录制测试 | 通过/失败 | |
| 依赖安装 | 通过/失败 | |
| 项目构建 | 通过/失败 | |
| 服务启动 | 通过/失败 | |
| API健康检查 | 通过/失败 | |
| 摄像头列表API | 通过/失败 | |
| 界面加载 | 通过/失败 | |
| 实时预览 | 通过/失败 | |
| 开始录制 | 通过/失败 | |
| 停止录制 | 通过/失败 | |
| 文件生成 | 通过/失败 | |
| Windows服务安装 | 通过/失败 | |
| 开机自启 | 通过/失败 | |

### 发现的问题

(描述遇到的问题，包括错误信息、复现步骤等)

### 建议改进

(提供改进建议)
```

---

## 问题反馈

如遇到问题，请提供：
1. 测试报告（按上述模板填写）
2. 诊断脚本输出 (`diagnose-report.txt`)
3. FFmpeg设备列表 (`ffmpeg-devices.txt`)
4. 相关错误截图
5. 浏览器控制台错误信息（F12 打开）
