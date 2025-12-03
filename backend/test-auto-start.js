// 测试自动录制功能
const { getConfig } = require('./dist/config/database');
const autoRecordingService = require('./dist/services/autoRecordingService').default;

console.log('=== 测试自动录制功能 ===\n');

// 1. 检查配置
console.log('📋 配置检查:');
const autoStart = getConfig('auto_start');
const selectedCamera = getConfig('selected_camera');
const resolution = getConfig('video_resolution');
const fps = getConfig('video_fps');

console.log(`  auto_start: ${autoStart}`);
console.log(`  selected_camera: ${selectedCamera}`);
console.log(`  video_resolution: ${resolution}`);
console.log(`  video_fps: ${fps}`);
console.log('');

// 2. 检查服务状态
console.log('📊 服务状态:');
const status = autoRecordingService.getStatus();
console.log('  enabled:', status.enabled);
console.log('  isRecording:', status.isRecording);
console.log('  isChecking:', status.isChecking);
console.log('  selectedCamera:', status.selectedCamera);
console.log('');

// 3. 分析结果
console.log('🔍 诊断:');
if (autoStart !== 'true') {
  console.log('  ❌ auto_start 未启用');
  console.log('     解决: 运行 node setup-auto-recording.js');
} else {
  console.log('  ✅ auto_start 已启用');
}

if (!selectedCamera) {
  console.log('  ❌ 未选择摄像头');
  console.log('     解决: 设置 selected_camera 配置');
} else {
  console.log(`  ✅ 已选择摄像头: ${selectedCamera}`);
}

console.log('');

// 4. 手动触发硬件检查
console.log('🔧 手动触发硬件检查...');
autoRecordingService.triggerHardwareCheck()
  .then(result => {
    console.log('  结果:', result.success ? '✅' : '❌', result.message);
    
    if (result.success && result.message === '硬件已就绪') {
      console.log('');
      console.log('💡 建议: 调用 autoRecordingService.start() 启动自动录制服务');
      console.log('   在 src/index.ts 中已配置，服务启动时会自动调用');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('  ❌ 检查失败:', err);
    process.exit(1);
  });
