const { getConfig, setConfig, getAllConfigs, initDatabase } = require('./dist/config/database');
const autoRecordingService = require('./dist/services/autoRecordingService').default;

// 初始化数据库
initDatabase();

console.log('=== 自动录制功能诊断 ===');

// 检查当前配置
const configs = getAllConfigs();
console.log('当前配置:');
console.log('- auto_start:', configs.auto_start || '未设置');
console.log('- selected_camera:', configs.selected_camera || '未设置');
console.log('- video_resolution:', configs.video_resolution || '未设置');
console.log('- video_fps:', configs.video_fps || '未设置');
console.log('- recording_duration:', configs.recording_duration || '未设置');

// 检查自动录制服务状态
console.log('\n自动录制服务状态:');
const status = autoRecordingService.getStatus();
console.log('- 启用状态:', status.enabled ? '已启用' : '未启用');
console.log('- 录制状态:', status.isRecording ? '录制中' : '未录制');
console.log('- 检查状态:', status.isChecking ? '检查中' : '未检查');
console.log('- 选中摄像头:', status.selectedCamera || '未选择');

// 建议操作
console.log('\n=== 建议操作 ===');
if (configs.auto_start !== 'true') {
  console.log('1. 需要启用自动录制: 将 auto_start 设置为 true');
  console.log('   执行命令: setConfig("auto_start", "true")');
}

if (!configs.selected_camera) {
  console.log('2. 需要选择摄像头: 设置 selected_camera 为有效的摄像头ID');
  console.log('   首先需要调用摄像头检测API获取可用摄像头列表');
}

if (status.enabled && !status.isRecording) {
  console.log('3. 自动录制已启用但未录制，可能需要手动触发硬件检查');
  console.log('   执行命令: autoRecordingService.triggerHardwareCheck()');
}

console.log('\n=== 诊断完成 ===');