import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { addLog, getConfig } from '../config/database';
import { 
  isWindows, 
  getPlatform,
  getTermSignal,
  getKillSignal 
} from '../utils/platform';
import { getCameraFFmpegInput } from './cameraService';

interface StreamClient {
  id: string;
  write: (data: Buffer) => boolean;
  end: () => void;
}

class StreamService extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private clients: Map<string, StreamClient> = new Map();
  private isStreaming: boolean = false;
  private currentDevice: string | null = null;
  private frameBuffer: Buffer[] = [];
  private readonly MAX_BUFFER_SIZE = 10;
  private isRecording: boolean = false; // 标记是否正在录制

  // 检查是否正在录制
  isInRecordingMode(): boolean {
    return this.isRecording;
  }

  // 设置录制模式（由 recordingService 调用）
  setRecordingMode(recording: boolean): void {
    this.isRecording = recording;
  }

  // 开始视频流
  async startStream(devicePath: string): Promise<{ success: boolean; message: string }> {
    if (this.isStreaming && this.currentDevice === devicePath) {
      return { success: true, message: '流已在运行' };
    }

    // 如果正在使用其他设备，先停止
    if (this.isStreaming) {
      await this.stopStream();
    }

    const fps = getConfig('video_fps') || '30';
    const resolution = getConfig('video_resolution') || '1280x720';

    try {
      // 获取跨平台FFmpeg输入参数
      const inputArgs = getCameraFFmpegInput(devicePath, fps, resolution);
      
      // 使用FFmpeg生成MJPEG流
      const ffmpegArgs = [
        ...inputArgs,
        '-f', 'mjpeg',
        '-q:v', '5',
        '-'
      ];

      console.log('[StreamService] FFmpeg命令:', 'ffmpeg', ffmpegArgs.join(' '));

      const ffmpegCmd = isWindows() ? 'ffmpeg' : 'ffmpeg';
      this.ffmpegProcess = spawn(ffmpegCmd, ffmpegArgs, {
        windowsHide: true
      });
      this.currentDevice = devicePath;
      this.isStreaming = true;

      // 处理MJPEG数据
      let buffer = Buffer.alloc(0);
      const JPEG_START = Buffer.from([0xff, 0xd8]);
      const JPEG_END = Buffer.from([0xff, 0xd9]);

      this.ffmpegProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (true) {
          const startIndex = buffer.indexOf(JPEG_START);
          const endIndex = buffer.indexOf(JPEG_END);

          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const frame = buffer.slice(startIndex, endIndex + 2);
            buffer = buffer.slice(endIndex + 2);

            // 存储最新帧
            this.frameBuffer.push(frame);
            if (this.frameBuffer.length > this.MAX_BUFFER_SIZE) {
              this.frameBuffer.shift();
            }

            // 发送给所有客户端
            this.broadcastFrame(frame);
          } else {
            break;
          }
        }

        // 防止缓冲区过大
        if (buffer.length > 1024 * 1024) {
          buffer = Buffer.alloc(0);
        }
      });

      this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        // FFmpeg的状态输出
        const output = data.toString();
        console.log('[StreamService] FFmpeg stderr:', output.substring(0, 300));
        if (output.includes('error') || output.includes('Error')) {
          addLog('error', 'stream', `FFmpeg流错误: ${output.slice(0, 200)}`);
        }
      });

      this.ffmpegProcess.on('close', (code) => {
        console.log('[StreamService] FFmpeg进程关闭，退出码:', code);
        this.isStreaming = false;
        this.currentDevice = null;
        this.ffmpegProcess = null;
        addLog('info', 'stream', `视频流已停止，退出码: ${code}`);
        this.emit('streamStopped', { code });
      });

      this.ffmpegProcess.on('error', (error) => {
        addLog('error', 'stream', `FFmpeg进程错误: ${error.message}`);
        this.stopStream();
      });

      addLog('info', 'stream', `视频流已启动: ${devicePath}`);
      return { success: true, message: '视频流已启动' };
    } catch (error: any) {
      addLog('error', 'stream', `启动视频流失败: ${error.message}`);
      return { success: false, message: `启动视频流失败: ${error.message}` };
    }
  }

  // 停止视频流
  async stopStream(): Promise<{ success: boolean; message: string }> {
    if (!this.isStreaming || !this.ffmpegProcess) {
      return { success: true, message: '流未运行' };
    }

    try {
      this.ffmpegProcess.kill('SIGTERM');
      
      // 等待进程结束
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.ffmpegProcess?.kill('SIGKILL');
          resolve();
        }, 3000);

        this.ffmpegProcess?.once('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // 通知所有客户端
      this.clients.forEach(client => {
        try {
          client.end();
        } catch {}
      });
      this.clients.clear();
      this.frameBuffer = [];

      return { success: true, message: '视频流已停止' };
    } catch (error: any) {
      return { success: false, message: `停止视频流失败: ${error.message}` };
    }
  }

  // 添加流客户端
  addClient(client: StreamClient): void {
    this.clients.set(client.id, client);
    
    // 发送最新帧给新客户端
    if (this.frameBuffer.length > 0) {
      const latestFrame = this.frameBuffer[this.frameBuffer.length - 1];
      this.sendFrameToClient(client, latestFrame);
    }

    addLog('info', 'stream', `新客户端连接: ${client.id}，当前连接数: ${this.clients.size}`);
  }

  // 移除流客户端
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    addLog('info', 'stream', `客户端断开: ${clientId}，当前连接数: ${this.clients.size}`);

    // 如果没有客户端，停止流
    if (this.clients.size === 0 && this.isStreaming) {
      addLog('info', 'stream', '没有活跃客户端，5秒后停止流');
      setTimeout(() => {
        if (this.clients.size === 0 && this.isStreaming) {
          this.stopStream();
        }
      }, 5000);
    }
  }

  // 发送帧给单个客户端
  private sendFrameToClient(client: StreamClient, frame: Buffer): void {
    try {
      const header = Buffer.from(
        `--mjpegboundary\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
      );
      client.write(header);
      client.write(frame);
      client.write(Buffer.from('\r\n'));
    } catch (error) {
      this.removeClient(client.id);
    }
  }

  // 广播帧给所有客户端
  private broadcastFrame(frame: Buffer): void {
    this.clients.forEach(client => {
      this.sendFrameToClient(client, frame);
    });
  }

  // 获取流状态
  getStatus(): { isStreaming: boolean; clientCount: number; device: string | null } {
    return {
      isStreaming: this.isStreaming,
      clientCount: this.clients.size,
      device: this.currentDevice,
    };
  }

  // 获取最新帧（用于快照）
  getLatestFrame(): Buffer | null {
    if (this.frameBuffer.length === 0) {
      return null;
    }
    return this.frameBuffer[this.frameBuffer.length - 1];
  }
}

export const streamService = new StreamService();
export default streamService;
