# 循环录制参数配置指南

## 可配置参数

### 1. 单文件大小限制 (`max_file_size`)
- **作用**：控制每个录制文件的最大大小
- **单位**：字节（Bytes）
- **默认值**：104857600 (100 MB)
- **达到限制时**：自动完成当前文件，无缝开始下一个文件

### 2. 存储限制 (`storage_limit`)
- **作用**：控制所有录制文件的总大小上限
- **单位**：字节（Bytes）
- **默认值**：107374182400 (100 GB)
- **达到限制时**：自动删除最旧的文件（如果启用 auto_cleanup）

## 配置方法

### 方法 1：使用 Web 界面（推荐）

1. 启动服务
2. 打开浏览器：http://localhost:3001
3. 进入"设置"面板
4. 修改参数：
   - **单文件大小限制（MB）**：例如输入 `5` 表示 5MB
   - **存储限制（GB）**：例如输入 `0.5` 表示 500MB
5. 点击"保存设置"
6. **重启服务**使配置生效

### 方法 2：使用预设配置脚本

#### 快速测试配置（小文件，快速循环）
```powershell
cd backend
node config-test-fast.js
```

**配置内容**：
- 单文件大小：5 MB
- 存储限制：50 MB
- 约可保留 10 个文件
- 适合快速测试循环录制功能

#### 生产配置（大文件，长期运行）
```powershell
cd backend
node config-production.js
```

**配置内容**：
- 单文件大小：100 MB
- 存储限制：100 GB
- 约可保留 1000 个文件
- 适合实际生产使用

### 方法 3：自定义配置脚本

```powershell
cd backend
node set-recording-params.js <文件大小MB> <存储限制GB>
```

**示例**：
```powershell
# 单文件 10MB，存储限制 1GB
node set-recording-params.js 10 1

# 单文件 20MB，存储限制 5GB
node set-recording-params.js 20 5

# 单文件 1MB，存储限制 100MB（极快测试）
node set-recording-params.js 1 0.1
```

### 方法 4：直接修改数据库

```powershell
cd backend
node -e "require('./dist/config/database').setConfig('max_file_size', '5242880')"  # 5MB
node -e "require('./dist/config/database').setConfig('storage_limit', '52428800')" # 50MB
```

## 测试场景示例

### 场景 1：极快速测试（1分钟内看到效果）
```powershell
# 单文件 1MB，存储限制 10MB
node set-recording-params.js 1 0.01
```

**预期**：
- 约每 10-20 秒生成一个文件
- 总共保留 10 个文件
- 约 2 分钟后开始删除最旧文件

### 场景 2：快速测试（几分钟看到效果）
```powershell
# 单文件 5MB，存储限制 50MB
node config-test-fast.js
```

**预期**：
- 约每 1-2 分钟生成一个文件
- 总共保留 10 个文件
- 约 10-20 分钟后开始删除最旧文件

### 场景 3：中等测试（几十分钟）
```powershell
# 单文件 10MB，存储限制 100MB
node set-recording-params.js 10 0.1
```

**预期**：
- 约每 2-4 分钟生成一个文件
- 总共保留 10 个文件
- 约 20-40 分钟后开始删除最旧文件

### 场景 4：生产环境
```powershell
# 单文件 100MB，存储限制 100GB
node config-production.js
```

**预期**：
- 约每 20-30 分钟生成一个文件（取决于视频内容）
- 总共保留约 1000 个文件
- 长期运行，自动清理

## 参数计算公式

### 文件大小 → 字节
```
字节 = MB × 1024 × 1024
```

**示例**：
- 1 MB = 1,048,576 字节
- 5 MB = 5,242,880 字节
- 10 MB = 10,485,760 字节
- 100 MB = 104,857,600 字节

### 存储限制 → 字节
```
字节 = GB × 1024 × 1024 × 1024
```

**示例**：
- 0.1 GB (100 MB) = 104,857,600 字节
- 0.5 GB (500 MB) = 536,870,912 字节
- 1 GB = 1,073,741,824 字节
- 100 GB = 107,374,182,400 字节

### 可保留文件数量
```
文件数量 ≈ 存储限制 / 单文件大小
```

**示例**：
- 50 MB / 5 MB = 10 个文件
- 100 MB / 10 MB = 10 个文件
- 1 GB / 100 MB = 10 个文件
- 100 GB / 100 MB = 1000 个文件

## 查看当前配置

```powershell
cd backend
node -e "
const { getConfig } = require('./dist/config/database');
const fileSize = parseInt(getConfig('max_file_size') || '0');
const storageLimit = parseInt(getConfig('storage_limit') || '0');
console.log('单文件大小:', (fileSize / 1024 / 1024).toFixed(2), 'MB');
console.log('存储限制:', (storageLimit / 1024 / 1024 / 1024).toFixed(2), 'GB');
console.log('约可保留文件:', Math.floor(storageLimit / fileSize), '个');
"
```

## 验证配置生效

### 1. 启动服务后观察日志
```
[AutoRecordingService] 启动自动录制服务
[AutoRecordingService] 模式: 每 5MB 一个文件，循环录制
```

### 2. 监控文件大小
```powershell
# 实时监控最新文件
while ($true) {
  $file = Get-ChildItem .\data\recordings\*.mp4 | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($file) {
    $sizeMB = [math]::Round($file.Length / 1MB, 2)
    Write-Host "$(Get-Date -Format 'HH:mm:ss') - $($file.Name): $sizeMB MB"
  }
  Start-Sleep -Seconds 5
}
```

### 3. 观察自动分段
当文件大小达到设定值时，日志应显示：
```
[UnifiedMediaService] 文件大小达到 5.02MB，自动结束当前段
[UnifiedMediaService] 录制段 #67 已完成: 5.00MB
[UnifiedMediaService] 自动开始下一段录制（无缝切换）...
```

### 4. 观察自动清理
当存储接近上限时，日志应显示：
```
[AutoRecordingService] 存储空间接近上限，开始清理最旧的文件...
[AutoRecordingService] 删除旧文件: recording_xxx.mp4 (5.12MB)
[AutoRecordingService] 清理完成，删除了 3 个文件
```

## 故障排查

### 问题：修改配置后没有生效
**解决**：必须重启服务
```powershell
# 停止服务（Ctrl+C）
# 重新启动
npm run dev
```

### 问题：文件没有在设定大小时分段
**检查**：
1. 确认配置已保存到数据库
2. 查看日志是否有文件大小监控信息
3. 检查 `max_file_size` 是否正确

### 问题：存储满了但没有自动清理
**检查**：
1. 确认 `auto_cleanup` 设置为 `true`
2. 查看日志是否有清理信息
3. 手动触发清理：运行 `cleanup-recordings.js`

## 最佳实践

1. **测试时**：使用小文件（1-5 MB）快速验证功能
2. **开发时**：使用中等文件（10-20 MB）平衡速度和真实性
3. **生产时**：使用大文件（100 MB）减少文件数量
4. **存储规划**：预留至少 20% 缓冲空间
5. **定期检查**：监控磁盘使用情况

## 相关文件

- `backend/config-test-fast.js` - 快速测试配置
- `backend/config-production.js` - 生产配置
- `backend/set-recording-params.js` - 自定义配置脚本
- `backend/cleanup-recordings.js` - 手动清理数据库
- `frontend/src/components/SettingsPanel.tsx` - Web 设置界面
