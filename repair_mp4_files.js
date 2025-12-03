// MP4文件修复脚本
const { repairAllRecordings, cleanupRepairedFiles } = require('./backend/dist/utils/mp4Repair.js');

async function main() {
  console.log('开始修复MP4文件...');
  
  const recordingsPath = './backend/data/recordings';
  
  try {
    // 修复所有损坏的MP4文件
    const result = await repairAllRecordings(recordingsPath);
    
    console.log('\n修复结果:');
    console.log(`总文件数: ${result.total}`);
    console.log(`修复成功: ${result.repaired}`);
    console.log(`修复失败: ${result.failed}`);
    
    // 显示详细结果
    result.results.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.file}: ${item.success ? '✓' : '✗'} ${item.message}`);
    });
    
    // 清理修复文件（用修复文件替换原文件）
    if (result.repaired > 0) {
      console.log('\n清理修复文件...');
      cleanupRepairedFiles(recordingsPath, false);
      console.log('清理完成');
    }
    
    console.log('\n修复过程完成！');
  } catch (error) {
    console.error('修复过程中出错:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { main };