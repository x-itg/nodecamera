import type {
  CameraDevice,
  Recording,
  RecordingState,
  StorageStatus,
  AppConfig,
  RecordingStats,
  ApiResponse,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    return await response.json();
  } catch (error: any) {
    return {
      success: false,
      message: error.message || '网络请求失败',
    };
  }
}

// 摄像头相关API
export const cameraApi = {
  // 获取所有摄像头设备
  getDevices: () =>
    fetchApi<{ cameras: CameraDevice[]; selectedCamera: string }>('/camera/devices'),

  // 选择摄像头
  selectCamera: (devicePath: string) =>
    fetchApi<{ camera: CameraDevice }>('/camera/select', {
      method: 'POST',
      body: JSON.stringify({ devicePath }),
    }),

  // 测试摄像头
  testCamera: (devicePath?: string) =>
    fetchApi('/camera/test', {
      method: 'POST',
      body: JSON.stringify({ devicePath }),
    }),

  // 获取摄像头信息
  getCameraInfo: (deviceId: string) =>
    fetchApi<CameraDevice>(`/camera/info/${deviceId}`),
};

// 录制相关API
export const recordingApi = {
  // 获取录制状态
  getStatus: () =>
    fetchApi<{ recording: RecordingState; storage: StorageStatus }>('/recording/status'),

  // 开始录制
  start: (cameraPath?: string) =>
    fetchApi<{ recordingId: number }>('/recording/start', {
      method: 'POST',
      body: JSON.stringify({ cameraPath }),
    }),

  // 停止录制
  stop: () =>
    fetchApi('/recording/stop', {
      method: 'POST',
    }),

  // 暂停录制
  pause: () =>
    fetchApi('/recording/pause', {
      method: 'POST',
    }),

  // 恢复录制
  resume: () =>
    fetchApi('/recording/resume', {
      method: 'POST',
    }),

  // 获取录制列表
  getList: (limit = 100, offset = 0) =>
    fetchApi<{ recordings: Recording[]; stats: RecordingStats }>(
      `/recording/list?limit=${limit}&offset=${offset}`
    ),

  // 获取单个录制详情
  getById: (id: number) => fetchApi<Recording>(`/recording/${id}`),

  // 删除录制
  delete: (id: number) =>
    fetchApi(`/recording/${id}`, {
      method: 'DELETE',
    }),

  // 获取下载链接
  getDownloadUrl: (id: number) => `${API_BASE}/recording/${id}/download`,

  // 获取存储状态
  getStorageStatus: () =>
    fetchApi<StorageStatus & { path: string }>('/recording/storage/status'),
};

// 配置相关API
export const configApi = {
  // 获取所有配置
  getAll: () => fetchApi<AppConfig>('/config'),

  // 获取单个配置
  get: (key: string) => fetchApi<{ key: string; value: string }>(`/config/${key}`),

  // 更新单个配置
  update: (key: string, value: string) =>
    fetchApi(`/config/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  // 批量更新配置
  updateAll: (configs: Partial<AppConfig>) =>
    fetchApi('/config', {
      method: 'PUT',
      body: JSON.stringify(configs),
    }),

  // 获取日志
  getLogs: (limit = 100, category?: string) =>
    fetchApi<any[]>(`/config/logs/list?limit=${limit}${category ? `&category=${category}` : ''}`),
};

// 流相关API
export const streamApi = {
  // 获取流状态
  getStatus: () =>
    fetchApi<{ isStreaming: boolean; clientCount: number; device: string | null }>(
      '/stream/status'
    ),

  // 启动流
  start: (devicePath?: string) =>
    fetchApi('/stream/start', {
      method: 'POST',
      body: JSON.stringify({ devicePath }),
    }),

  // 停止流
  stop: () =>
    fetchApi('/stream/stop', {
      method: 'POST',
    }),

  // 获取视频流URL
  getVideoUrl: (devicePath?: string) =>
    `${API_BASE}/stream/video${devicePath ? `?device=${encodeURIComponent(devicePath)}` : ''}`,

  // 获取快照URL
  getSnapshotUrl: () => `${API_BASE}/stream/snapshot`,
};

// 增强录制相关API
export const enhancedRecordingApi = {
  // 获取增强录制状态
  getStatus: () =>
    fetchApi<{
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
    }>('/enhanced-recording/status'),

  // 启动增强录制
  start: (devicePath: string, enableRecording: boolean = false) =>
    fetchApi<{ recordingId?: number }>('/enhanced-recording/start', {
      method: 'POST',
      body: JSON.stringify({ devicePath, enableRecording }),
    }),

  // 停止录制但保持预览
  stop: () =>
    fetchApi('/enhanced-recording/stop', {
      method: 'POST',
    }),

  // 停止增强流（完全停止）
  stopStream: () =>
    fetchApi('/enhanced-recording/stop-stream', {
      method: 'POST',
    }),

  // 更新录制配置
  updateConfig: (config: {
    maxSegmentSize?: number;
    storageLimit?: number;
    autoCleanup?: boolean;
  }) =>
    fetchApi('/enhanced-recording/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // 清理存储空间
  cleanup: (targetSize?: number) =>
    fetchApi('/enhanced-recording/cleanup', {
      method: 'POST',
      body: JSON.stringify({ targetSize }),
    }),
};

// 健康检查
export const healthCheck = () =>
  fetchApi<{ message: string; timestamp: string }>('/health');
