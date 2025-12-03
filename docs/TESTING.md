# USB摄像头录制系统 - 测试验证指南

## 环境要求

### 硬件要求
- USB摄像头（标准 UVC 协议）
- 建议至少100GB可用存储空间
- 推荐：USB 3.0接口以获得更好性能

### Windows 要求
- **操作系统**: Windows 10 1903 或更高版本
- **Node.js**: 18.x 或更高版本
- **FFmpeg**: 4.x 或更高版本

### Linux 要求
- **操作系统**: Linux (Ubuntu 20.04+, Debian 10+, CentOS 8+, Arch Linux)
- **Node.js**: 18.x 或更高版本
- **FFmpeg**: 4.x 或更高版本
- **v4l-utils**: 用于摄像头检测

### 重要说明
此应用为**本地运行**的硬件依赖型应用，需要在具备USB摄像头的系统上测试。
在虚拟机、容器或无摄像头的系统中，部分功能将无法正常工作。

---

## Windows 测试指南

### 部署前检查清单

#### 1. 系统环境检查

```powershell
# 运行诊断脚本
.\scripts\diagnose.ps1

# 或手动检查
# 检查 Node.js 版本
node -v

# 检查 FFmpeg
ffmpeg -version
```

#### 2. 摄像头检测

```powershell
# 使用 FFmpeg 列出设备
ffmpeg -list_devices true -f dshow -i dummy 2>&1 | Select-String "video"

# 测试摄像头捕获（替换"设备名称"）
ffmpeg -f dshow -i video="设备名称" -t 5 test.mp4
```

#### 3. 权限检查

1. 打开 Windows 设置
2. 进入 隐私 > 摄像头
3. 确保"允许应用访问摄像头"已开启
4. 确保桌面应用可以访问摄像头

### Windows 功能测试

#### API 测试脚本 (PowerShell)

```powershell
# 健康检查
Invoke-RestMethod -Uri "http://localhost:3001/api/health"

# 获取摄像头列表
Invoke-RestMethod -Uri "http://localhost:3001/api/cameras/devices"

# 获取配置
Invoke-RestMethod -Uri "http://localhost:3001/api/config"

# 获取录制状态
Invoke-RestMethod -Uri "http://localhost:3001/api/recordings/status"

# 开始录制
Invoke-RestMethod -Uri "http://localhost:3001/api/recordings/start" -Method POST

# 停止录制
Invoke-RestMethod -Uri "http://localhost:3001/api/recordings/stop" -Method POST
```

### Windows 常见问题

#### 问题1：FFmpeg 未找到
```powershell
# 检查 PATH
$env:Path -split ';' | Where-Object { $_ -like "*ffmpeg*" }

# 添加到 PATH（临时）
$env:Path += ";C:\ffmpeg\bin"
```

#### 问题2：摄像头被占用
```powershell
# 检查占用摄像头的进程
Get-Process | Where-Object { $_.MainWindowTitle -like "*camera*" -or $_.Name -like "*webcam*" }

# 关闭可能占用的应用（如 Teams、Zoom、Skype）
```

#### 问题3：端口被占用
```powershell
# 检查端口占用
netstat -ano | findstr :3001

# 查看占用进程
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess
```

### Windows 服务测试

```powershell
# 检查服务状态
Get-Service "USBCameraRecorder"

# 启动服务
Start-Service "USBCameraRecorder"

# 停止服务
Stop-Service "USBCameraRecorder"

# 查看服务详情
Get-WmiObject Win32_Service | Where-Object { $_.Name -eq "USBCameraRecorder" }
```

---

## Linux 测试指南

### 部署前检查清单

#### 1. 系统环境检查

```bash
# 运行诊断脚本
bash scripts/diagnose.sh

# 或手动检查
# 检查操作系统
cat /etc/os-release

# 检查Node.js版本（需要18+）
node -v

# 检查FFmpeg是否安装
ffmpeg -version

# 检查v4l-utils
v4l2-ctl --version
```

#### 2. 摄像头检测

```bash
# 列出所有视频设备
ls /dev/video*

# 使用v4l2检测摄像头
v4l2-ctl --list-devices

# 查看摄像头详细信息（替换video0为你的设备）
v4l2-ctl -d /dev/video0 --all

# 查看支持的分辨率
v4l2-ctl -d /dev/video0 --list-formats-ext
```

#### 3. 权限检查

```bash
# 检查当前用户是否在video组
groups

# 如果不在video组，添加用户（需要重新登录生效）
sudo usermod -aG video $USER
```

### Linux 常见问题

#### 问题1：检测不到摄像头

```bash
# 检查USB设备
lsusb

# 检查内核模块
lsmod | grep uvc

# 加载UVC驱动
sudo modprobe uvcvideo
```

#### 问题2：权限不足

```bash
# 临时测试
sudo chmod 666 /dev/video0

# 永久解决
sudo usermod -aG video $USER
# 然后重新登录
```

#### 问题3：FFmpeg录制失败

```bash
# 测试FFmpeg直接录制
ffmpeg -f v4l2 -i /dev/video0 -t 5 test.mp4

# 检查错误信息
journalctl -u usb-camera-recorder -n 100
```

---

## 通用功能测试清单

### 阶段1：基础服务测试

| 测试项 | 命令/操作 | 预期结果 |
|--------|----------|----------|
| 后端启动 | 启动服务 | 服务在3001端口启动，无错误 |
| 健康检查 | 访问 `/api/health` | 返回 `{"success":true,...}` |
| 数据库初始化 | 检查数据目录 | 数据库文件存在且可读 |
| 前端加载 | 访问 `http://localhost:3001` | 页面正常显示 |

### 阶段2：摄像头功能测试

| 测试项 | API | 预期结果 |
|--------|-----|----------|
| 设备检测 | `GET /api/cameras/devices` | 返回摄像头列表 |
| 选择摄像头 | `POST /api/cameras/select` | 返回成功状态 |
| 摄像头测试 | `POST /api/cameras/test` | 返回摄像头可用状态 |
| 视频预览 | 浏览器访问界面 | 显示实时画面 |

### 阶段3：录制功能测试

| 测试项 | 操作 | 预期结果 |
|--------|------|----------|
| 开始录制 | 点击"开始录制"按钮 | 显示REC指示，状态变为"录制中" |
| 录制计时 | 观察录制时长 | 时间正确递增 |
| 文件生成 | 检查录制目录 | 生成MP4文件 |
| 暂停录制 | 点击"暂停"按钮 | 当前文件完成，状态变为"已暂停" |
| 恢复录制 | 点击"恢复"按钮 | 开始新分段录制 |
| 停止录制 | 点击"停止"按钮 | 录制结束，文件完整 |

### 阶段4：存储管理测试

| 测试项 | 操作 | 预期结果 |
|--------|------|----------|
| 存储显示 | 查看存储状态面板 | 正确显示已用/可用空间 |
| 文件列表 | 查看录制历史 | 显示所有录制记录 |
| 文件下载 | 点击下载按钮 | 成功下载MP4文件 |
| 文件删除 | 点击删除按钮 | 文件被删除 |
| 自动清理 | 设置小存储限制测试 | 旧文件被自动删除 |

### 阶段5：自动分段测试

| 测试项 | 配置 | 预期结果 |
|--------|------|----------|
| 设置短时长 | 录制时长设为1分钟 | 1分钟后自动切换分段 |
| 分段文件 | 检查recordings目录 | 生成多个分段文件 |
| 连续性 | 播放连续分段 | 内容无丢失 |

---

## 性能验证

### 录制质量测试

```bash
# 检查生成的视频文件信息
ffprobe -i recording_xxx.mp4

# 预期输出：
# - 视频编码: h264
# - 分辨率: 1280x720 (或设置的分辨率)
# - 帧率: 30fps (或设置的帧率)
```

### 系统资源监控

Windows:
```powershell
# 任务管理器查看 CPU 和内存
# 或使用 PowerShell
Get-Process node | Select-Object CPU, WorkingSet
```

Linux:
```bash
# 监控CPU和内存使用
htop

# 监控磁盘IO
iotop
```

---

## 测试报告模板

```markdown
## USB摄像头录制系统测试报告

### 测试环境
- 操作系统：Windows 10 / Linux (发行版)
- Node.js版本：
- FFmpeg版本：
- 摄像头型号：
- 测试日期：

### 测试结果

| 功能模块 | 测试结果 | 备注 |
|----------|---------|------|
| 后端启动 | 通过/失败 | |
| 摄像头检测 | 通过/失败 | |
| 视频预览 | 通过/失败 | |
| 开始录制 | 通过/失败 | |
| 暂停/恢复 | 通过/失败 | |
| 停止录制 | 通过/失败 | |
| 文件生成 | 通过/失败 | |
| 存储管理 | 通过/失败 | |
| 自动分段 | 通过/失败 | |
| 系统服务 | 通过/失败 | |

### 发现的问题


### 改进建议

```

---

## 联系支持

如在测试过程中遇到问题，请准备以下信息：

Windows:
1. 运行 `.\scripts\diagnose.ps1` 获取诊断信息
2. 摄像头设备名称
3. 应用日志

Linux:
1. 操作系统版本
2. 摄像头型号（通过 `lsusb` 获取）
3. 错误日志（`journalctl -u usb-camera-recorder -n 100`）
4. 浏览器控制台错误信息
