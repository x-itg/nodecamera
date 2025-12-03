import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { initDatabase, addLog, getDataDir } from './config/database';
import cameraRoutes from './routes/cameraRoutes';
import recordingRoutes from './routes/recordingRoutes';
import enhancedRecordingRoutes from './routes/enhancedRecordingRoutes';
import configRoutes from './routes/configRoutes';
import streamRoutes from './routes/streamRoutes';
import autoRecordingRoutes from './routes/autoRecordingRoutes';
import websocketService from './services/websocketService';
import autoRecordingService from './services/autoRecordingService';
import { getPlatformInfo, isWindows, checkFFmpegAvailable } from './utils/platform';

// 显示启动信息
console.log('');
console.log('==========================================');
console.log('  USB摄像头录制系统');
console.log('==========================================');
console.log('');

// 显示平台信息
const platformInfo = getPlatformInfo();
console.log(`平台: ${platformInfo.platform}`);
console.log(`架构: ${platformInfo.arch}`);
console.log(`Node: ${platformInfo.nodeVersion}`);
console.log(`数据目录: ${getDataDir()}`);
console.log('');

// 检查FFmpeg
checkFFmpegAvailable().then(result => {
  if (result.available) {
    console.log(`FFmpeg: ${result.version}`);
  } else {
    console.warn('警告: FFmpeg 未找到，录制功能可能不可用');
    console.warn(`错误: ${result.error}`);
  }
});

// 初始化数据库
initDatabase();

const app = express();
const server = http.createServer(app);

// 端口配置
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

// 中间件
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（前端构建产物）
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// API路由
app.use('/api/camera', cameraRoutes);
app.use('/api/recording', recordingRoutes);
app.use('/api/enhanced-recording', enhancedRecordingRoutes);
app.use('/api/config', configRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/auto-recording', autoRecordingRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'USB摄像头录制服务运行正常',
    timestamp: new Date().toISOString(),
    platform: platformInfo.platform,
  });
});

// 系统信息API
app.get('/api/system/info', (req, res) => {
  res.json({
    success: true,
    data: {
      ...platformInfo,
      dataDir: getDataDir(),
    }
  });
});

// 前端路由回退
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  addLog('error', 'server', `服务器错误: ${err.message}`, { stack: err.stack });
  
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 初始化WebSocket
websocketService.initialize(server);

// 优雅关闭函数
function gracefulShutdown(signal: string) {
  console.log(`收到${signal}信号，正在关闭服务...`);
  addLog('info', 'server', `收到${signal}信号，正在停止服务`);
  
  // 停止自动录制服务
  autoRecordingService.stop();
  websocketService.close();
  server.close(() => {
    console.log('服务已关闭');
    process.exit(0);
  });

  // 强制退出超时
  setTimeout(() => {
    console.error('强制关闭服务');
    process.exit(1);
  }, 10000);
}

// 启动服务器
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('------------------------------------------');
  console.log(`服务已启动`);
  console.log(`地址: http://localhost:${PORT}`);
  console.log(`API:  http://localhost:${PORT}/api`);
  console.log(`WS:   ws://localhost:${PORT}/ws`);
  console.log('------------------------------------------');
  console.log('');
  
  addLog('info', 'server', '服务已启动', { 
    host: HOST, 
    port: PORT,
    platform: platformInfo.platform 
  });

  // 启动自动录制服务
  console.log('[AutoRecording] 启动自动录制服务检查...');
  autoRecordingService.start();
});

// 信号处理（跨平台）
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Windows特定的退出处理
if (isWindows()) {
  // Windows在控制台关闭时发送的消息
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
  
  // 处理Windows的进程退出事件
  process.on('exit', (code) => {
    addLog('info', 'server', `进程退出，代码: ${code}`);
  });
}

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  addLog('error', 'server', `未捕获的异常: ${error.message}`, { stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  addLog('error', 'server', `未处理的Promise拒绝: ${reason}`);
});

export default app;
