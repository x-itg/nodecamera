// 快速验证循环录制实现
const { getConfig } = require('./dist/config/database');
const autoRecordingService = require('./dist/services/autoRecordingService').default;

console.log('=== 快速验证循环录制实现 ===\n');

// 验证配置
console.log('1️⃣ 配置验证:');
const autoStart = getConfig('auto_start');
const camera = getConfig('selected_camera');
const storageLimit = getConfig('storage_limit');

console.log(`   auto_start: ${autoStart} ${autoStart === 'true' ? '✅' : '❌'}`);
console.log(`   selected_camera: ${camera} ${camera ? '✅' : '❌'}`);
console.log(`   storage_limit: ${(parseInt(storageLimit) / 1024 / 1024 / 1024).toFixed(0)}GB ✅`);
console.log('');

// 验证服务状态
console.log('2️⃣ 服务状态:');
const status = autoRecordingService.getStatus();
console.log(`   enabled: ${status.enabled} ${status.enabled ? '✅' : '❌'}`);
console.log(`   manualStop: ${status.manualStop} ${!status.manualStop ? '✅' : '⚠️'}`);
console.log(`   selectedCamera: ${status.selectedCamera} ${status.selectedCamera ? '✅' : '❌'}`);
console.log('');

// 验证方法存在
console.log('3️⃣ 方法验证:');
console.log(`   userStopRecording: ${typeof autoRecordingService.userStopRecording === 'function' ? '✅' : '❌'}`);
console.log(`   userStartRecording: ${typeof autoRecordingService.userStartRecording === 'function' ? '✅' : '❌'}`);
console.log(`   start: ${typeof autoRecordingService.start === 'function' ? '✅' : '❌'}`);
console.log(`   stop: ${typeof autoRecordingService.stop === 'function' ? '✅' : '❌'}`);
console.log('');

// 验证结果
const allChecks = [
  autoStart === 'true',
  camera,
  status.enabled,
  !status.manualStop,
  typeof autoRecordingService.userStopRecording === 'function',
  typeof autoRecordingService.userStartRecording === 'function'
];

const passed = allChecks.filter(x => x).length;
const total = allChecks.length;

console.log('📊 验证结果:');
console.log(`   通过: ${passed}/${total}`);
console.log('');

if (passed === total) {
  console.log('✅ 所有检查通过！准备测试实际录制。');
  console.log('');
  console.log('下一步:');
  console.log('  1. 启动服务: npm run dev');
  console.log('  2. 观察日志确认自动录制启动');
  console.log('  3. 打开前端测试手动控制');
  console.log('');
  console.log('预期行为:');
  console.log('  - 服务启动后自动开始录制（manualStop=false）');
  console.log('  - 文件达到 100MB 自动开始下一段');
  console.log('  - 前端点击停止后不再自动重启');
  console.log('  - 前端点击开始后恢复循环录制');
} else {
  console.log('❌ 有检查未通过，请检查配置。');
  console.log('');
  if (autoStart !== 'true') {
    console.log('修复: node setup-auto-recording.js');
  }
  if (!camera) {
    console.log('修复: 在 Web 界面选择摄像头');
  }
}
