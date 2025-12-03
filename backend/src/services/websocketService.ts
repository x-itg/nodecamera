import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { addLog } from '../config/database';
import unifiedMediaService from './unifiedMediaService';

interface WSClient {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // 初始化WebSocket服务器
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = uuidv4();
      const client: WSClient = { id: clientId, ws, isAlive: true };
      this.clients.set(clientId, client);

      addLog('info', 'websocket', `客户端连接: ${clientId}，当前连接数: ${this.clients.size}`);

      // 发送欢迎消息
      this.sendToClient(clientId, {
        type: 'connected',
        data: { clientId },
      });

      // 发送当前状态
      this.sendCurrentStatus(clientId);

      // 处理消息
      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(clientId, data);
        } catch (error) {
          addLog('error', 'websocket', `解析消息失败: ${message.toString().slice(0, 100)}`);
        }
      });

      // 处理心跳
      ws.on('pong', () => {
        client.isAlive = true;
      });

      // 处理关闭
      ws.on('close', () => {
        this.clients.delete(clientId);
        addLog('info', 'websocket', `客户端断开: ${clientId}，当前连接数: ${this.clients.size}`);
      });

      // 处理错误
      ws.on('error', (error) => {
        addLog('error', 'websocket', `WebSocket错误: ${error.message}`);
        this.clients.delete(clientId);
      });
    });

    // 启动心跳检测
    this.startHeartbeat();

    // 监听录制服务事件
    this.setupRecordingEvents();

    addLog('info', 'websocket', 'WebSocket服务已初始化');
  }

  // 启动心跳检测
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, id) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(id);
          return;
        }
        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000);
  }

  // 设置录制服务事件监听
  private setupRecordingEvents(): void {
    unifiedMediaService.on('streamStarted', (data) => {
      this.broadcast({
        type: 'streamStarted',
        data,
      });
    });

    unifiedMediaService.on('streamStopped', (data) => {
      this.broadcast({
        type: 'streamStopped',
        data,
      });
    });

    unifiedMediaService.on('recordingStarted', (data) => {
      console.log('[WebSocketService] 录制开始事件:', data);
      this.broadcast({
        type: 'recordingStarted',
        data,
      });
    });

    unifiedMediaService.on('recordingEnded', (data) => {
      console.log('[WebSocketService] 录制结束事件:', data);
      this.broadcast({
        type: 'recordingEnded',
        data,
      });
    });

    unifiedMediaService.on('recordingProgress', (data) => {
      this.broadcast({
        type: 'recordingProgress',
        data,
      });
    });
  }

  // 处理客户端消息
  private handleMessage(clientId: string, message: any): void {
    switch (message.type) {
      case 'ping':
        this.sendToClient(clientId, { type: 'pong' });
        break;
      case 'getStatus':
        this.sendCurrentStatus(clientId);
        break;
      default:
        addLog('warn', 'websocket', `未知消息类型: ${message.type}`);
    }
  }

  // 发送当前状态
  private sendCurrentStatus(clientId: string): void {
    const mediaState = unifiedMediaService.getState();
    const storageStatus = unifiedMediaService.getStorageStatus();

    // 构建符合前端期望的状态结构
    this.sendToClient(clientId, {
      type: 'status',
      data: {
        recording: {
          isRecording: mediaState.isRecording,
          recordingId: mediaState.currentRecordingId,
          startTime: mediaState.recordingStartTime?.toISOString() || null,
          duration: mediaState.recordingStartTime 
            ? Math.floor((Date.now() - mediaState.recordingStartTime.getTime()) / 1000)
            : 0,
        },
        storage: storageStatus,
        stream: {
          isStreaming: mediaState.isStreaming,
          device: mediaState.currentDevice,
        },
      },
    });
  }

  // 发送消息给单个客户端
  sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  // 广播消息给所有客户端
  broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  // 获取连接数
  getClientCount(): number {
    return this.clients.size;
  }

  // 关闭服务
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.clients.forEach((client) => {
      client.ws.close();
    });
    this.clients.clear();
    this.wss?.close();
  }
}

export const websocketService = new WebSocketService();
export default websocketService;
