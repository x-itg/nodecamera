/**
 * 修复错误状态的录制记录
 * 将状态为 'error' 但文件实际可用的录制记录改为 'completed'
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 使用与 database.ts 相同的路径逻辑
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'camera-recorder.db');

console.log('📁 数据库路径:', dbPath);
console.log('🔧 开始检查并修复错误状态的录制记录...\n');

const db = new Database(dbPath);

const rows = db.prepare(
  `SELECT id, filepath, file_size, duration, status 
   FROM recordings 
   WHERE status = 'error'
   ORDER BY created_at DESC`
).all();

if (rows.length === 0) {
  console.log('✅ 没有发现错误状态的录制记录');
  db.close();
  process.exit(0);
}

console.log(`📋 发现 ${rows.length} 条错误状态的录制记录:\n`);

let fixedCount = 0;
const updateStmt = db.prepare(`UPDATE recordings SET status = 'completed' WHERE id = ?`);

rows.forEach((row) => {
  // filepath 已经是完整路径
  const filePath = row.filepath;
  const fileExists = fs.existsSync(filePath);
  
  console.log(`ID: ${row.id}`);
  console.log(`  文件: ${row.filepath}`);
  console.log(`  时长: ${row.duration}秒`);
  console.log(`  大小: ${(row.file_size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  文件存在: ${fileExists ? '✅' : '❌'}`);

  if (fileExists && row.file_size > 0) {
    // 文件存在且有内容，修复为 completed
    try {
      updateStmt.run(row.id);
      fixedCount++;
      console.log(`  状态: ✅ 已修复为 'completed'\n`);
    } catch (err) {
      console.log(`  状态: ❌ 修复失败 - ${err.message}\n`);
    }
  } else {
    console.log(`  状态: ⚠️  文件不存在或大小为0，保持 'error' 状态\n`);
  }
});

console.log(`\n🎉 处理完成！修复了 ${fixedCount}/${rows.length} 条记录`);
db.close();
