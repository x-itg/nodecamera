# 循环录制功能使用说明

## 功能概述

系统现在支持智能循环录制，根据前端是否介入来决定录制行为：

### 模式 1：后台自动循环录制（前端未介入）
- ✅ 服务启动后自动开始录制（如果 `auto_start=true`）
- ✅ 每个文件最大 100MB
- ✅ 文件达到 100MB 自动完成当前段，立即开始下一段
- ✅ 无缝循环，不中断录制
- ✅ 接近存储上限（90%）自动删除最旧文件

### 模式 2：手动控制录制（前端介入）
- ✅ 用户点击"停止录制" → 停止录制，**不再自动重启**
- ✅ 用户点击"开始录制" → 恢复循环录制（每 100MB 一段）
- ✅ 手动控制优先级高于自动录制

## 核心机制

### 1. 手动干预标志 (`manualStop`)
- **false**（默认）：允许自动循环录制
- **true**：用户手动停止，禁止自动重启

### 2. 文件大小监控
- 每秒检查当前录制文件大小
- 达到 100MB 触发分段逻辑：
  1. 完成当前文件（更新数据库）
  2. 触发 `recordingEnded` 事件
  3. 自动开始下一段（如果 `manualStop=false`）

### 3. 存储空间管理
- 录制开始前检查存储使用情况
- 使用超过 90%：自动删除最旧文件
- 删除到 80% 以下停止
- 按创建时间排序（最旧的先删）

## API 变化

### 开始录制
```http
POST /api/recording/start
Content-Type: application/json

{
  "cameraPath": "video=USB2.0 UVC PC Camera"  // 可选
}
```

**行为变化**：
- ✅ 清除 `manualStop` 标志
- ✅ 开始循环录制
- ✅ 自动清理存储（如果需要）

### 停止录制
```http
POST /api/recording/stop
```

**行为变化**：
- ✅ 设置 `manualStop=true`
- ✅ 停止当前录制
- ✅ **不再自动重启**（关键！）

## 使用场景

### 场景 1：无人值守监控
```
1. 配置 auto_start=true
2. 启动服务
3. 自动开始录制
4. 每 100MB 一个文件，循环录制
5. 存储满时自动删除旧文件
```

**配置方法**：
```bash
cd backend
node setup-auto-recording.js
npm run dev
```

### 场景 2：手动控制录制
```
1. Web 界面点击"开始录制"
2. 录制进行中...（每 100MB 自动分段）
3. 点击"停止录制"
4. 录制停止，不再自动重启
5. 需要时再次点击"开始录制"
```

### 场景 3：临时暂停自动录制
```
1. 后台正在自动循环录制
2. 前端点击"停止录制"
3. manualStop=true，停止录制
4. 后台不再自动重启（即使 auto_start=true）
5. 前端点击"开始录制"恢复
```

## 配置参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `auto_start` | 服务启动时自动录制 | `false` |
| `selected_camera` | 默认摄像头 | 空 |
| `storage_limit` | 存储上限（字节） | `107374182400` (100GB) |
| 文件大小限制 | 每个文件最大 | `104857600` (100MB，代码写死) |

## 技术实现

### autoRecordingService
```typescript
class AutoRecordingService {
  private manualStop = false; // 手动停止标志
  
  // 用户手动停止（设置标志）
  async userStopRecording() {
    this.manualStop = true;
    // 停止录制...
  }
  
  // 用户手动开始（清除标志）
  async userStartRecording() {
    this.manualStop = false;
    // 开始录制...
    this.setupRecordingCompletionHandler(); // 监听文件完成
  }
  
  // 监听录制完成事件
  setupRecordingCompletionHandler() {
    unifiedMediaService.once('recordingEnded', async () => {
      if (!this.manualStop) {
        // 自动开始下一段
        await this.startAutoRecording();
      }
    });
  }
}
```

### unifiedMediaService
```typescript
class UnifiedMediaService {
  private startRecordingProgressTimer() {
    setInterval(() => {
      // 检查文件大小
      const stats = fs.statSync(this.state.recordingFilePath);
      
      if (stats.size >= 100 * 1024 * 1024) {
        // 达到 100MB
        this.finishCurrentSegmentAndStartNext();
      }
    }, 1000);
  }
  
  private async finishCurrentSegmentAndStartNext() {
    // 更新数据库
    RecordingModel.updateRecording(recordingId, {
      status: 'completed',
      duration,
      file_size
    });
    
    // 触发事件
    this.emit('recordingEnded', { reason: 'size_limit' });
    
    // 重启 FFmpeg 开始新段
    await this.restartFFmpeg(device, true);
  }
}
```

## 日志监控

启动服务后观察以下日志：

### 正常循环录制
```
[AutoRecordingService] 启动自动录制服务
[AutoRecordingService] 模式: 每 100MB 一个文件，循环录制
[AutoRecordingService] 硬件就绪: USB2.0 UVC PC Camera
[AutoRecordingService] 开始自动录制
[UnifiedMediaService] 文件大小达到 100.02MB，自动结束当前段
[UnifiedMediaService] 完成录制段 #1，时长: 120秒
[AutoRecordingService] 当前段录制完成，自动开始下一段...
[AutoRecordingService] 开始自动录制
```

### 用户手动停止
```
[AutoRecordingService] 用户手动停止录制
[UnifiedMediaService] 停止录制
（录制停止，不再自动重启）
```

### 用户手动开始
```
[AutoRecordingService] 用户手动开始录制
[AutoRecordingService] 当前存储使用: 8.52GB / 100GB
[AutoRecordingService] 开始自动录制
```

### 存储清理
```
[AutoRecordingService] 存储空间接近上限，开始清理最旧的文件...
[AutoRecordingService] 删除旧文件: recording_2025-12-01_xxx.mp4 (102.34MB)
[AutoRecordingService] 清理完成，删除了 5 个文件
```

## 状态查询

### 获取自动录制状态
```http
GET /api/auto-recording/status
```

**响应**：
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "isRecording": true,
    "selectedCamera": "video=USB2.0 UVC PC Camera",
    "manualStop": false
  }
}
```

## 测试步骤

### 测试 1：验证自动循环录制
```bash
1. cd backend
2. node setup-auto-recording.js  # 配置 auto_start=true
3. npm run dev                    # 启动服务
4. 观察日志确认自动开始录制
5. 等待文件达到 100MB
6. 观察是否自动开始下一段
```

### 测试 2：验证手动停止
```bash
1. 服务正在自动录制
2. 浏览器访问 http://localhost:3000
3. 点击"停止录制"
4. 观察日志：manualStop=true
5. 等待观察是否自动重启（应该不会）
```

### 测试 3：验证手动恢复
```bash
1. 在测试 2 基础上
2. 点击"开始录制"
3. 观察日志：manualStop=false
4. 等待文件达到 100MB
5. 观察是否自动开始下一段（应该会）
```

### 测试 4：验证存储清理
```bash
1. 降低存储上限用于测试：
   node -e "require('./dist/config/database').setConfig('storage_limit', '1073741824')" # 1GB
2. 录制多个文件直到接近 1GB
3. 观察是否自动删除最旧文件
```

## 故障排查

### 问题：停止后仍然自动重启
**检查**：
- manualStop 标志是否正确设置
- 是否通过正确的 API 停止（/api/recording/stop）

**解决**：
```bash
# 检查状态
curl http://localhost:3000/api/auto-recording/status

# 手动停止
curl -X POST http://localhost:3000/api/recording/stop
```

### 问题：文件没有在 100MB 时分段
**检查**：
- recordingProgressTimer 是否正常运行
- 文件大小监控逻辑是否执行

**解决**：
- 查看控制台日志
- 确认 `startRecordingProgressTimer()` 被调用

### 问题：存储满了但没有自动清理
**检查**：
- storage_limit 配置是否正确
- cleanupStorageIfNeeded() 是否被调用

**解决**：
```bash
# 检查配置
node check-auto-recording.js

# 手动触发清理（需要在代码中暴露接口）
```

## 最佳实践

1. **生产环境**：
   - 设置合理的 storage_limit（建议至少 100GB）
   - 定期监控磁盘空间
   - 设置日志轮转

2. **测试环境**：
   - 降低文件大小限制用于快速测试（修改代码）
   - 降低 storage_limit 测试清理逻辑
   - 保留足够日志用于调试

3. **监控建议**：
   - 监控 manualStop 状态变化
   - 记录每次分段的文件大小和时长
   - 监控存储清理事件

## 相关文件

- `backend/src/services/autoRecordingService.ts` - 自动录制服务
- `backend/src/services/unifiedMediaService.ts` - 媒体流服务
- `backend/src/routes/recordingRoutes.ts` - 录制 API 路由
- `backend/setup-auto-recording.js` - 快速配置脚本
- `backend/test-循环录制.js` - 测试说明脚本
