// 验证 recordingProgress 事件
const WebSocket = require('ws');

console.log('=== 测试 recordingProgress 事件 ===\n');

const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('open', () => {
  console.log('✅ WebSocket 连接成功\n');
  
  // 请求状态
  ws.send(JSON.stringify({ type: 'getStatus' }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  switch (message.type) {
    case 'status':
      console.log('📊 当前状态:');
      console.log('  isRecording:', message.data.recording.isRecording);
      console.log('  recordingId:', message.data.recording.recordingId);
      console.log('  duration:', message.data.recording.duration, '秒');
      console.log('');
      break;
      
    case 'recordingProgress':
      const duration = message.data.duration || 0;
      const fileSize = message.data.fileSize || 0;
      const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
      
      console.log(`📈 录制进度: 时长 ${duration}秒, 文件大小 ${sizeMB}MB (${fileSize} 字节)`);
      
      if (fileSize === 0) {
        console.log('   ⚠️  文件大小为 0 - 可能有问题！');
      }
      break;
      
    case 'recordingStarted':
      console.log('🎬 录制开始:', message.data);
      break;
      
    case 'recordingEnded':
      console.log('🛑 录制结束:', message.data);
      break;
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket 错误:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n🔌 WebSocket 连接关闭');
  process.exit(0);
});

// 运行 10 秒后自动退出
setTimeout(() => {
  console.log('\n⏱️  测试时间到，关闭连接...');
  ws.close();
}, 10000);

console.log('监听 recordingProgress 事件...');
console.log('（将运行 10 秒）\n');
