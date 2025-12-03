const { spawn } = require('child_process');

console.log('测试 FFmpeg spawn...');

const args = [
  '-f', 'dshow',
  '-i', 'video=USB2.0 UVC PC Camera',
  '-f', 'mjpeg',
  '-q:v', '5',
  'pipe:1'
];

console.log('参数:', JSON.stringify(args));

const ffmpeg = spawn('ffmpeg', args, { windowsHide: true });

console.log('PID:', ffmpeg.pid);

let frameCount = 0;
let byteCount = 0;

// stderr 处理
ffmpeg.stderr.on('data', (data) => {
  const str = data.toString();
  if (str.includes('Error') || str.includes('error')) {
    console.log('STDERR ERROR:', str.slice(0, 200));
  }
  if (str.includes('Input #0')) {
    console.log('✓ 设备打开成功');
  }
  if (str.includes('Stream mapping')) {
    console.log('✓ 流映射成功');
  }
});

// stdout 处理
ffmpeg.stdout.on('data', (chunk) => {
  frameCount++;
  byteCount += chunk.length;
  if (frameCount === 1) {
    console.log('✓ 收到第一帧数据');
  }
  if (frameCount % 10 === 0) {
    console.log(`已收到 ${frameCount} 帧, ${byteCount} 字节`);
  }
});

ffmpeg.stdout.on('error', (err) => {
  console.error('stdout 错误:', err.message);
});

ffmpeg.stderr.on('error', (err) => {
  console.error('stderr 错误:', err.message);
});

ffmpeg.on('error', (err) => {
  console.error('进程错误:', err.message);
});

ffmpeg.on('close', (code) => {
  console.log(`\n进程退出，退出码: ${code}`);
  console.log(`总共收到 ${frameCount} 帧, ${byteCount} 字节`);
  process.exit(code || 0);
});

// 5秒后停止
setTimeout(() => {
  console.log('\n5秒测试完成，停止进程...');
  ffmpeg.kill('SIGTERM');
}, 5000);
