// 一键配置自动启动录制
const { getConfig, setConfig } = require('./dist/config/database');

console.log('=== 配置自动启动录制 ===\n');

// 1. 启用自动启动
setConfig('auto_start', 'true');
console.log('✅ auto_start = true (已启用自动启动)');

// 2. 设置默认摄像头（根据你的设备名称）
const currentCamera = getConfig('selected_camera');
if (!currentCamera) {
  // 使用你的摄像头设备名称
  setConfig('selected_camera', 'video=USB2.0 UVC PC Camera');
  console.log('✅ selected_camera = video=USB2.0 UVC PC Camera');
} else {
  console.log(`ℹ️  selected_camera = ${currentCamera} (已存在，未修改)`);
}

// 3. 设置录制参数
setConfig('video_resolution', '1280x720');
setConfig('video_fps', '30');
setConfig('video_quality', 'medium');
setConfig('recording_duration', '3600'); // 60分钟一段

console.log('✅ 录制参数已设置:');
console.log('   - 分辨率: 1280x720');
console.log('   - 帧率: 30 FPS');
console.log('   - 质量: medium');
console.log('   - 时长: 60分钟/段');

console.log('\n=== 最终配置 ===');
console.log('auto_start:', getConfig('auto_start'));
console.log('selected_camera:', getConfig('selected_camera'));
console.log('video_resolution:', getConfig('video_resolution'));
console.log('video_fps:', getConfig('video_fps'));
console.log('recording_duration:', getConfig('recording_duration'));

console.log('\n✅ 配置完成！重启服务后将自动开始录制。');
console.log('运行: npm run dev');
