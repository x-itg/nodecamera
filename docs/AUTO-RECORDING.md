# 自动启动录制功能使用指南

## 功能说明

开机自动启动录制功能允许服务启动后立即开始录制选定的摄像头，无需手动点击"开始录制"按钮。

## 快速启用

### 方法 1：运行配置脚本（推荐）

```powershell
cd backend
node setup-auto-recording.js
```

这会自动配置：
- ✅ 启用自动启动 (`auto_start = true`)
- ✅ 设置默认摄像头（如果未设置）
- ✅ 配置录制参数（分辨率、帧率、质量）

### 方法 2：使用 Web 界面

1. 启动服务：`npm run dev`
2. 打开浏览器：http://localhost:3000
3. 进入"设置"面板
4. 勾选"开机自动启动录制"
5. 选择摄像头设备
6. 点击"保存设置"
7. 重启服务

### 方法 3：手动设置配置

```javascript
// 在 backend 目录运行
node -e "require('./dist/config/database').setConfig('auto_start', 'true')"
node -e "require('./dist/config/database').setConfig('selected_camera', 'video=USB2.0 UVC PC Camera')"
```

## 验证配置

运行测试脚本检查配置是否正确：

```powershell
cd backend
node test-auto-start.js
```

应该看到：
```
✅ auto_start 已启用
✅ 已选择摄像头: video=USB2.0 UVC PC Camera
✅ 硬件已就绪
```

## 工作流程

1. **服务启动时**
   - 读取 `auto_start` 配置
   - 如果为 `true`，启动自动录制服务
   - 立即检查硬件状态

2. **硬件检查**（每 5 秒）
   - 检查摄像头是否可用
   - 检查是否已选择摄像头
   - 如果硬件就绪且未在录制，自动开始录制

3. **自动录制**
   - 使用配置的分辨率、帧率、质量参数
   - 按配置的时长分段录制
   - 超过存储限制时自动清理旧文件（如果启用）

## 配置参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `auto_start` | 是否自动启动录制 | `false` |
| `selected_camera` | 摄像头设备路径 | 空 |
| `video_resolution` | 视频分辨率 | `1280x720` |
| `video_fps` | 帧率 | `30` |
| `video_quality` | 视频质量 | `medium` |
| `recording_duration` | 录制时长（秒/段） | `3600` (60分钟) |
| `storage_limit` | 存储限制（字节） | `107374182400` (100GB) |
| `auto_cleanup` | 自动清理旧文件 | `false` |

## 查看配置

```powershell
cd backend
node check-auto-recording.js
```

## 日志监控

启动服务后，观察以下日志：

```
[AutoRecording] 启动自动录制服务检查...
[AutoRecordingService] 启动自动录制服务
[AutoRecordingService] 硬件就绪: USB2.0 UVC PC Camera
[AutoRecordingService] 开始自动录制: video=USB2.0 UVC PC Camera
[AutoRecordingService] 自动录制启动成功
```

如果看到：
```
[AutoRecordingService] 自动录制未启用，跳过启动
```
说明 `auto_start` 配置为 `false`，需要重新配置。

## 故障排查

### 问题：服务启动但未自动录制

**检查配置：**
```powershell
node test-auto-start.js
```

**可能原因：**
1. `auto_start` 未启用 → 运行 `node setup-auto-recording.js`
2. 未选择摄像头 → 在 Web 界面选择摄像头或手动设置
3. 摄像头不可用 → 检查设备是否连接，运行 `node check-auto-recording.js`

### 问题：录制启动但立即停止

**检查 FFmpeg 日志：**
- 查看终端输出是否有 FFmpeg 错误
- 检查摄像头设备名称是否正确

**验证设备：**
```powershell
ffmpeg -list_devices true -f dshow -i dummy
```

### 问题：配置更改后未生效

**解决方案：**
- 重启服务（修改配置后必须重启）
- 检查数据库文件：`backend/data.db`

## 开机自动启动（Windows）

要实现 Windows 开机自动启动并录制：

1. **创建启动脚本** `start-recording.bat`：
```batch
@echo off
cd /d D:\z\tlGZ\canode\backend
start /min npm run dev
```

2. **添加到启动项**：
   - Win + R → `shell:startup`
   - 复制 `start-recording.bat` 到打开的文件夹

3. **验证**：
   - 重启电脑
   - 检查服务是否自动运行并开始录制

## API 接口

### 获取自动录制状态
```
GET /api/auto-recording/status
```

### 更新自动录制配置
```
POST /api/auto-recording/config
Content-Type: application/json

{
  "auto_start": true,
  "selected_camera": "video=USB2.0 UVC PC Camera",
  "video_resolution": "1280x720",
  "video_fps": "30",
  "recording_duration": 3600
}
```

## 最佳实践

1. **测试环境**：先在测试环境验证自动录制配置正确
2. **监控日志**：定期检查日志确认录制正常
3. **存储管理**：启用自动清理或定期手动清理旧录制
4. **备份配置**：备份 `data.db` 文件保存配置
5. **摄像头验证**：确保摄像头设备名称稳定（某些 USB 设备可能变化）

## 示例

### 完整配置流程

```powershell
# 1. 进入后端目录
cd D:\z\tlGZ\canode\backend

# 2. 运行配置脚本
node setup-auto-recording.js

# 3. 验证配置
node test-auto-start.js

# 4. 启动服务
npm run dev

# 5. 观察日志确认自动录制启动
# 应该看到：[AutoRecordingService] 自动录制启动成功
```

### 禁用自动录制

```powershell
# 临时禁用（重启失效）
# 在 Web 界面取消勾选"开机自动启动录制"

# 永久禁用
node -e "require('./dist/config/database').setConfig('auto_start', 'false')"
```

## 技术细节

### 检查间隔
- 默认每 5 秒检查一次硬件状态
- 可在 `autoRecordingService.ts` 中修改 `checkInterval`

### 硬件检查逻辑
1. 检测所有摄像头
2. 验证选中的摄像头存在
3. 确认摄像头状态为 `available`
4. 如果通过，启动录制

### 自动重启
- 如果录制意外停止，服务会在下次检查时尝试重新启动
- 最大录制时长到期后自动停止，下次检查时重新开始

## 相关文件

- `backend/src/services/autoRecordingService.ts` - 核心服务
- `backend/src/index.ts` - 服务启动入口
- `backend/setup-auto-recording.js` - 快速配置脚本
- `backend/test-auto-start.js` - 测试脚本
- `backend/check-auto-recording.js` - 状态检查脚本
- `frontend/src/components/SettingsPanel.tsx` - Web 界面设置
