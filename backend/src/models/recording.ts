import db from '../config/database';

export interface Recording {
  id: number;
  filename: string;
  filepath: string;
  camera_id: string;
  duration: number;
  file_size: number;
  status: 'recording' | 'completed' | 'error' | 'deleted';
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface CreateRecordingParams {
  filename: string;
  filepath: string;
  camera_id: string;
}

export interface UpdateRecordingParams {
  duration?: number;
  file_size?: number;
  status?: Recording['status'];
  ended_at?: string;
}

// 创建录制记录
export function createRecording(params: CreateRecordingParams): Recording {
  const stmt = db.prepare(`
    INSERT INTO recordings (filename, filepath, camera_id)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(params.filename, params.filepath, params.camera_id);
  return getRecordingById(result.lastInsertRowid as number)!;
}

// 获取录制记录
export function getRecordingById(id: number): Recording | null {
  const stmt = db.prepare('SELECT * FROM recordings WHERE id = ?');
  return stmt.get(id) as Recording | null;
}

// 更新录制记录
export function updateRecording(id: number, params: UpdateRecordingParams): void {
  const updates: string[] = [];
  const values: any[] = [];

  if (params.duration !== undefined) {
    updates.push('duration = ?');
    values.push(params.duration);
  }
  if (params.file_size !== undefined) {
    updates.push('file_size = ?');
    values.push(params.file_size);
  }
  if (params.status !== undefined) {
    updates.push('status = ?');
    values.push(params.status);
  }
  if (params.ended_at !== undefined) {
    updates.push('ended_at = ?');
    values.push(params.ended_at);
  }

  if (updates.length === 0) return;

  values.push(id);
  const stmt = db.prepare(`UPDATE recordings SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...values);
}

// 获取所有录制记录
export function getAllRecordings(limit: number = 100, offset: number = 0): Recording[] {
  const stmt = db.prepare(`
    SELECT * FROM recordings 
    WHERE status != 'deleted'
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset) as Recording[];
}

// 获取正在录制的记录
export function getActiveRecording(): Recording | null {
  const stmt = db.prepare(`
    SELECT * FROM recordings WHERE status = 'recording' ORDER BY created_at DESC LIMIT 1
  `);
  return stmt.get() as Recording | null;
}

// 删除录制记录（软删除）
export function deleteRecording(id: number): void {
  const stmt = db.prepare(`UPDATE recordings SET status = 'deleted' WHERE id = ?`);
  stmt.run(id);
}

// 硬删除录制记录
export function hardDeleteRecording(id: number): void {
  const stmt = db.prepare('DELETE FROM recordings WHERE id = ?');
  stmt.run(id);
}

// 获取总存储使用量
export function getTotalStorageUsed(): number {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(file_size), 0) as total 
    FROM recordings 
    WHERE status IN ('completed', 'recording')
  `);
  const result = stmt.get() as { total: number };
  return result.total;
}

// 获取最旧的录制记录
export function getOldestRecordings(limit: number = 10): Recording[] {
  const stmt = db.prepare(`
    SELECT * FROM recordings 
    WHERE status = 'completed'
    ORDER BY created_at ASC 
    LIMIT ?
  `);
  return stmt.all(limit) as Recording[];
}

// 获取录制统计
export function getRecordingStats(): {
  total_count: number;
  total_size: number;
  total_duration: number;
  recording_count: number;
} {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total_count,
      COALESCE(SUM(file_size), 0) as total_size,
      COALESCE(SUM(duration), 0) as total_duration,
      SUM(CASE WHEN status = 'recording' THEN 1 ELSE 0 END) as recording_count
    FROM recordings 
    WHERE status != 'deleted'
  `);
  return stmt.get() as any;
}
