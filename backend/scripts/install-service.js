/**
 * Windows服务安装脚本
 * 使用 node-windows 将应用安装为Windows服务
 * 
 * 使用方法:
 *   npm run service:install
 * 或
 *   node scripts/install-service.js
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
  description: 'USB摄像头录制服务 - 提供摄像头预览和录制功能',
  script: path.join(__dirname, '..', 'dist', 'index.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=1024'
  ],
  workingDirectory: path.join(__dirname, '..'),
  allowServiceLogon: true,
  // 服务失败后自动重启
  wait: 2,
  grow: 0.5,
  maxRestarts: 3
});

// 监听安装事件
svc.on('install', function() {
  console.log('');
  console.log('==========================================');
  console.log('  服务安装成功!');
  console.log('==========================================');
  console.log('');
  console.log('服务名称: USB Camera Recorder');
  console.log('');
  console.log('正在启动服务...');
  svc.start();
});

svc.on('alreadyinstalled', function() {
  console.log('');
  console.log('服务已经安装过了');
  console.log('如需重新安装，请先运行:');
  console.log('  npm run service:uninstall');
  console.log('');
});

svc.on('start', function() {
  console.log('');
  console.log('服务已启动!');
  console.log('');
  console.log('访问地址: http://localhost:3001');
  console.log('');
  console.log('管理服务:');
  console.log('  - 打开 services.msc 查看服务状态');
  console.log('  - 或使用 PowerShell:');
  console.log('    Get-Service "USB Camera Recorder"');
  console.log('    Start-Service "USB Camera Recorder"');
  console.log('    Stop-Service "USB Camera Recorder"');
  console.log('');
});

svc.on('error', function(err) {
  console.error('');
  console.error('服务安装错误:', err);
  console.error('');
  console.error('可能的解决方案:');
  console.error('  1. 以管理员权限运行');
  console.error('  2. 确保已构建项目: npm run build');
  console.error('  3. 检查 dist/index.js 是否存在');
  console.error('');
});

// 检查构建产物
const distPath = path.join(__dirname, '..', 'dist', 'index.js');
const fs = require('fs');

if (!fs.existsSync(distPath)) {
  console.error('错误: 未找到构建产物');
  console.error('请先运行: npm run build');
  process.exit(1);
}

console.log('');
console.log('==========================================');
console.log('  USB摄像头录制服务 - Windows服务安装');
console.log('==========================================');
console.log('');
console.log('正在安装服务...');
console.log('');

// 开始安装
svc.install();
