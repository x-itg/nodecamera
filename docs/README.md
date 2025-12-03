# USB 摄像头录制系统

一个功能完善的本地 USB 摄像头录制应用，具有现代化暗黑风格界面和自动化录制功能。

**支持平台**: Windows 10/11、Linux (Ubuntu 20.04+、Debian 10+、CentOS 8+ 没有测试)

## 功能特性

- **实时预览**: 在浏览器中实时查看摄像头画面
- **高效录制**: 基于 FFmpeg 的高压缩率 MP4 录制
- **自动分段**: 可配置的录制体积
- **存储管理**: 自动监控存储空间并清理旧文件（默认100GB限制）
- **多摄像头支持**: 自动检测并支持多个 USB 摄像头设备
- **现代化界面**: 暗黑风格的响应式 Web 界面
- **开机自启**: 系统服务形式运行，支持开机自动启动
- **实时状态**: WebSocket 实时推送录制状态
- **跨平台**: 支持 Windows 10/11 和 Linux

## 系统要求

### 硬件要求
- **USB 摄像头**（标准 UVC 协议）
- 建议 USB 3.0 接口（更好的视频传输性能）
- 建议至少 100GB 可用存储空间

### Windows 要求
- Windows 10 1903 或更高版本
- Node.js 18.x 或更高版本
- FFmpeg 4.x 或更高版本

### Linux 要求
- Ubuntu 20.04+、Debian 10+、CentOS 8+、Arch Linux
- Node.js 18.x 或更高版本
- FFmpeg 4.x 或更高版本（需支持 libx264）
- v4l-utils（用于摄像头检测）

---

## Windows 安装指南

### 环境诊断

安装前请运行诊断脚本检查环境：

```powershell
# 以管理员身份打开 PowerShell，进入项目目录
cd usb-camera-recorder
.\scripts\diagnose.ps1
```

### 快速安装

```powershell
# 以管理员身份打开 PowerShell
cd usb-camera-recorder

# 运行安装脚本
.\scripts\install.ps1
```

安装脚本将自动：
1. 检查并安装依赖（Node.js、FFmpeg）
2. 安装项目依赖
3. 构建前端和后端
4. 创建启动脚本和桌面快捷方式
5. （可选）安装 Windows 服务实现开机自启

### 手动安装

#### 1. 安装 Node.js

从 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。

#### 2. 安装 FFmpeg

方法一：手动安装
1. 访问 https://www.gyan.dev/ffmpeg/builds/
2. 下载 `ffmpeg-release-full.7z`
3. 解压到 `C:\ffmpeg`
4. 将 `C:\ffmpeg\bin` 添加到系统 PATH 环境变量

方法二：使用 Chocolatey
```powershell
choco install ffmpeg
```

方法三：使用 winget
```powershell
winget install FFmpeg
```

#### 3. 安装项目依赖

```powershell
# 后端
cd backend
npm install
npm run build

# 前端
cd ..\frontend
npm install
npm run build
```

### 启动服务

双击桌面上的 **USB摄像头录制** 快捷方式，或运行：

```powershell
cd backend
npm start
```

打开浏览器访问：http://localhost:3001

### Windows 服务管理

如果安装了 Windows 服务：

```powershell
# 查看服务状态
Get-Service "USBCameraRecorder"

# 启动服务
Start-Service "USBCameraRecorder"

# 停止服务
Stop-Service "USBCameraRecorder"

# 使用服务管理器
services.msc
```

### Windows 卸载

```powershell
# 以管理员身份运行
.\scripts\uninstall.ps1

# 保留数据卸载
.\scripts\uninstall.ps1 -KeepData
```

---

## Linux 安装指南

### 环境诊断

```bash
bash scripts/diagnose.sh
```

### 快速安装

```bash
cd usb-camera-recorder

# 运行安装脚本（需要 sudo 权限）
sudo bash scripts/install.sh
```

### 手动安装

#### 1. 安装系统依赖

Ubuntu/Debian:
```bash
sudo apt update
sudo apt install -y ffmpeg v4l-utils nodejs npm
```

CentOS/RHEL:
```bash
sudo yum install -y epel-release
sudo yum install -y ffmpeg v4l-utils nodejs npm
```

Arch Linux:
```bash
sudo pacman -Sy ffmpeg v4l-utils nodejs npm
```

#### 2. 安装项目依赖

```bash
# 后端
cd backend
npm install
npm run build

# 前端
cd ../frontend
npm install
npm run build
```

#### 3. 启动服务

开发模式:
```bash
bash scripts/start-dev.sh
```

生产模式:
```bash
cd backend
NODE_ENV=production npm start
```

### Linux 服务管理

```bash
# 查看服务状态
sudo systemctl status usb-camera-recorder

# 启动服务
sudo systemctl start usb-camera-recorder

# 停止服务
sudo systemctl stop usb-camera-recorder

# 重启服务
sudo systemctl restart usb-camera-recorder

# 查看实时日志
journalctl -u usb-camera-recorder -f

# 禁用开机自启
sudo systemctl disable usb-camera-recorder

# 启用开机自启
sudo systemctl enable usb-camera-recorder
```

### Linux 卸载

```bash
sudo bash scripts/uninstall.sh
```

---

## 使用说明

### 访问界面

安装完成后，打开浏览器访问：
```
http://localhost:3001
```

### 基本操作

1. **选择摄像头**: 在设置面板中选择要使用的摄像头设备
2. **开始录制**: 点击"开始录制"按钮
3. **控制录制**: 可以暂停、恢复或停止录制
4. **查看录制**: 在录制历史中查看和下载录制文件

### 配置说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 录制时长 | 60分钟 | 每段录制的时长，到达后自动切换下一段 |
| 存储限制 | 100GB | 最大存储空间，超出后自动删除最旧文件 |
| 视频质量 | 中等 | 低/中/高，影响压缩率和文件大小 |
| 视频分辨率 | 1280x720 | 录制视频的分辨率 |
| 帧率 | 30 FPS | 每秒帧数 |
| 自动清理 | 开启 | 是否在存储空间不足时自动删除旧文件 |

---

## 目录结构

```
usb-camera-recorder/
├── backend/                # 后端代码
│   ├── src/
│   │   ├── config/        # 配置和数据库
│   │   ├── models/        # 数据模型
│   │   ├── routes/        # API 路由
│   │   ├── services/      # 业务服务
│   │   ├── utils/         # 工具函数（跨平台支持）
│   │   └── index.ts       # 入口文件
│   └── package.json
├── frontend/              # 前端代码
│   ├── src/
│   │   ├── components/    # React 组件
│   │   ├── hooks/         # 自定义 Hooks
│   │   ├── services/      # API 服务
│   │   └── types/         # TypeScript 类型
│   └── package.json
├── scripts/               # 安装和管理脚本
│   ├── install.sh         # Linux 安装脚本
│   ├── install.ps1        # Windows 安装脚本
│   ├── uninstall.sh       # Linux 卸载脚本
│   ├── uninstall.ps1      # Windows 卸载脚本
│   ├── diagnose.sh        # Linux 诊断脚本
│   ├── diagnose.ps1       # Windows 诊断脚本
│   ├── start-dev.sh       # Linux 开发启动脚本
│   └── start-dev.ps1      # Windows 开发启动脚本
├── data/                  # 数据目录（运行时创建）
│   ├── recordings/        # 录制文件
│   └── camera-recorder.db # SQLite 数据库
└── docs/                  # 文档
```

---

## API 接口

### 摄像头管理

- `GET /api/cameras/devices` - 获取摄像头列表
- `POST /api/cameras/select` - 选择摄像头
- `POST /api/cameras/test` - 测试摄像头

### 录制管理

- `GET /api/recordings/status` - 获取录制状态
- `POST /api/recordings/start` - 开始录制
- `POST /api/recordings/stop` - 停止录制
- `POST /api/recordings/pause` - 暂停录制
- `POST /api/recordings/resume` - 恢复录制
- `GET /api/recordings/list` - 获取录制列表
- `DELETE /api/recordings/:id` - 删除录制
- `GET /api/recordings/:id/download` - 下载录制

### 配置管理

- `GET /api/config` - 获取所有配置
- `PUT /api/config/:key` - 更新配置
- `PUT /api/config` - 批量更新配置

### 视频流

- `GET /api/stream/video` - MJPEG 视频流
- `GET /api/stream/snapshot` - 获取快照

### WebSocket

连接地址: `ws://localhost:3001/ws`

消息类型:
- `status` - 状态更新
- `recordingStarted` - 录制开始
- `recordingEnded` - 录制结束
- `recordingStatus` - 录制进度

---

## 故障排除

### Windows 问题

#### 摄像头检测不到
1. 检查设备管理器中是否识别到摄像头
2. 检查 Windows 隐私设置：设置 > 隐私 > 摄像头 > 允许应用访问摄像头
3. 尝试使用其他软件测试摄像头是否正常工作
4. 更新摄像头驱动程序

#### FFmpeg 未找到
1. 确认 FFmpeg 已正确安装
2. 确认 FFmpeg 的 bin 目录已添加到 PATH
3. 重新打开命令提示符窗口
4. 运行 `ffmpeg -version` 验证

#### 端口被占用
1. 运行 `netstat -ano | findstr :3001` 查看占用进程
2. 在任务管理器中结束相关进程
3. 或在配置中更改端口号

### Linux 问题

#### 摄像头检测不到
1. 检查摄像头是否正确连接: `lsusb`
2. 检查用户是否在 video 组中：`groups` 命令查看
3. 添加用户到 video 组：`sudo usermod -aG video $USER`
4. 重新登录系统

#### 录制失败
1. 检查 FFmpeg 是否正确安装：`ffmpeg -version`
2. 检查存储空间是否充足：`df -h`
3. 查看服务日志：`journalctl -u usb-camera-recorder -n 50`

#### 无法访问界面
1. 检查服务是否运行：`sudo systemctl status usb-camera-recorder`
2. 检查端口是否被占用：`netstat -tlnp | grep 3001`
3. 检查防火墙设置

---

## 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS + Vite
- **后端**: Node.js + Express + TypeScript
- **数据库**: SQLite (better-sqlite3)
- **视频处理**: FFmpeg
- **实时通信**: WebSocket (ws)
- **跨平台**: Windows DirectShow / Linux V4L2 / macOS AVFoundation

---

## 测试验证

详细的测试验证步骤请参考：
- 通用测试指南: [TESTING.md](./TESTING.md)
- **Windows专用测试指南**: [WINDOWS-TESTING.md](./WINDOWS-TESTING.md) - 包含完整的Windows 10测试流程

### 快速验证步骤

Windows:
1. 环境诊断: `.\scripts\diagnose.ps1`
2. 启动服务: 双击桌面快捷方式
3. 访问界面: http://localhost:3001
4. 详细测试: 参考 [WINDOWS-TESTING.md](./WINDOWS-TESTING.md)

Linux:
1. 环境诊断: `bash scripts/diagnose.sh`
2. 启动服务: `bash scripts/start-dev.sh`
3. API测试: `bash scripts/test-api.sh`
4. 访问界面: http://localhost:3001

---

## 获取帮助

如遇到问题，请准备以下信息：

Windows:
```powershell
.\scripts\diagnose.ps1 > diagnose.log 2>&1
```

Linux:
```bash
bash scripts/diagnose.sh > diagnose.log 2>&1
journalctl -u usb-camera-recorder -n 100 > service.log 2>&1
```

---

## 许可证

MIT License
