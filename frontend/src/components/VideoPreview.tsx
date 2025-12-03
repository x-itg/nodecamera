import { useEffect, useRef, useState } from 'react';
import { Video, VideoOff, Camera, RefreshCw } from 'lucide-react';
import { streamApi } from '../services/api';

interface VideoPreviewProps {
  cameraPath: string | null;
  isRecording: boolean;
}

export function VideoPreview({ cameraPath, isRecording }: VideoPreviewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!cameraPath) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    // 设置MJPEG流URL，添加时间戳和录制状态来强制重新加载
    const timestamp = Date.now();
    const streamUrl = `${streamApi.getVideoUrl(cameraPath)}&t=${timestamp}&recording=${isRecording}`;
    if (imgRef.current) {
      imgRef.current.src = streamUrl;
    }

    // 启动流
    streamApi.start(cameraPath);

    return () => {
      // 组件卸载时不需要停止流，让后端自动管理
    };
  }, [cameraPath, retryCount, isRecording]); // 添加 isRecording 到依赖项

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  if (!cameraPath) {
    return (
      <div className="video-preview flex flex-col items-center justify-center bg-dark-card text-dark-muted">
        <Camera className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">请先选择摄像头设备</p>
        <p className="text-sm mt-2">在设置面板中选择要使用的摄像头</p>
      </div>
    );
  }

  return (
    <div className="video-preview relative">
      {/* 视频流 */}
      <img
        ref={imgRef}
        alt="摄像头预览"
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoading || hasError ? 'opacity-0' : 'opacity-100'
        }`}
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* 加载中状态 */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-card">
          <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mb-4" />
          <p className="text-dark-muted">正在加载预览...</p>
        </div>
      )}

      {/* 错误状态 */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-card text-dark-muted">
          <VideoOff className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium mb-4">无法获取视频流</p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        </div>
      )}

      {/* 录制指示器 */}
      {isRecording && (
        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 text-white rounded-full">
          <div className="w-2.5 h-2.5 bg-white rounded-full animate-recording-pulse" />
          <span className="text-sm font-medium">REC</span>
        </div>
      )}

      {/* 摄像头信息 */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white text-sm rounded-lg">
        <Video className="w-4 h-4" />
        <span>{cameraPath}</span>
      </div>
    </div>
  );
}
