import { HardDrive, AlertTriangle } from 'lucide-react';
import type { StorageStatus as StorageStatusType } from '../types';

interface StorageStatusProps {
  status: StorageStatusType | null;
}

export function StorageStatus({ status }: StorageStatusProps) {
  if (!status) {
    return (
      <div className="card-glass p-6">
        <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-primary-500" />
          存储状态
        </h3>
        <div className="text-dark-muted text-center py-4">加载中...</div>
      </div>
    );
  }

  // 格式化存储大小
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isWarning = status.percentage >= 80;
  const isCritical = status.percentage >= 95;

  return (
    <div className="card-glass p-6">
      <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center gap-2">
        <HardDrive className="w-5 h-5 text-primary-500" />
        存储状态
      </h3>

      {/* 进度条 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-dark-muted text-sm">已使用</span>
          <span
            className={`text-sm font-medium ${
              isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-dark-text'
            }`}
          >
            {status.percentage}%
          </span>
        </div>
        <div className="w-full h-3 bg-dark-bg rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isCritical
                ? 'bg-gradient-to-r from-red-500 to-red-600'
                : isWarning
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                : 'bg-gradient-to-r from-primary-500 to-primary-600'
            }`}
            style={{ width: `${Math.min(status.percentage, 100)}%` }}
          />
        </div>
      </div>

      {/* 详细信息 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-dark-muted text-sm">已使用</span>
          <span className="text-dark-text">{formatSize(status.used)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-dark-muted text-sm">总容量</span>
          <span className="text-dark-text">{formatSize(status.limit)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-dark-muted text-sm">剩余</span>
          <span className="text-dark-text">{formatSize(status.limit - status.used)}</span>
        </div>
      </div>

      {/* 警告提示 */}
      {isWarning && (
        <div
          className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
            isCritical
              ? 'bg-red-500/10 border border-red-500/30 text-red-400'
              : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
          }`}
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            {isCritical ? (
              <span>存储空间即将耗尽，请清理旧录制或增加存储限制</span>
            ) : (
              <span>存储空间使用率较高，建议及时清理</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
