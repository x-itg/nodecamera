// 清理损坏文件并重新开始录制
const fs = require('fs');
const path = require('path');

async function main() {
  const recordingsPath = './backend/data/recordings';
  
  if (!fs.existsSync(recordingsPath)) {
    console.log('录制文件夹不存在');
    return;
  }

  console.log('=== 清理损坏的MP4文件 ===\n');
  
  const files = fs.readdirSync(recordingsPath)
    .filter(f => f.toLowerCase().endsWith('.mp4'));

  console.log(`发现 ${files.length} 个MP4文件`);

  let deletedCount = 0;
  let keptCount = 0;

  for (const file of files) {
    const filePath = path.join(recordingsPath, file);
    
    try {
      // 检查文件大小
      const stats = fs.statSync(filePath);
      
      // 如果文件小于10KB，可能损坏
      if (stats.size < 10 * 1024) {
        console.log(`✗ 删除损坏文件: ${file} (大小: ${stats.size} bytes)`);
        fs.unlinkSync(filePath);
        deletedCount++;
      } else {
        console.log(`✓ 保留可能有效文件: ${file} (大小: ${stats.size} bytes)`);
        keptCount++;
      }
    } catch (error) {
      console.log(`✗ 删除文件失败: ${file} - ${error.message}`);
    }
  }

  console.log(`\n清理完成:`);
  console.log(`- 删除文件: ${deletedCount} 个`);
  console.log(`- 保留文件: ${keptCount} 个`);
  
  if (deletedCount > 0) {
    console.log('\n=== 录制配置建议 ===');
    console.log('1. 重新启动录制服务');
    console.log('2. 使用新的录制参数（已优化）');
    console.log('3. 测试录制并验证文件可播放性');
    console.log('\n新的录制参数已包含:');
    console.log('- 改进的FFmpeg参数确保moov atom存在');
    console.log('- 优化的进程终止方式');
    console.log('- 更好的错误处理');
  }
}

// 运行清理
if (require.main === module) {
  main();
}

module.exports = { main };