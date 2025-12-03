const { detectCameras } = require('./dist/services/cameraService');
const { getConfig } = require('./dist/config/database');

async function testAutoRecording() {
  console.log('=== 自动录制功能诊断测试 ===');
  
  // 1. 检查数据库配置
  console.log('\n1. 检查自动录制配置:');
  const autoStart = getConfig('auto_start');
  const selectedCamera = getConfig('selected_camera');
  console.log(`   auto_start: ${autoStart}`);
  console.log(`   selected_camera: ${selectedCamera}`);
  
  // 2. 检测摄像头
  console.log('\n2. 检测摄像头设备:');
  try {
    const cameras = await detectCameras();
    console.log(`   检测到 ${cameras.length} 个摄像头:`);
    cameras.forEach((cam, index) => {
      console.log(`   ${index + 1}. ID: ${cam.id}, 名称: ${cam.name}, 状态: ${cam.status}`);
    });
    
    // 3. 检查选中的摄像头是否存在
    console.log('\n3. 检查摄像头匹配:');
    const matchedCamera = cameras.find(cam => cam.id === selectedCamera);
    if (matchedCamera) {
      console.log(`   ✅ 摄像头匹配成功: ${matchedCamera.name}`);
      console.log(`   📍 摄像头ID: ${matchedCamera.id}`);
      console.log(`   📍 数据库保存的ID: ${selectedCamera}`);
      console.log(`   🔧 摄像头状态: ${matchedCamera.status}`);
    } else {
      console.log('   ❌ 摄像头匹配失败');
      console.log(`   📍 数据库保存的ID: ${selectedCamera}`);
      console.log('   可用的摄像头ID:');
      cameras.forEach(cam => {
        console.log(`      - ${cam.id}`);
      });
    }
    
    // 4. 自动录制就绪状态
    console.log('\n4. 自动录制就绪状态:');
    const isReady = autoStart === 'true' && matchedCamera && matchedCamera.status === 'available';
    console.log(`   ${isReady ? '✅' : '❌'} 自动录制就绪: ${isReady}`);
    
    if (!isReady) {
      console.log('   问题诊断:');
      if (autoStart !== 'true') console.log('   - 自动录制未启用 (auto_start 不为 true)');
      if (!matchedCamera) console.log('   - 选中的摄像头不存在');
      if (matchedCamera && matchedCamera.status !== 'available') console.log(`   - 摄像头状态为: ${matchedCamera.status}`);
    }
    
  } catch (error) {
    console.error('   摄像头检测失败:', error.message);
  }
  
  console.log('\n=== 诊断完成 ===');
}

testAutoRecording().catch(console.error);