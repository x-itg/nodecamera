/**
 * Windows服务卸载脚本
 * 使用 node-windows 卸载Windows服务
 * 
 * 使用方法:
 *   npm run service:uninstall
 * 或
 *   node scripts/uninstall-service.js
 */

const path = require('path');
const os = require('os');

// 检查平台
if (os.platform() !== 'win32') {
  console.log('此脚本仅适用于Windows系统');
  console.log('Linux系统请使用 systemd 服务');
  process.exit(0);
}

// 尝试加载 node-windows
let Service;
try {
  Service = require('node-windows').Service;
} catch (error) {
  console.error('错误: node-windows 模块未安装');
  console.log('');
  console.log('请先安装 node-windows:');
  console.log('  npm install node-windows');
  console.log('');
  process.exit(1);
}

// 创建服务实例
const svc = new Service({
  name: 'USB Camera Recorder',
  script: path.join(__dirname, '..', 'dist', 'index.js'),
});

// 监听卸载事件
svc.on('uninstall', function() {
  console.log('');
  console.log('==========================================');
  console.log('  服务卸载成功!');
  console.log('==========================================');
  console.log('');
  console.log('服务已从系统中移除');
  console.log('');
  console.log('如需重新安装:');
  console.log('  npm run service:install');
  console.log('');
});

svc.on('alreadyuninstalled', function() {
  console.log('');
  console.log('服务未安装或已经卸载');
  console.log('');
});

svc.on('error', function(err) {
  console.error('');
  console.error('服务卸载错误:', err);
  console.error('');
  console.error('可能的解决方案:');
  console.error('  1. 以管理员权限运行');
  console.error('  2. 确保服务未在运行中');
  console.error('');
});

console.log('');
console.log('==========================================');
console.log('  USB摄像头录制服务 - Windows服务卸载');
console.log('==========================================');
console.log('');
console.log('正在停止并卸载服务...');
console.log('');

// 先停止服务，再卸载
svc.stop();
setTimeout(() => {
  svc.uninstall();
}, 2000);
