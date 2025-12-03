// 生产配置：正式使用
const { setConfig } = require('./dist/config/database');

console.log('=== 应用生产配置 ===\n');

// 单文件 100MB，存储限制 100GB
setConfig('max_file_size', (100 * 1024 * 1024).toString());       // 100MB
setConfig('storage_limit', (100 * 1024 * 1024 * 1024).toString()); // 100GB
setConfig('auto_start', 'true');
setConfig('auto_cleanup', 'true');

console.log('✅ 生产配置已应用:');
console.log('  - 单文件大小: 100 MB');
console.log('  - 存储限制: 100 GB');
console.log('  - 自动启动: 启用');
console.log('  - 自动清理: 启用');
console.log('');
console.log('📋 预期行为:');
console.log('  1. 每个文件录制约 100MB 后自动开始下一段');
console.log('  2. 总存储达到 100GB 时自动删除最旧文件');
console.log('  3. 大约可以保留 1000 个文件');
console.log('');
console.log('🚀 重启服务使配置生效');
