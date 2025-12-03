/**
 * 增强录制服务
 * 支持文件分段、存储管理和循环滚动存储
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { addLog, getConfig, setConfig } from '../config/database';
import { isWindows } from '../utils/platform';
import { getCameraFFmpegInput } from './cameraService';
import * as RecordingModel from '../models/recording';

interface EnhancedMediaState {
  isStreaming: boolean;
  isRecording: boolean;
  currentDevice: string | null;
  currentRecordingId: number | null;
  recordingStartTime: Date | null;
  recordingFilePath: string | null;
  segmentNumber: number;
  currentFileSize: number;
  elapsedSeconds: number;
  totalStorageUsed: number;
}

interface SegmentRecordingOptions {
  maxSegmentSize: number; // 单个文件最大大小（字节）
  maxStorageSize: number; // 最大存储空间（100GB = 107374182400 bytes）
  autoCleanup: boolean;   // 是否自动清理
}

class EnhancedRecordingService extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private state: EnhancedMediaState = {
    isStreaming: false,
    isRecording: false,
    currentDevice: null,
    currentRecordingId: null,
    recordingStartTime: null,
    recordingFilePath: null,
    segmentNumber: 0,
    currentFileSize: 0,
    elapsedSeconds: 0,
    totalStorageUsed: 0,
  };

  private segmentTimer: NodeJS.Timeout | null = null;
  private fileSizeCheckInterval: NodeJS.Timeout | null = null;
  private storageCheckInterval: NodeJS.Timeout | null = null;

  private options: SegmentRecordingOptions = {
    maxSegmentSize: 500 * 1024 * 1024, // 默认500MB
    maxStorageSize: 100 * 1024 * 1024 * 1024, // 默认100GB
    autoCleanup: true,
  };

  constructor() {
    super();
    this.loadOptions();
  }

  private loadOptions(): void {
    this.options.maxSegmentSize = Number(getConfig('max_segment_size')) || 500 * 1024 * 1024;
    this.options.maxStorageSize = Number(getConfig('storage_limit')) || 100 * 1024 * 1024 * 1024;
    this.options.autoCleanup = getConfig('auto_cleanup') === 'true';
  }

  getState(): EnhancedMediaState {
    return { ...this.state };
  }

  getOptions(): SegmentRecordingOptions {
    return { ...this.options };
  }

  /**
   * 开始增强录制（支持分段和存储管理）
   */
  async startEnhancedRecording(devicePath: string, enableRecording: boolean = false): Promise<{ 
    success: boolean; 
    message: string;
    recordingId?: number;
  }> {
    console.log('[EnhancedRecordingService] 开始增强录制:', { devicePath, enableRecording });

    // 如果已经在运行且设备相同
    if (this.state.isStreaming && this.state.currentDevice === devicePath) {
      if (enableRecording && !this.state.isRecording) {
        return this.enableRecording();
      } else {
        return { 
          success: true, 
          message: '流已在运行',
          recordingId: this.state.currentRecordingId ?? undefined
        };
      }
    }

    // 停止现有流
    if (this.state.isStreaming) {
      await this.stopEnhancedStream();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const fps = getConfig('video_fps') || '30';
    const resolution = getConfig('video_resolution') || '1280x720';

    try {
      const inputArgs = getCameraFFmpegInput(devicePath, fps, resolution);
      const storagePath = getConfig('storage_path') || './data/recordings';
      
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      let ffmpegArgs: string[];

      if (enableRecording) {
        // 录制模式：双输出（MP4 + MJPEG）
        const filename = this.generateSegmentFilename();
        const recordingPath = path.join(storagePath, filename);

        ffmpegArgs = [
          ...inputArgs,
          // 输出1：MP4 文件（分段录制）- 优化参数确保文件可播放
          '-map', '0:v',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-movflags', '+faststart+frag_keyframe+empty_moov',  // 关键：确保moov atom存在
          '-frag_duration', '1000000',  // 分段持续时间
          '-reset_timestamps', '1',     // 重置时间戳
          '-avoid_negative_ts', 'make_zero',
          '-fflags', '+genpts',         // 生成PTS
          '-y',
          recordingPath,
          // 输出2：MJPEG 预览流
          '-map', '0:v',
          '-f', 'mjpeg',
          '-q:v', '5',
          'pipe:1'
        ];

        this.state.recordingFilePath = recordingPath;

        const recording = RecordingModel.createRecording({
          filename,
          filepath: recordingPath,
          camera_id: devicePath,
        });

        this.state.currentRecordingId = recording.id;
        this.state.recordingStartTime = new Date();
        this.state.isRecording = true;
        this.state.segmentNumber = this.state.segmentNumber + 1;

        addLog('info', 'enhanced_recording', `启动增强录制: ${filename}`, {
          device: devicePath,
          segment: this.state.segmentNumber
        });

        // 开始文件大小检查
        this.startFileSizeMonitoring(recordingPath);
      } else {
        // 预览模式：只输出 MJPEG
        ffmpegArgs = [
          ...inputArgs,
          '-f', 'mjpeg',
          '-q:v', '5',
          'pipe:1'
        ];

        this.state.recordingFilePath = null;
        this.state.currentRecordingId = null;
        this.state.recordingStartTime = null;
        this.state.isRecording = false;

        addLog('info', 'enhanced_recording', '启动预览模式');
      }

      console.log('[EnhancedRecordingService] FFmpeg命令:', 'ffmpeg', ffmpegArgs.join(' '));

      // 启动 FFmpeg 进程
      this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, { windowsHide: true });

      console.log('[EnhancedRecordingService] FFmpeg PID:', this.ffmpegProcess.pid);

      this.ffmpegProcess.on('error', (error) => {
        console.error('[EnhancedRecordingService] 进程启动错误:', error.message);
        addLog('error', 'enhanced_recording', `进程启动错误: ${error.message}`);
      });

      this.setupStderrHandler();
      this.setupMjpegHandler();
      this.setupProcessHandlers();

      this.state.isStreaming = true;
      this.state.currentDevice = devicePath;

      // 开始存储空间检查
      this.startStorageMonitoring();

      this.emit('enhancedStreamStarted', { 
        device: devicePath,
        recording: enableRecording,
        recordingId: this.state.currentRecordingId ?? undefined,
        segmentNumber: this.state.segmentNumber
      });

      if (enableRecording) {
        this.emit('enhancedRecordingStarted', {
          recordingId: this.state.currentRecordingId ?? undefined,
          device: devicePath,
          segmentNumber: this.state.segmentNumber
        });
      }

      return { 
        success: true, 
        message: enableRecording ? '预览和录制已启动' : '预览已启动',
        recordingId: this.state.currentRecordingId ?? undefined
      };
    } catch (error: any) {
      addLog('error', 'enhanced_recording', `启动失败: ${error.message}`);
      return { success: false, message: `启动失败: ${error.message}` };
    }
  }

  /**
   * 启用录制（在已有预览流的基础上）
   */
  private async enableRecording(): Promise<{ 
    success: boolean; 
    message: string;
    recordingId?: number;
  }> {
    if (!this.state.isStreaming || !this.state.currentDevice) {
      return { success: false, message: '流未启动' };
    }

    // 重启 FFmpeg，切换到录制模式
    await this.restartFFmpeg(this.state.currentDevice, true);

    if (!this.state.currentRecordingId) {
      return { success: false, message: '录制启动失败' };
    }

    return {
      success: true,
      message: '录制已开始',
      recordingId: this.state.currentRecordingId
    };
  }

  /**
   * 停止增强录制
   */
  async stopEnhancedRecording(): Promise<{ success: boolean; message: string }> {
    if (!this.state.isRecording) {
      return { success: true, message: '未在录制' };
    }

    const recordingId = this.state.currentRecordingId;
    const recordingPath = this.state.recordingFilePath;

    // 更新录制记录
    if (recordingId && recordingPath) {
      try {
        const stats = fs.statSync(recordingPath);
        const duration = this.state.recordingStartTime
          ? Math.round((Date.now() - this.state.recordingStartTime.getTime()) / 1000)
          : 0;

        RecordingModel.updateRecording(recordingId, {
          duration,
          file_size: stats.size,
          status: 'completed',
          ended_at: new Date().toISOString(),
        });

        addLog('info', 'enhanced_recording', `录制完成: ID=${recordingId}, 时长=${duration}s, 大小=${stats.size}B`);
      } catch (error: any) {
        addLog('error', 'enhanced_recording', `更新录制记录失败: ${error.message}`);
      }
    }

    // 重置录制状态
    this.state.isRecording = false;
    this.state.currentRecordingId = null;
    this.state.recordingStartTime = null;
    this.state.recordingFilePath = null;

    // 停止文件大小检查
    this.stopFileSizeMonitoring();

    console.log('[EnhancedRecordingService] 录制已停止');

    this.emit('enhancedRecordingEnded', {
      recordingId,
      success: true
    });

    // 重启流以停止文件写入
    if (this.state.currentDevice) {
      await this.restartFFmpeg(this.state.currentDevice, false);
    }

    return { success: true, message: '录制已停止，预览继续' };
  }

  /**
   * 停止增强流
   */
  async stopEnhancedStream(): Promise<{ success: boolean; message: string }> {
    console.log('[EnhancedRecordingService] 停止增强流');

    if (!this.state.isStreaming && !this.ffmpegProcess) {
      return { success: true, message: '流未运行' };
    }

    const wasRecording = this.state.isRecording;
    const recordingId = this.state.currentRecordingId;
    const recordingPath = this.state.recordingFilePath;

    try {
      if (this.ffmpegProcess) {
        // 如果是录制模式，使用SIGINT让FFmpeg完成文件封装
        const signal = this.state.isRecording ? 'SIGINT' : 'SIGTERM';
        console.log(`[EnhancedRecordingService] 发送信号: ${signal}`);
        
        this.ffmpegProcess.kill(signal);
        
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.log('[EnhancedRecordingService] 超时，强制终止进程');
            this.ffmpegProcess?.kill('SIGKILL');
            resolve();
          }, this.state.isRecording ? 5000 : 3000); // 录制模式给更多时间完成封装

          this.ffmpegProcess?.once('close', () => {
            clearTimeout(timeout);
            console.log('[EnhancedRecordingService] FFmpeg进程已关闭');
            resolve();
          });
        });
      }

      // 清理定时器
      this.stopFileSizeMonitoring();
      this.stopStorageMonitoring();

      // 如果正在录制，更新录制状态
      if (wasRecording && recordingId && recordingPath) {
        try {
          const stats = fs.statSync(recordingPath);
          const duration = this.state.recordingStartTime
            ? Math.round((Date.now() - this.state.recordingStartTime.getTime()) / 1000)
            : 0;

          RecordingModel.updateRecording(recordingId, {
            duration,
            file_size: stats.size,
            status: 'completed',
            ended_at: new Date().toISOString(),
          });
        } catch {}
      }

      this.state = {
        isStreaming: false,
        isRecording: false,
        currentDevice: null,
        currentRecordingId: null,
        recordingStartTime: null,
        recordingFilePath: null,
        segmentNumber: 0,
        currentFileSize: 0,
        elapsedSeconds: 0,
        totalStorageUsed: 0,
      };

      this.ffmpegProcess = null;
      this.emit('enhancedStreamStopped');

      return { success: true, message: '流已停止' };
    } catch (error: any) {
      return { success: false, message: `停止失败: ${error.message}` };
    }
  }

  /**
   * 重启 FFmpeg 进程
   */
  private async restartFFmpeg(devicePath: string, enableRecording: boolean): Promise<void> {
    console.log('[EnhancedRecordingService] 重启 FFmpeg 进程:', { devicePath, enableRecording });

    if (this.ffmpegProcess) {
      // 如果是录制模式，使用SIGINT确保文件正确封装
      const signal = this.state.isRecording ? 'SIGINT' : 'SIGTERM';
      console.log(`[EnhancedRecordingService] 发送信号: ${signal}`);
      
      this.ffmpegProcess.kill(signal);
      
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.log('[EnhancedRecordingService] 超时，强制终止进程');
          this.ffmpegProcess?.kill('SIGKILL');
          resolve();
        }, this.state.isRecording ? 5000 : 3000);

        this.ffmpegProcess?.once('close', () => {
          clearTimeout(timeout);
          console.log('[EnhancedRecordingService] FFmpeg进程已关闭');
          resolve();
        });
      });

      this.ffmpegProcess = null;
    }

    // 等待设备释放
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 重新启动流
    await this.startEnhancedRecording(devicePath, enableRecording);
  }

  /**
   * 开始文件大小监控
   */
  private startFileSizeMonitoring(filePath: string): void {
    this.fileSizeCheckInterval = setInterval(() => {
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          this.state.currentFileSize = stats.size;

          // 检查是否需要创建新分段
          if (stats.size >= this.options.maxSegmentSize) {
            console.log('[EnhancedRecordingService] 文件大小达到限制，创建新分段');
            this.createNewSegment();
          }
        }
      } catch (error) {
        console.error('[EnhancedRecordingService] 文件大小监控错误:', error);
      }
    }, 5000); // 每5秒检查一次
  }

  /**
   * 停止文件大小监控
   */
  private stopFileSizeMonitoring(): void {
    if (this.fileSizeCheckInterval) {
      clearInterval(this.fileSizeCheckInterval);
      this.fileSizeCheckInterval = null;
    }
  }

  /**
   * 开始存储空间监控
   */
  private startStorageMonitoring(): void {
    this.storageCheckInterval = setInterval(() => {
      this.checkAndCleanupStorage();
    }, 30000); // 每30秒检查一次
  }

  /**
   * 停止存储空间监控
   */
  private stopStorageMonitoring(): void {
    if (this.storageCheckInterval) {
      clearInterval(this.storageCheckInterval);
      this.storageCheckInterval = null;
    }
  }

  /**
   * 创建新分段
   */
  private async createNewSegment(): Promise<void> {
    if (!this.state.isRecording || !this.state.currentDevice) {
      return;
    }

    console.log('[EnhancedRecordingService] 创建新分段');
    
    // 停止当前录制
    await this.stopEnhancedRecording();
    
    // 短暂延迟后开始新分段
    setTimeout(async () => {
      await this.startEnhancedRecording(this.state.currentDevice!, true);
    }, 1000);
  }

  /**
   * 检查并清理存储空间
   */
  private async checkAndCleanupStorage(): Promise<void> {
    try {
      const storagePath = getConfig('storage_path') || './data/recordings';
      if (!fs.existsSync(storagePath)) return;

      const files = fs.readdirSync(storagePath).filter(f => f.endsWith('.mp4'));
      let totalSize = 0;

      // 计算总大小
      for (const file of files) {
        try {
          const filePath = path.join(storagePath, file);
          const stats = fs.statSync(filePath);
          totalSize += stats.size;
        } catch {}
      }

      this.state.totalStorageUsed = totalSize;

      // 检查是否需要清理
      if (totalSize >= this.options.maxStorageSize && this.options.autoCleanup) {
        console.log('[EnhancedRecordingService] 存储空间不足，开始清理');
        await this.cleanupOldestRecordings();
      }
    } catch (error) {
      console.error('[EnhancedRecordingService] 存储空间检查错误:', error);
    }
  }

  /**
   * 清理最旧的录制文件
   */
  private async cleanupOldestRecordings(): Promise<void> {
    try {
      const storagePath = getConfig('storage_path') || './data/recordings';
      const files = fs.readdirSync(storagePath)
        .filter(f => f.endsWith('.mp4'))
        .map(f => {
          const filePath = path.join(storagePath, f);
          try {
            const stats = fs.statSync(filePath);
            return { name: f, path: filePath, mtime: stats.mtime };
          } catch {
            return null;
          }
        })
        .filter(f => f !== null)
        .sort((a, b) => a!.mtime.getTime() - b!.mtime.getTime());

      let deletedSize = 0;
      const targetSize = this.options.maxStorageSize * 0.8; // 清理到80%

      for (const file of files) {
        if (this.state.totalStorageUsed - deletedSize <= targetSize) {
          break;
        }

        try {
          const stats = fs.statSync(file!.path);
          fs.unlinkSync(file!.path);
          deletedSize += stats.size;
          
          addLog('info', 'storage_cleanup', `自动清理文件: ${file!.name}`);
        } catch (error: any) {
          addLog('error', 'storage_cleanup', `清理文件失败: ${file!.name}`, { error: error.message });
        }
      }

      if (deletedSize > 0) {
        console.log(`[EnhancedRecordingService] 清理完成，释放空间: ${deletedSize} bytes`);
        this.state.totalStorageUsed -= deletedSize;
      }
    } catch (error) {
      console.error('[EnhancedRecordingService] 清理存储空间错误:', error);
    }
  }

  /**
   * 生成分段文件名
   */
  private generateSegmentFilename(): string {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `recording_${dateStr}_segment${this.state.segmentNumber + 1}_${uuidv4().slice(0, 8)}.mp4`;
  }

  /**
   * 设置 MJPEG 数据处理器
   */
  private setupMjpegHandler(): void {
    if (!this.ffmpegProcess || !this.ffmpegProcess.stdout) {
      console.error('[EnhancedRecordingService] FFmpeg stdout 不可用');
      return;
    }

    let buffer = Buffer.alloc(0);
    const JPEG_START = Buffer.from([0xff, 0xd8]);
    const JPEG_END = Buffer.from([0xff, 0xd9]);

    this.ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        const startIndex = buffer.indexOf(JPEG_START);
        const endIndex = buffer.indexOf(JPEG_END);

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          const frame = buffer.slice(startIndex, endIndex + 2);
          buffer = buffer.slice(endIndex + 2);

          this.emit('mjpegFrame', frame);
        } else {
          break;
        }
      }

      if (buffer.length > 1024 * 1024) {
        buffer = Buffer.alloc(0);
      }
    });

    this.ffmpegProcess.stdout.on('error', (error) => {
      console.error('[EnhancedRecordingService] stdout 错误:', error.message);
    });

    this.ffmpegProcess.stdout.on('end', () => {
      console.log('[EnhancedRecordingService] stdout 流结束');
    });
  }

  /**
   * 设置 stderr 处理器
   */
  private setupStderrHandler(): void {
    if (!this.ffmpegProcess || !this.ffmpegProcess.stderr) {
      console.error('[EnhancedRecordingService] FFmpeg stderr 不可用');
      return;
    }

    this.ffmpegProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      
      if (output.includes('error') || output.includes('Error')) {
        console.log('[EnhancedRecordingService] FFmpeg错误:', output.substring(0, 300));
        addLog('error', 'enhanced_recording', `FFmpeg错误: ${output.slice(0, 200)}`);
      }

      // 更新录制时长
      if (this.state.isRecording) {
        const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (timeMatch) {
          const [hours, minutes, seconds] = timeMatch[1].split(':').map(parseFloat);
          this.state.elapsedSeconds = hours * 3600 + minutes * 60 + seconds;
          
          this.emit('recordingProgress', { 
            elapsedSeconds: this.state.elapsedSeconds,
            currentFileSize: this.state.currentFileSize
          });
        }
      }
    });

    this.ffmpegProcess.stderr.on('error', (error) => {
      console.error('[EnhancedRecordingService] stderr 错误:', error.message);
    });
  }

  /**
   * 设置进程事件处理器
   */
  private setupProcessHandlers(): void {
    this.ffmpegProcess!.on('spawn', () => {
      console.log('[EnhancedRecordingService] FFmpeg进程已启动');
    });

    this.ffmpegProcess!.on('exit', (code, signal) => {
      console.log('[EnhancedRecordingService] FFmpeg进程退出，退出码:', code, '信号:', signal);
    });

    this.ffmpegProcess!.on('close', (code, signal) => {
      console.log('[EnhancedRecordingService] FFmpeg进程关闭，退出码:', code, '信号:', signal);
      
      const wasRecording = this.state.isRecording;
      const recordingId = this.state.currentRecordingId;

      // 更新录制状态
      if (wasRecording && recordingId && this.state.recordingFilePath) {
        try {
          const stats = fs.statSync(this.state.recordingFilePath);
          const duration = this.state.recordingStartTime
            ? Math.round((Date.now() - this.state.recordingStartTime.getTime()) / 1000)
            : 0;

          RecordingModel.updateRecording(recordingId, {
            duration,
            file_size: stats.size,
            status: code === 0 ? 'completed' : 'error',
            ended_at: new Date().toISOString(),
          });
        } catch {}
      }

      this.state.isStreaming = false;
      this.state.isRecording = false;
      this.ffmpegProcess = null;
      
      this.emit('enhancedStreamStopped', { code, wasRecording });
    });

    this.ffmpegProcess!.on('error', (error) => {
      console.error('[EnhancedRecordingService] FFmpeg进程错误:', error.message);
      addLog('error', 'enhanced_recording', `FFmpeg进程错误: ${error.message}`);
    });
  }
}

export const enhancedRecordingService = new EnhancedRecordingService();
export default enhancedRecordingService;