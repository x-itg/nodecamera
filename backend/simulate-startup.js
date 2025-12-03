// 模拟服务启动并测试自动录制
const { getConfig } = require('./dist/config/database');
const autoRecordingService = require('./dist/services/autoRecordingService').default;

console.log('=== 模拟服务启动 ===\n');

console.log('[Server] 服务初始化中...');
console.log('[AutoRecording] 启动自动录制服务检查...\n');

// 显示当前配置
const config = {
  auto_start: getConfig('auto_start'),
  selected_camera: getConfig('selected_camera'),
  video_resolution: getConfig('video_resolution'),
  video_fps: getConfig('video_fps'),
  recording_duration: getConfig('recording_duration')
};

console.log('📋 当前配置:');
console.log(JSON.stringify(config, null, 2));
console.log('');

// 调用 start() - 这是 index.ts 中实际调用的方法
console.log('🚀 调用 autoRecordingService.start()...\n');
autoRecordingService.start();

// 等待 2 秒看看检查结果
console.log('⏳ 等待 2 秒观察自动录制启动...\n');

setTimeout(() => {
  const status = autoRecordingService.getStatus();
  console.log('\n📊 服务状态:');
  console.log('  enabled:', status.enabled);
  console.log('  isRecording:', status.isRecording);
  console.log('  isChecking:', status.isChecking);
  
  if (status.isRecording) {
    console.log('\n✅ 自动录制已成功启动！');
  } else if (status.enabled) {
    console.log('\n⚠️  自动录制已启用但尚未开始录制');
    console.log('   可能原因：硬件未就绪或检查中');
  } else {
    console.log('\n❌ 自动录制未启用');
    console.log('   运行: node setup-auto-recording.js');
  }
  
  // 停止服务
  console.log('\n🛑 停止测试...');
  autoRecordingService.stop();
  
  process.exit(0);
}, 2000);
