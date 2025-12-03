import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// 获取默认数据目录（跨平台）
function getDefaultDataDir(): string {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  // 首先检查环境变量
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  
  // 如果在项目目录下运行，使用项目的data目录
  const projectDataDir = path.join(process.cwd(), 'data');
  if (fs.existsSync(path.dirname(projectDataDir))) {
    return projectDataDir;
  }
  
  // 否则使用系统默认位置
  if (platform === 'win32') {
    // Windows: %LOCALAPPDATA%\usb-camera-recorder
    return path.join(
      process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 
      'usb-camera-recorder'
    );
  } else if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/usb-camera-recorder
    return path.join(homeDir, 'Library', 'Application Support', 'usb-camera-recorder');
  } else {
    // Linux: ~/.local/share/usb-camera-recorder
    return path.join(homeDir, '.local', 'share', 'usb-camera-recorder');
  }
}

// 数据目录
const DATA_DIR = getDefaultDataDir();
const DB_PATH = path.join(DATA_DIR, 'camera-recorder.db');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化数据库表
export function initDatabase(): void {
  // 配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 录制记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      camera_id TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      file_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'recording',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 系统日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 获取默认存储路径（跨平台）
  const defaultStoragePath = path.join(DATA_DIR, 'recordings');

  // 插入默认配置
  const defaultConfigs = [
    { key: 'selected_camera', value: '', description: '选中的摄像头设备ID' },
    { key: 'recording_duration', value: '3600', description: '录制时长（秒），默认1小时' },
    { key: 'storage_limit', value: '107374182400', description: '存储限制（字节），默认100GB' },
    { key: 'max_file_size', value: '104857600', description: '单个文件最大大小（字节），默认100MB' },
    { key: 'video_quality', value: 'medium', description: '视频质量: low, medium, high' },
    { key: 'video_fps', value: '30', description: '视频帧率' },
    { key: 'video_resolution', value: '1280x720', description: '视频分辨率' },
    { key: 'storage_path', value: defaultStoragePath, description: '录制文件保存路径' },
    { key: 'auto_start', value: 'false', description: '是否自动开始录制' },
    { key: 'auto_cleanup', value: 'true', description: '是否自动清理旧文件' },
  ];

  const insertConfig = db.prepare(`
    INSERT OR IGNORE INTO config (key, value, description) VALUES (?, ?, ?)
  `);

  for (const config of defaultConfigs) {
    insertConfig.run(config.key, config.value, config.description);
  }

  // 确保录制目录存在
  const storagePath = getConfig('storage_path');
  if (storagePath && !fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  // 记录数据目录位置
  console.log(`数据目录: ${DATA_DIR}`);
  console.log(`数据库文件: ${DB_PATH}`);
}

// 获取配置
export function getConfig(key: string): string | null {
  const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
  const result = stmt.get(key) as { value: string } | undefined;
  return result?.value || null;
}

// 设置配置
export function setConfig(key: string, value: string): void {
  const stmt = db.prepare(`
    INSERT INTO config (key, value, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(key, value, value);
}

// 获取所有配置
export function getAllConfigs(): Record<string, string> {
  const stmt = db.prepare('SELECT key, value FROM config');
  const results = stmt.all() as { key: string; value: string }[];
  const configs: Record<string, string> = {};
  for (const row of results) {
    configs[row.key] = row.value;
  }
  return configs;
}

// 添加日志
export function addLog(level: string, category: string, message: string, details?: object): void {
  const stmt = db.prepare(`
    INSERT INTO system_logs (level, category, message, details) VALUES (?, ?, ?, ?)
  `);
  stmt.run(level, category, message, details ? JSON.stringify(details) : null);
}

// 获取日志
export function getLogs(limit: number = 100, category?: string): any[] {
  let sql = 'SELECT * FROM system_logs';
  const params: any[] = [];
  
  if (category) {
    sql += ' WHERE category = ?';
    params.push(category);
  }
  
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

// 获取数据目录
export function getDataDir(): string {
  return DATA_DIR;
}

// 获取数据库路径
export function getDbPath(): string {
  return DB_PATH;
}

export default db;
