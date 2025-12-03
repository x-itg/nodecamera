// 清理数据库中的错误录制记录
const RecordingModel = require('./dist/models/recording');
const fs = require('fs');

console.log('=== 清理录制数据库 ===\n');

// 获取所有录制记录
const allRecordings = RecordingModel.getAllRecordings(1000, 0);

console.log(`总记录数: ${allRecordings.length}\n`);

let errorCount = 0;
let completedCount = 0;
let recordingCount = 0;
let fixedCount = 0;

for (const recording of allRecordings) {
  // 检查文件是否存在
  const fileExists = fs.existsSync(recording.filepath);
  
  if (recording.status === 'error') {
    errorCount++;
    
    // 如果文件存在且大小大于0，修复状态为 completed
    if (fileExists) {
      const stats = fs.statSync(recording.filepath);
      if (stats.size > 0) {
        console.log(`修复错误记录 #${recording.id}:`);
        console.log(`  文件: ${recording.filename}`);
        console.log(`  大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        RecordingModel.updateRecording(recording.id, {
          status: 'completed',
          file_size: stats.size,
          duration: recording.duration || 0
        });
        
        fixedCount++;
        console.log(`  ✅ 已修复为 completed\n`);
      } else {
        console.log(`删除空文件记录 #${recording.id}: ${recording.filename}`);
        RecordingModel.hardDeleteRecording(recording.id);
      }
    } else {
      console.log(`删除不存在文件的记录 #${recording.id}: ${recording.filename}`);
      RecordingModel.hardDeleteRecording(recording.id);
    }
  } else if (recording.status === 'completed') {
    completedCount++;
  } else if (recording.status === 'recording') {
    recordingCount++;
    
    // 检查是否是僵尸录制记录（文件不存在或大小为0）
    if (!fileExists) {
      console.log(`删除僵尸录制记录 #${recording.id}: ${recording.filename} (文件不存在)`);
      RecordingModel.hardDeleteRecording(recording.id);
    } else {
      const stats = fs.statSync(recording.filepath);
      if (stats.size === 0) {
        console.log(`删除僵尸录制记录 #${recording.id}: ${recording.filename} (文件大小为0)`);
        RecordingModel.hardDeleteRecording(recording.id);
      } else {
        console.log(`⚠️  警告: 录制记录 #${recording.id} 状态为 recording，但文件已存在且大小 ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   可能是异常退出导致，修复为 completed`);
        RecordingModel.updateRecording(recording.id, {
          status: 'completed',
          file_size: stats.size,
          duration: recording.duration || 0
        });
        fixedCount++;
      }
    }
  }
}

console.log('\n=== 清理完成 ===');
console.log(`错误记录: ${errorCount} (已修复: ${fixedCount})`);
console.log(`已完成: ${completedCount}`);
console.log(`录制中: ${recordingCount}`);
console.log('');

// 重新查询统计
const stats = RecordingModel.getRecordingStats();
console.log('最新统计:');
console.log(`  总数: ${stats.total_count}`);
console.log(`  总大小: ${(stats.total_size / 1024 / 1024 / 1024).toFixed(2)} GB`);
