// 测试循环录制功能
const { getConfig } = require('./dist/config/database');
const autoRecordingService = require('./dist/services/autoRecordingService').default;

console.log('=== 测试循环录制功能 ===\n');

// 1. 检查配置
console.log('📋 配置检查:');
const config = {
  auto_start: getConfig('auto_start'),
  selected_camera: getConfig('selected_camera'),
  storage_limit: getConfig('storage_limit')
};
console.log(JSON.stringify(config, null, 2));
console.log('');

// 2. 获取状态
const status = autoRecordingService.getStatus();
console.log('📊 服务状态:');
console.log('  enabled:', status.enabled);
console.log('  isRecording:', status.isRecording);
console.log('  manualStop:', status.manualStop, '(手动停止标志)');
console.log('  selectedCamera:', status.selectedCamera);
console.log('');

// 3. 说明
console.log('💡 功能说明:');
console.log('  - 每个文件最大 100MB');
console.log('  - 达到 100MB 自动开始下一个文件');
console.log('  - 前端未介入: 自动循环录制');
console.log('  - 前端点击停止: 停止录制，设置 manualStop=true');
console.log('  - 前端点击开始: 清除 manualStop，恢复循环录制');
console.log('  - 接近存储上限: 自动删除最旧的文件');
console.log('');

// 4. 测试场景
console.log('🔧 测试场景:');
console.log('');

console.log('场景 1: 模拟服务启动（auto_start=true）');
console.log('  结果: 自动开始录制，manualStop=false');
console.log('');

console.log('场景 2: 前端点击停止');
console.log('  调用: POST /api/recording/stop');
console.log('  结果: 停止录制，设置 manualStop=true');
console.log('  效果: 不再自动重启录制');
console.log('');

console.log('场景 3: 前端点击开始');
console.log('  调用: POST /api/recording/start');
console.log('  结果: 清除 manualStop=false，开始录制');
console.log('  效果: 恢复循环录制（每 100MB 一个文件）');
console.log('');

console.log('场景 4: 文件达到 100MB');
console.log('  触发: unifiedMediaService 监控到文件大小 >= 100MB');
console.log('  动作: 完成当前文件，触发 recordingEnded 事件');
console.log('  结果: autoRecordingService 收到事件，自动开始下一段');
console.log('  前提: manualStop=false（用户未手动停止）');
console.log('');

console.log('场景 5: 存储空间接近上限（90%）');
console.log('  触发: 录制开始前检查存储');
console.log('  动作: 删除最旧的文件直到低于 80%');
console.log('  结果: 继续录制新文件');
console.log('');

console.log('✅ 测试脚本运行完成');
console.log('');
console.log('下一步: 启动服务测试实际录制');
console.log('  cd backend');
console.log('  npm run dev');
