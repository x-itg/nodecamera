import { initDatabase } from '../config/database';

console.log('正在初始化数据库...');

try {
  initDatabase();
  console.log('数据库初始化完成！');
} catch (error: any) {
  console.error('数据库初始化失败:', error.message);
  process.exit(1);
}
