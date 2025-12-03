// 快速配置循环录制参数（用于测试）
const { getConfig, setConfig } = require('./dist/config/database');

console.log('=== 配置循环录制参数 ===\n');

// 解析命令行参数
const args = process.argv.slice(2);
const fileSizeMB = args[0] ? parseInt(args[0]) : 10;  // 默认 10MB
const storageLimitGB = args[1] ? parseInt(args[1]) : 1; // 默认 1GB

const fileSizeBytes = fileSizeMB * 1024 * 1024;
const storageLimitBytes = storageLimitGB * 1024 * 1024 * 1024;

console.log('设置参数:');
console.log(`  单文件大小: ${fileSizeMB} MB`);
console.log(`  存储限制: ${storageLimitGB} GB`);
console.log('');

// 显示当前配置
console.log('当前配置:');
console.log(`  max_file_size: ${(parseInt(getConfig('max_file_size') || '0') / 1024 / 1024).toFixed(0)} MB`);
console.log(`  storage_limit: ${(parseInt(getConfig('storage_limit') || '0') / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log('');

// 更新配置
setConfig('max_file_size', fileSizeBytes.toString());
setConfig('storage_limit', storageLimitBytes.toString());

console.log('✅ 配置已更新:');
console.log(`  max_file_size: ${fileSizeMB} MB (${fileSizeBytes} 字节)`);
console.log(`  storage_limit: ${storageLimitGB} GB (${storageLimitBytes} 字节)`);
console.log('');

// 验证配置
const newFileSize = getConfig('max_file_size');
const newStorageLimit = getConfig('storage_limit');

console.log('验证配置:');
console.log(`  max_file_size: ${(parseInt(newFileSize || '0') / 1024 / 1024).toFixed(0)} MB ✅`);
console.log(`  storage_limit: ${(parseInt(newStorageLimit || '0') / 1024 / 1024 / 1024).toFixed(2)} GB ✅`);
console.log('');

console.log('💡 使用说明:');
console.log('  - 默认: node set-recording-params.js');
console.log('    结果: 单文件 10MB, 存储限制 1GB');
console.log('');
console.log('  - 自定义: node set-recording-params.js <文件大小MB> <存储限制GB>');
console.log('    示例: node set-recording-params.js 5 0.5');
console.log('    结果: 单文件 5MB, 存储限制 0.5GB');
console.log('');
console.log('🔄 重启服务使配置生效');
