import { useEffect, useState } from 'react';
import { Film, Download, Trash2, RefreshCw, Clock, HardDrive, Calendar } from 'lucide-react';
import { recordingApi } from '../services/api';
import type { Recording, RecordingStats } from '../types';

export function RecordingList() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadRecordings = async () => {
    setIsLoading(true);
    const result = await recordingApi.getList();
    if (result.success && result.data) {
      setRecordings(result.data.recordings);
      setStats(result.data.stats);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadRecordings();
    // 定期刷新
    const interval = setInterval(loadRecordings, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此录制吗？此操作不可撤销。')) {
      return;
    }

    setDeletingId(id);
    const result = await recordingApi.delete(id);
    if (result.success) {
      loadRecordings();
    }
    setDeletingId(null);
  };

  const handleDownload = (id: number) => {
    window.open(recordingApi.getDownloadUrl(id), '_blank');
  };

  // 格式化时间
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}时${mins}分${secs}秒`;
    }
    if (mins > 0) {
      return `${mins}分${secs}秒`;
    }
    return `${secs}秒`;
  };

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化日期
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取状态标签
  const getStatusBadge = (status: Recording['status']) => {
    const styles: Record<string, string> = {
      recording: 'status-badge-recording',
      completed: 'bg-green-500/20 text-green-400 border border-green-500/30',
      error: 'bg-red-500/20 text-red-400 border border-red-500/30',
    };
    const labels: Record<string, string> = {
      recording: '录制中',
      completed: '已完成',
      error: '错误',
    };
    return (
      <span className={`status-badge ${styles[status] || styles.completed}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="card-glass p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-dark-text flex items-center gap-2">
          <Film className="w-5 h-5 text-primary-500" />
          录制历史
        </h3>
        <button
          onClick={loadRecordings}
          disabled={isLoading}
          className="text-primary-500 hover:text-primary-400 transition-colors"
          title="刷新列表"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 统计信息 */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-dark-bg/50 rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-dark-text">{stats.total_count}</div>
            <div className="text-xs text-dark-muted">总录制数</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-dark-text">{formatSize(stats.total_size)}</div>
            <div className="text-xs text-dark-muted">总大小</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-dark-text">
              {formatDuration(stats.total_duration)}
            </div>
            <div className="text-xs text-dark-muted">总时长</div>
          </div>
        </div>
      )}

      {/* 录制列表 */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin">
        {isLoading && recordings.length === 0 ? (
          <div className="text-center py-8 text-dark-muted">加载中...</div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-8 text-dark-muted">暂无录制记录</div>
        ) : (
          recordings.map((recording) => (
            <div
              key={recording.id}
              className="p-4 bg-dark-bg/50 rounded-lg hover:bg-dark-bg/70 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-dark-text font-medium truncate">
                      {recording.filename}
                    </span>
                    {getStatusBadge(recording.status)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-dark-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDuration(recording.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      {formatSize(recording.file_size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(recording.started_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {recording.status === 'completed' && (
                    <button
                      onClick={() => handleDownload(recording.id)}
                      className="p-2 text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors"
                      title="下载"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(recording.id)}
                    disabled={deletingId === recording.id || recording.status === 'recording'}
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="删除"
                  >
                    <Trash2
                      className={`w-5 h-5 ${deletingId === recording.id ? 'animate-pulse' : ''}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
