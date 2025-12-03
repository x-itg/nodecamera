const { setConfig, initDatabase } = require('./dist/config/database');

// 初始化数据库
initDatabase();

console.log('=== 启用自动录制功能 ===');

// 启用自动录制
setConfig('auto_start', 'true');
console.log('✅ 已启用自动录制 (auto_start = true)');

// 检查当前配置
const { getConfig } = require('./dist/config/database');
console.log('\n验证配置:');
console.log('- auto_start:', getConfig('auto_start'));
console.log('- selected_camera:', getConfig('selected_camera'));

console.log('\n=== 自动录制已启用 ===');
console.log('请重启后端服务以使更改生效：');
console.log('1. 停止当前运行的后端服务');
console.log('2. 重新启动后端服务');
console.log('3. 后端启动后将自动检测硬件并开始录制');