import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, setConfig, addLog } from '../config/database';
import * as RecordingModel from '../models/recording';
import { EventEmitter } from 'events';
import { 
  getPlatform, 
  isWindows, 
  getFFmpegInputFormat,
  getTermSignal,
  getKillSignal 
} from '../utils/platform';
import { getCameraFFmpegInput } from './cameraService';

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  currentRecordingId: number | null;
  startTime: Date | null;
  elapsedSeconds: number;
  currentFileSize: number;
  segmentNumber: number;
}

class RecordingService extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private state: RecordingState = {
    isRecording: false,
    isPaused: false,
    currentRecordingId: null,
    startTime: null,
    elapsedSeconds: 0,
    currentFileSize: 0,
    segmentNumber: 0,
  };
  private elapsedTimer: NodeJS.Timeout | null = null;
  private segmentTimer: NodeJS.Timeout | null = null;

  getState(): RecordingState {
    return { ...this.state };
  }

  // 获取FFmpeg编码参数
  private getEncodingParams(quality: string): string[] {
    const qualityPresets: Record<string, string[]> = {
      low: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-tune', 'zerolatency'],
      medium: ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-tune', 'zerolatency'],
      high: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18'],
    };
    return qualityPresets[quality] || qualityPresets.medium;
  }

  // 生成录制文件名
  private generateFilename(): string {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `recording_${dateStr}_${uuidv4().slice(0, 8)}.mp4`;
  }

  // 开始录制
  async startRecording(cameraPath?: string): Promise<{ success: boolean; message: string; recordingId?: number }> {
    if (this.state.isRecording) {
      return { success: false, message: '已经在录制中' };
    }

    const selectedCamera = cameraPath || getConfig('selected_camera');
    if (!selectedCamera) {
      return { success: false, message: '请先选择摄像头设备' };
    }

    // Windows DirectShow 摄像头通常不支持多进程访问，需要停止预览流
    if (isWindows()) {
      try {
        const streamService = require('./streamService').default;
        const streamStatus = streamService.getStatus();
        if (streamStatus.isStreaming) {
          addLog('info', 'recording', '录制前停止预览流（摄像头独占访问）');
          await streamService.stopStream();
        }
      } catch (error) {
        addLog('warn', 'recording', '无法停止预览流，继续尝试录制');
      }
    }

    const storagePath = getConfig('storage_path') || './data/recordings';
    const quality = getConfig('video_quality') || 'medium';
    const fps = getConfig('video_fps') || '30';
    const resolution = getConfig('video_resolution') || '1280x720';

    // 确保存储目录存在
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    // 检查存储空间
    const cleanupResult = await this.checkAndCleanupStorage();
    if (!cleanupResult.success) {
      return { success: false, message: cleanupResult.message };
    }

    const filename = this.generateFilename();
    const filepath = path.join(storagePath, filename);

    try {
      // 创建录制记录
      const recording = RecordingModel.createRecording({
        filename,
        filepath,
        camera_id: selectedCamera,
      });

      // 获取跨平台FFmpeg输入参数
      const inputArgs = getCameraFFmpegInput(selectedCamera, fps, resolution);
      
      // 构建FFmpeg命令
      const ffmpegArgs = [
        ...inputArgs,
        ...this.getEncodingParams(quality),
        '-movflags', '+faststart',
        '-y',
        filepath,
      ];

      addLog('info', 'recording', `开始录制: ${filename}`, { 
        camera: selectedCamera, 
        quality, 
        resolution,
        fps,
        platform: getPlatform()
      });

      console.log('[RecordingService] FFmpeg命令:', 'ffmpeg', ffmpegArgs.join(' '));

      // 启动FFmpeg进程
      const ffmpegCmd = isWindows() ? 'ffmpeg' : 'ffmpeg';
      this.ffmpegProcess = spawn(ffmpegCmd, ffmpegArgs, {
        windowsHide: true
      });

      this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[RecordingService] FFmpeg stderr:', output.substring(0, 200));
        
        // 解析FFmpeg输出获取进度信息
        const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (timeMatch) {
          const [hours, minutes, seconds] = timeMatch[1].split(':').map(parseFloat);
          this.state.elapsedSeconds = hours * 3600 + minutes * 60 + seconds;
        }

        const sizeMatch = output.match(/size=\s*(\d+)kB/);
        if (sizeMatch) {
          this.state.currentFileSize = parseInt(sizeMatch[1]) * 1024;
        }
      });

      this.ffmpegProcess.on('close', (code) => {
        console.log('[RecordingService] FFmpeg进程关闭，退出码:', code);
        this.handleRecordingEnd(code);
      });

      this.ffmpegProcess.on('error', (error) => {
        addLog('error', 'recording', `FFmpeg进程错误: ${error.message}`);
        this.handleRecordingEnd(-1);
      });

      // 更新状态
      this.state = {
        isRecording: true,
        isPaused: false,
        currentRecordingId: recording.id,
        startTime: new Date(),
        elapsedSeconds: 0,
        currentFileSize: 0,
        segmentNumber: this.state.segmentNumber + 1,
      };

      // 启动状态更新定时器
      this.startStatusTimer();

      // 设置分段定时器
      this.setupSegmentTimer();

      this.emit('recordingStarted', { recordingId: recording.id, filename });

      return { success: true, message: '录制已开始', recordingId: recording.id };
    } catch (error: any) {
      addLog('error', 'recording', `启动录制失败: ${error.message}`);
      return { success: false, message: `启动录制失败: ${error.message}` };
    }
  }

  // 停止录制
  async stopRecording(): Promise<{ success: boolean; message: string }> {
    if (!this.state.isRecording || !this.ffmpegProcess) {
      return { success: false, message: '当前没有正在进行的录制' };
    }

    try {
      // 发送 'q' 命令优雅停止FFmpeg
      if (this.ffmpegProcess.stdin?.writable) {
        this.ffmpegProcess.stdin.write('q');
      }
      
      // 等待进程结束
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // 使用跨平台的终止信号
          this.ffmpegProcess?.kill(getTermSignal());
          setTimeout(() => {
            if (this.ffmpegProcess) {
              this.ffmpegProcess.kill(getKillSignal());
            }
            resolve();
          }, 2000);
        }, 5000);

        this.ffmpegProcess?.once('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      addLog('info', 'recording', '录制已停止');
      return { success: true, message: '录制已停止' };
    } catch (error: any) {
      addLog('error', 'recording', `停止录制失败: ${error.message}`);
      // 强制终止
      this.ffmpegProcess?.kill(getKillSignal());
      return { success: false, message: `停止录制失败: ${error.message}` };
    }
  }

  // 暂停录制（实际上是停止当前分段）
  async pauseRecording(): Promise<{ success: boolean; message: string }> {
    if (!this.state.isRecording) {
      return { success: false, message: '当前没有正在进行的录制' };
    }

    if (this.state.isPaused) {
      return { success: false, message: '录制已经暂停' };
    }

    try {
      await this.stopRecording();
      this.state.isPaused = true;
      this.emit('recordingPaused');
      addLog('info', 'recording', '录制已暂停');
      return { success: true, message: '录制已暂停' };
    } catch (error: any) {
      return { success: false, message: `暂停录制失败: ${error.message}` };
    }
  }

  // 恢复录制
  async resumeRecording(): Promise<{ success: boolean; message: string }> {
    if (!this.state.isPaused) {
      return { success: false, message: '录制未暂停' };
    }

    this.state.isPaused = false;
    const result = await this.startRecording();
    if (result.success) {
      this.emit('recordingResumed');
    }
    return result;
  }

  // 处理录制结束
  private handleRecordingEnd(exitCode: number | null): void {
    // 清理定时器
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    if (this.segmentTimer) {
      clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }

    // 更新录制记录
    if (this.state.currentRecordingId) {
      const recording = RecordingModel.getRecordingById(this.state.currentRecordingId);
      if (recording) {
        // 获取实际文件大小
        let fileSize = 0;
        try {
          const stats = fs.statSync(recording.filepath);
          fileSize = stats.size;
        } catch {
          fileSize = this.state.currentFileSize;
        }

        RecordingModel.updateRecording(this.state.currentRecordingId, {
          duration: Math.round(this.state.elapsedSeconds),
          file_size: fileSize,
          status: exitCode === 0 ? 'completed' : 'error',
          ended_at: new Date().toISOString(),
        });
      }
    }

    const previousState = { ...this.state };
    this.state = {
      isRecording: false,
      isPaused: this.state.isPaused,
      currentRecordingId: null,
      startTime: null,
      elapsedSeconds: 0,
      currentFileSize: 0,
      segmentNumber: this.state.segmentNumber,
    };

    this.ffmpegProcess = null;
    this.emit('recordingEnded', { 
      recordingId: previousState.currentRecordingId,
      exitCode 
    });

    // Windows: 录制结束后尝试重新启动预览流
    if (isWindows() && exitCode === 0) {
      setTimeout(async () => {
        try {
          const streamService = require('./streamService').default;
          const selectedCamera = getConfig('selected_camera');
          if (selectedCamera && !streamService.getStatus().isStreaming) {
            addLog('info', 'recording', '录制结束，重新启动预览流');
            await streamService.startStream(selectedCamera);
          }
        } catch (error) {
          addLog('warn', 'recording', '无法重启预览流');
        }
      }, 1000); // 延迟1秒，确保摄像头已释放
    }
  }

  // 启动状态更新定时器
  private startStatusTimer(): void {
    this.elapsedTimer = setInterval(() => {
      if (this.state.isRecording && this.state.currentRecordingId) {
        // 获取当前文件大小
        const recording = RecordingModel.getRecordingById(this.state.currentRecordingId);
        if (recording) {
          try {
            const stats = fs.statSync(recording.filepath);
            this.state.currentFileSize = stats.size;
          } catch {}
        }
        this.emit('recordingStatus', this.getState());
      }
    }, 1000);
  }

  // 设置分段定时器
  private setupSegmentTimer(): void {
    const duration = parseInt(getConfig('recording_duration') || '3600') * 1000;
    
    this.segmentTimer = setTimeout(async () => {
      if (this.state.isRecording) {
        addLog('info', 'recording', '达到分段时长，自动切换到新分段');
        await this.stopRecording();
        // 短暂延迟后开始新分段
        setTimeout(() => {
          if (!this.state.isPaused) {
            this.startRecording();
          }
        }, 1000);
      }
    }, duration);
  }

  // 检查并清理存储空间
  private async checkAndCleanupStorage(): Promise<{ success: boolean; message: string }> {
    const storageLimit = parseInt(getConfig('storage_limit') || '107374182400');
    const autoCleanup = getConfig('auto_cleanup') === 'true';
    const currentUsage = RecordingModel.getTotalStorageUsed();

    if (currentUsage >= storageLimit) {
      if (!autoCleanup) {
        return { success: false, message: '存储空间已满，请手动清理或启用自动清理' };
      }

      // 自动清理最旧的录制文件
      addLog('info', 'storage', '存储空间不足，开始自动清理');
      
      const oldRecordings = RecordingModel.getOldestRecordings(10);
      for (const recording of oldRecordings) {
        if (RecordingModel.getTotalStorageUsed() < storageLimit * 0.9) {
          break;
        }
        
        // 删除文件
        try {
          if (fs.existsSync(recording.filepath)) {
            fs.unlinkSync(recording.filepath);
          }
          RecordingModel.hardDeleteRecording(recording.id);
          addLog('info', 'storage', `已删除旧录制文件: ${recording.filename}`);
        } catch (error: any) {
          addLog('error', 'storage', `删除文件失败: ${recording.filename}`, { error: error.message });
        }
      }
    }

    return { success: true, message: '存储空间充足' };
  }

  // 获取存储状态
  getStorageStatus(): { used: number; limit: number; percentage: number } {
    const limit = parseInt(getConfig('storage_limit') || '107374182400');
    const used = RecordingModel.getTotalStorageUsed();
    return {
      used,
      limit,
      percentage: Math.round((used / limit) * 100),
    };
  }
}

export const recordingService = new RecordingService();
export default recordingService;
