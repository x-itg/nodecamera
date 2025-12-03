// 测试配置：快速测试循环录制（小文件）
const { setConfig } = require('./dist/config/database');

console.log('=== 应用测试配置（快速循环） ===\n');

// 单文件 5MB，存储限制 50MB
setConfig('max_file_size', (5 * 1024 * 1024).toString());        // 5MB
setConfig('storage_limit', (50 * 1024 * 1024).toString());       // 50MB
setConfig('auto_start', 'true');
setConfig('auto_cleanup', 'true');

console.log('✅ 测试配置已应用:');
console.log('  - 单文件大小: 5 MB');
console.log('  - 存储限制: 50 MB');
console.log('  - 自动启动: 启用');
console.log('  - 自动清理: 启用');
console.log('');
console.log('📋 预期行为:');
console.log('  1. 每个文件录制约 5MB 后自动开始下一段');
console.log('  2. 总存储达到 50MB 时自动删除最旧文件');
console.log('  3. 大约可以保留 10 个文件');
console.log('');
console.log('🚀 重启服务测试');
