export interface CameraDevice {
  id: string;
  name: string;
  path: string;
  capabilities: string[];
  resolutions: string[];
  status: 'available' | 'in_use' | 'error';
}

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

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  currentRecordingId: number | null;
  startTime: string | null;
  elapsedSeconds: number;
  currentFileSize: number;
  segmentNumber: number;
}

export interface StorageStatus {
  used: number;
  limit: number;
  percentage: number;
  path?: string;
}

export interface StreamStatus {
  isStreaming: boolean;
  clientCount: number;
  device: string | null;
}

export interface AppConfig {
  selected_camera: string;
  recording_duration: string;
  storage_limit: string;
  max_file_size: string;
  video_quality: string;
  video_fps: string;
  video_resolution: string;
  storage_path: string;
  auto_start: string;
  auto_cleanup: string;
}

export interface RecordingStats {
  total_count: number;
  total_size: number;
  total_duration: number;
  recording_count: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
}
