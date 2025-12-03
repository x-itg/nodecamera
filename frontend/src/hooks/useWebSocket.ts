import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebSocketMessage, RecordingState, StorageStatus, StreamStatus } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

interface UseWebSocketReturn {
  isConnected: boolean;
  recordingState: RecordingState | null;
  storageStatus: StorageStatus | null;
  streamStatus: StreamStatus | null;
  sendMessage: (message: WebSocketMessage) => void;
  reconnect: () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('WebSocket已连接');
        setIsConnected(true);
        // 请求当前状态
        ws.send(JSON.stringify({ type: 'getStatus' }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('解析WebSocket消息失败:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket已断开');
        setIsConnected(false);
        // 自动重连
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('WebSocket连接失败:', error);
    }
  }, []);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'status':
        if (message.data?.recording) {
          setRecordingState((prev) => ({
            ...message.data.recording,
            // 保留之前的 currentFileSize，避免被 status 中的旧值覆盖
            currentFileSize: message.data.recording.currentFileSize || prev?.currentFileSize || 0,
          }));
        }
        if (message.data?.storage) {
          setStorageStatus(message.data.storage);
        }
        if (message.data?.stream) {
          setStreamStatus(message.data.stream);
        }
        break;

      case 'recordingStarted':
        // 直接设置录制状态为开始
        setRecordingState((prev) => ({
          ...prev,
          isRecording: true,
          isPaused: false,
          startTime: new Date().toISOString(),
          elapsedSeconds: 0,
          currentRecordingId: message.data?.recordingId || prev?.currentRecordingId || null,
        }));
        break;

      case 'recordingEnded':
      case 'recordingPaused':
      case 'recordingResumed':
        // 请求最新状态以确保数据准确
        wsRef.current?.send(JSON.stringify({ type: 'getStatus' }));
        break;

      case 'recordingStatus':
        if (message.data) {
          setRecordingState(message.data);
        }
        break;

      case 'recordingProgress':
        // 更新录制时长和文件大小
        if (message.data) {
          setRecordingState((prev) => ({
            ...prev,
            elapsedSeconds: message.data.duration || prev?.elapsedSeconds || 0,
            // 只有当 fileSize 存在且大于 0 时才更新，避免被 status 事件覆盖
            currentFileSize: message.data.fileSize !== undefined && message.data.fileSize > 0 
              ? message.data.fileSize 
              : prev?.currentFileSize || 0,
          }));
        }
        break;

      case 'streamStopped':
        setStreamStatus((prev) => (prev ? { ...prev, isStreaming: false } : null));
        break;

      case 'streamStarted':
        // 更新流状态
        if (message.data?.recording) {
          setRecordingState((prev) => ({
            ...prev,
            isRecording: message.data.recording,
            currentRecordingId: message.data.recordingId || prev?.currentRecordingId || null,
          }));
        }
        break;

      default:
        break;
    }
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    recordingState,
    storageStatus,
    streamStatus,
    sendMessage,
    reconnect,
  };
}
