import { useState, useEffect } from 'react';
import { Play, Square, Circle, HardDrive, Settings, AlertTriangle } from 'lucide-react';
import { enhancedRecordingApi } from '../services/api';

interface EnhancedRecordingState {
  isStreaming: boolean;
  isRecording: boolean;
  currentDevice: string | null;
  currentRecordingId: number | null;
  recordingStartTime: string | null;
  recordingFilePath: string | null;
  segmentNumber: number;
  currentFileSize: number;
  elapsedSeconds: number;
  totalStorageUsed: number;
  storageLimit: number;
  storagePercentage: number;
  maxSegmentSize: number;
  autoCleanup: boolean;
}

interface EnhancedRecordingControlsProps {
  recordingState: EnhancedRecordingState | null;
  cameraPath: string | null;
  onStateChange: () => void;
}

export function EnhancedRecordingControls({
  recordingState,
  cameraPath,
  onStateChange,
}: EnhancedRecordingControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState({
    maxSegmentSize: 500 * 1024 * 1024, // 500MB
    storageLimit: 100 * 1024 * 1024 * 1024, // 100GB
    autoCleanup: true
  });

  const isRecording = recordingState?.isRecording ?? false;
  const isStreaming = recordingState?.isStreaming ?? false;

  // 初始化配置
  useEffect(() => {
    if (recordingState) {
      setConfig({
        maxSegmentSize: recordingState.maxSegmentSize,
        storageLimit: recordingState.storageLimit,
        autoCleanup: recordingState.autoCleanup
      });
    }
  }, [recordingState]);

  const handleStartStream = async () => {
    if (!cameraPath) {
      setError('请先选择摄像头');
      return;
    }

    setIsLoading(true);
    setError(null);

    // 启动预览模式
    const result = await enhancedRecordingApi.start(cameraPath, false);
    if (!result.success) {
      setError(result.message || '启动预览失败');
    }

    setIsLoading(false);
    setTimeout(() => {
      onStateChange();
    }, 500);
  };

  const handleStartRecording = async () => {
    if (!cameraPath) {
      setError('请先选择摄像头');
      return;
    }

    setIsLoading(true);
    setError(null);

    // 启动录制模式
    const result = await enhancedRecordingApi.start(cameraPath, true);
    if (!result.success) {
      setError(result.message || '启动录制失败');
    }

    setIsLoading(false);
    setTimeout(() => {
      onStateChange();
    }, 500);
  };

  const handleStopRecording = async () => {
    setIsLoading(true);
    setError(null);

    const result = await enhancedRecordingApi.stop();
    if (!result.success) {
      setError(result.message || '停止录制失败');
    }

    setIsLoading(false);
    onStateChange();
  };

  const handleStopStream = async () => {
    setIsLoading(true);
    setError(null);

    const result = await enhancedRecordingApi.stopStream();
    if (!result.success) {
      setError(result.message || '停止流失败');
    }

    setIsLoading(false);
    onStateChange();
  };

  const handleUpdateConfig = async () => {
    setIsLoading(true);
    setError(null);

    const result = await enhancedRecordingApi.updateConfig(config);
    if (!result.success) {
      setError(result.message || '更新配置失败');
    } else {
      setShowConfig(false);
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
        增强录制控制
      </h3>

      {/* 状态显示 */}
      <div className="mb-6 p-4 bg-dark-bg/50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-dark-muted">状态</span>
          <span
            className={`status-badge ${
              isRecording
                ? 'status-badge-recording'
                : isStreaming
                ? 'status-badge-streaming'
                : 'status-badge-idle'
            }`}
          >
            {isRecording ? '录制中' : isStreaming ? '预览中' : '待机'}
          </span>
        </div>

        {(isRecording || isStreaming) && (
          <>
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
                <div className="flex items-center justify-between mb-2">
                  <span className="text-dark-muted">分段</span>
                  <span className="text-dark-text">#{recordingState?.segmentNumber ?? 0}</span>
                </div>
              </>
            )}
            
            {/* 存储状态 */}
            <div className="mt-4 pt-3 border-t border-dark-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-dark-muted flex items-center gap-2">
                  <HardDrive className="w-4 h-4" />
                  存储使用
                </span>
                <span className="text-dark-text">
                  {recordingState?.storagePercentage ?? 0}%
                </span>
              </div>
              <div className="w-full bg-dark-bg rounded-full h-2">
                <div 
                  className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(recordingState?.storagePercentage ?? 0, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-dark-muted mt-1">
                <span>{formatSize(recordingState?.totalStorageUsed ?? 0)}</span>
                <span>{formatSize(recordingState?.storageLimit ?? 0)}</span>
              </div>
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

      {/* 存储警告 */}
      {(recordingState?.storagePercentage ?? 0) > 80 && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          存储空间使用率较高，建议及时清理
        </div>
      )}

      {/* 控制按钮 */}
      <div className="flex gap-3 mb-4">
        {!isStreaming && !isRecording ? (
          <>
            <button
              onClick={handleStartStream}
              disabled={isLoading || !cameraPath}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              <Play className="w-5 h-5" />
              {isLoading ? '启动中...' : '开始预览'}
            </button>
            <button
              onClick={handleStartRecording}
              disabled={isLoading || !cameraPath}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              <Circle className="w-5 h-5 fill-current" />
              录制
            </button>
          </>
        ) : (
          <>
            {isRecording && (
              <button
                onClick={handleStopRecording}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-dark-border hover:bg-dark-muted disabled:opacity-50 text-dark-text font-medium rounded-lg transition-colors"
              >
                <Square className="w-5 h-5" />
                停止录制
              </button>
            )}
            
            <button
              onClick={handleStopStream}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              <Square className="w-5 h-5" />
              停止所有
            </button>
          </>
        )}
      </div>

      {/* 配置按钮 */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 px-3 py-2 text-dark-muted hover:text-dark-text transition-colors"
        >
          <Settings className="w-4 h-4" />
          录制配置
        </button>
        
        {(recordingState?.storagePercentage ?? 0) > 50 && (
          <button
            onClick={() => enhancedRecordingApi.cleanup()}
            className="px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            清理存储
          </button>
        )}
      </div>

      {/* 配置面板 */}
      {showConfig && (
        <div className="mt-4 p-4 bg-dark-bg/50 rounded-lg">
          <h4 className="text-sm font-medium text-dark-text mb-3">录制配置</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-dark-muted mb-1">
                单个文件大小限制
              </label>
              <select
                value={config.maxSegmentSize}
                onChange={(e) => setConfig({...config, maxSegmentSize: Number(e.target.value)})}
                className="w-full p-2 bg-dark-bg border border-dark-border rounded text-dark-text"
              >
                <option value={100 * 1024 * 1024}>100MB</option>
                <option value={500 * 1024 * 1024}>500MB</option>
                <option value={1024 * 1024 * 1024}>1GB</option>
                <option value={2 * 1024 * 1024 * 1024}>2GB</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-dark-muted mb-1">
                总存储空间限制
              </label>
              <select
                value={config.storageLimit}
                onChange={(e) => setConfig({...config, storageLimit: Number(e.target.value)})}
                className="w-full p-2 bg-dark-bg border border-dark-border rounded text-dark-text"
              >
                <option value={10 * 1024 * 1024 * 1024}>10GB</option>
                <option value={50 * 1024 * 1024 * 1024}>50GB</option>
                <option value={100 * 1024 * 1024 * 1024}>100GB</option>
                <option value={200 * 1024 * 1024 * 1024}>200GB</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.autoCleanup}
                onChange={(e) => setConfig({...config, autoCleanup: e.target.checked})}
                className="rounded"
              />
              <span className="text-sm text-dark-muted">自动清理旧文件</span>
            </div>
          </div>
          
          <button
            onClick={handleUpdateConfig}
            disabled={isLoading}
            className="mt-3 w-full py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white rounded transition-colors"
          >
            应用配置
          </button>
        </div>
      )}

      {/* 提示 */}
      {!cameraPath && (
        <p className="mt-4 text-sm text-dark-muted text-center">
          请先在设置中选择摄像头设备
        </p>
      )}
    </div>
  );
}