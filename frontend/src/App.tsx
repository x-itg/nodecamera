import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { RecordingControls } from './components/RecordingControls';
import { SettingsPanel } from './components/SettingsPanel';
import { StorageStatus } from './components/StorageStatus';
import { RecordingList } from './components/RecordingList';
import { useWebSocket } from './hooks/useWebSocket';
import { healthCheck } from './services/api';

function App() {
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [isServerOnline, setIsServerOnline] = useState(false);

  const {
    isConnected,
    recordingState,
    storageStatus,
  } = useWebSocket();

  // 检查服务器状态
  const checkServer = useCallback(async () => {
    const result = await healthCheck();
    setIsServerOnline(result.success);
  }, []);

  useEffect(() => {
    checkServer();
    const interval = setInterval(checkServer, 10000);
    return () => clearInterval(interval);
  }, [checkServer]);

  // 刷新状态
  const handleStateChange = useCallback(() => {
    // WebSocket会自动更新状态
  }, []);

  // 处理摄像头选择
  const handleCameraChange = useCallback((path: string) => {
    setSelectedCamera(path);
  }, []);

  return (
    <div className="min-h-screen">
      <Header isConnected={isConnected && isServerOnline} />

      <main className="container mx-auto px-4 py-6">
        {/* 服务器离线提示 */}
        {!isServerOnline && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <div>
                <p className="font-medium">服务器未连接</p>
                <p className="text-sm opacity-80">
                  请确保后端服务正在运行。运行命令: <code className="bg-dark-bg px-2 py-0.5 rounded">npm run dev</code>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：视频预览 */}
          <div className="lg:col-span-2 space-y-6">
            <VideoPreview
              cameraPath={selectedCamera}
              isRecording={recordingState?.isRecording ?? false}
            />

            {/* 录制列表 */}
            <RecordingList />
          </div>

          {/* 右侧：控制面板 */}
          <div className="space-y-6">
            {/* 录制控制 */}
            <RecordingControls
              recordingState={recordingState}
              cameraPath={selectedCamera}
              onStateChange={handleStateChange}
            />

            {/* 存储状态 */}
            <StorageStatus status={storageStatus} />

            {/* 设置面板 */}
            <SettingsPanel
              onCameraChange={handleCameraChange}
              selectedCamera={selectedCamera}
            />
          </div>
        </div>

        {/* 底部信息 */}
        <footer className="mt-8 pt-6 border-t border-dark-border/50 text-center text-dark-muted text-sm">
          <p>USB 摄像头录制系统 v1.0.0</p>
          <p className="mt-1 text-xs">
            基于 FFmpeg 实现高效视频录制和压缩
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
