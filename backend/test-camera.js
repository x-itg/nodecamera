// 测试摄像头检测
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function testCameraDetection() {
  console.log('开始测试摄像头检测...\n');
  
  try {
    const command = 'ffmpeg -list_devices true -f dshow -i dummy 2>&1';
    console.log('执行命令:', command);
    
    let stdout = '';
    try {
      const result = await execAsync(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      stdout = result.stdout + result.stderr;
      console.log('execAsync 成功返回');
    } catch (e) {
      // ffmpeg -list_devices 会返回非0退出码
      stdout = (e.stdout || '') + (e.stderr || '');
      console.log('execAsync 捕获异常（这是正常的）');
    }
    
    console.log('\n输出长度:', stdout.length);
    console.log('\n前1000个字符:');
    console.log(stdout.substring(0, 1000));
    console.log('\n---\n');
    
    // 解析视频设备
    const lines = stdout.split('\n');
    console.log('总行数:', lines.length);
    
    let foundDevices = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('(video)') && line.includes('"')) {
        console.log('\n找到视频设备行:', line);
        
        const deviceMatch = line.match(/"([^"]+)"/);
        if (deviceMatch) {
          const deviceName = deviceMatch[1];
          console.log('设备名称:', deviceName);
          
          // 检查下一行
          const nextLine = lines[i + 1];
          console.log('下一行:', nextLine);
          
          if (nextLine && nextLine.includes('Alternative name')) {
            console.log('跳过（Alternative name）');
          } else {
            console.log('✓ 添加此设备');
            foundDevices++;
          }
        }
      }
    }
    
    console.log('\n总共找到', foundDevices, '个设备');
    
  } catch (error) {
    console.error('错误:', error);
  }
}

testCameraDetection();
