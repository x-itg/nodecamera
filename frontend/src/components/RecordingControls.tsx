import { useState } from 'react';
import { Play, Square, Pause, RotateCcw, Circle } from 'lucide-react';
import { recordingApi } from '../services/api';
import type { RecordingState } from '../types';

interface RecordingControlsProps {
  recordingState: RecordingState | null;
  cameraPath: string | null;
  onStateChange: () => void;
}

export function RecordingControls({
  recordingState,
  cameraPath,
  onStateChange,
}: RecordingControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRecording = recordingState?.isRecording ?? false;
  const isPaused = recordingState?.isPaused ?? false;

  const handleStart = async () => {
    if (!cameraPath) {
      setError('请先选择摄像头');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await recordingApi.start(cameraPath);
    if (!result.success) {
      setError(result.message || '启动录制失败');
    } else {
      // 录制启动成功，等待WebSocket状态更新，不立即调用onStateChange
      // WebSocket会自动更新状态
    }

    setIsLoading(false);
    // 延迟一小段时间后再调用状态更新，确保WebSocket已经处理完毕
    setTimeout(() => {
      onStateChange();
    }, 500);
  };

  const handleStop = async () => {
    setIsLoading(true);
    setError(null);

    const result = await recordingApi.stop();
    if (!result.success) {
      setError(result.message || '停止录制失败');
    }

    setIsLoading(false);
    onStateChange();
  };

  const handlePause = async () => {
    setIsLoading(true);
    setError(null);

    const result = await recordingApi.pause();
    if (!result.success) {
      setError(result.message || '暂停录制失败');
    }

    setIsLoading(false);
    onStateChange();
  };

  const handleResume = async () => {
    setIsLoading(true);
    setError(null);

    const result = await recordingApi.resume();
    if (!result.success) {
      setError(result.message || '恢复录制失败');
    }

    setIsLoading(false);
    onStateChange();
  };

  // 格式化时间
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="card-glass p-6">
      <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center gap-2">
        <Circle className="w-5 h-5 text-primary-500" />
        录制控制
      </h3>

      {/* 状态显示 */}
      <div className="mb-6 p-4 bg-dark-bg/50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-dark-muted">状态</span>
          <span
            className={`status-badge ${
              isRecording
                ? 'status-badge-recording'
                : isPaused
                ? 'status-badge-paused'
                : 'status-badge-idle'
            }`}
          >
            {isRecording ? '录制中' : isPaused ? '已暂停' : '待机'}
          </span>
        </div>

        {isRecording && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-dark-muted">录制时长</span>
              <span className="text-dark-text font-mono">
                {formatTime(recordingState?.elapsedSeconds ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-dark-muted">文件大小</span>
              <span className="text-dark-text">
                {formatSize(recordingState?.currentFileSize ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-muted">分段</span>
              <span className="text-dark-text">#{recordingState?.segmentNumber ?? 0}</span>
            </div>
          </>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 控制按钮 */}
      <div className="flex gap-3">
        {!isRecording && !isPaused ? (
          <button
            onClick={handleStart}
            disabled={isLoading || !cameraPath}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            <Circle className="w-5 h-5 fill-current" />
            {isLoading ? '正在启动...' : '开始录制'}
          </button>
        ) : (
          <>
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-dark-border hover:bg-dark-muted disabled:opacity-50 text-dark-text font-medium rounded-lg transition-colors"
            >
              <Square className="w-5 h-5" />
              停止
            </button>

            {isRecording ? (
              <button
                onClick={handlePause}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                <Pause className="w-5 h-5" />
                暂停
              </button>
            ) : (
              <button
                onClick={handleResume}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                恢复
              </button>
            )}
          </>
        )}
      </div>

      {/* 提示 */}
      {!cameraPath && (
        <p className="mt-4 text-sm text-dark-muted text-center">
          请先在设置中选择摄像头设备
        </p>
      )}
    </div>
  );
}
