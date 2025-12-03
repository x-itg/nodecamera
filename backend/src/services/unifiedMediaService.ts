/**
 * 统一媒体服务
 * 使用单个 FFmpeg 进程同时处理预览和录制
 * 通过数据流隔离机制实现预览和录制并行
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { addLog, getConfig } from '../config/database';
import { isWindows, getPlatform } from '../utils/platform';
import { getCameraFFmpegInput } from './cameraService';
import * as RecordingModel from '../models/recording';

interface StreamClient {
  id: string;
  write: (data: Buffer) => boolean;
  end: () => void;
}

interface MediaState {
  isStreaming: boolean;
  isRecording: boolean;
  currentDevice: string | null;
  currentRecordingId: number | null;
  recordingStartTime: Date | null;
  recordingFilePath: string | null;
  segmentNumber: number;
  currentFileSize: number;
  elapsedSeconds: number;
  isAutoSegmenting: boolean; // 标记是否正在自动分段，防止 close 事件覆盖状态
}

class UnifiedMediaService extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private clients: Map<string, StreamClient> = new Map();
  private frameBuffer: Buffer[] = [];
  private readonly MAX_BUFFER_SIZE = 10;
  private recordingProgressInterval: NodeJS.Timeout | null = null;
  
  private state: MediaState = {
    isStreaming: false,
    isRecording: false,
    currentDevice: null,
    currentRecordingId: null,
    recordingStartTime: null,
    recordingFilePath: null,
    segmentNumber: 0,
    currentFileSize: 0,
    elapsedSeconds: 0,
    isAutoSegmenting: false,
  };

  getState(): MediaState {
    return { ...this.state };
  }

  /**
   * 获取存储状态
   */
  getStorageStatus(): {
    used: number;
    limit: number;
    percentage: number;
    recordings: number;
  } {
    try {
      const storagePath = getConfig('storage_path') || './data/recordings';
      const storageLimit = Number(getConfig('storage_limit')) || 10 * 1024 * 1024 * 1024; // 默认 10GB
      
      // 获取录制文件总数和大小
      let used = 0;
      let recordingCount = 0;

      if (fs.existsSync(storagePath)) {
        const files = fs.readdirSync(storagePath);
        recordingCount = files.filter(f => f.endsWith('.mp4')).length;
        
        files.forEach(file => {
          try {
            const filePath = path.join(storagePath, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              used += stats.size;
            }
          } catch {}
        });
      }

      const percentage = storageLimit > 0 ? Math.round((used / storageLimit) * 100) : 0;

      return {
        used,
        limit: storageLimit,
        percentage,
        recordings: recordingCount,
      };
    } catch (error) {
      console.error('[UnifiedMediaService] 获取存储状态失败:', error);
      return {
        used: 0,
        limit: 10 * 1024 * 1024 * 1024,
        percentage: 0,
        recordings: 0,
      };
    }
  }

  /**
   * 启动统一的媒体流
   * 同时支持预览和录制
   */
  async startStream(devicePath: string, enableRecording: boolean = false): Promise<{ 
    success: boolean; 
    message: string;
    recordingId?: number;
  }> {
    console.log('[UnifiedMediaService] startStream 被调用:', { devicePath, enableRecording, currentState: this.state });

    // 如果已经在运行且设备相同
    if (this.state.isStreaming && this.state.currentDevice === devicePath) {
      // 如果请求启用录制但当前未录制
      if (enableRecording && !this.state.isRecording) {
        // 直接开始录制（FFmpeg 已经在输出 MP4，只需创建数据库记录）
        console.log('[UnifiedMediaService] 开始录制（FFmpeg 已运行）');
        return this.enableRecording();
      } else {
        console.log('[UnifiedMediaService] 流已在运行，无需重启');
        return { 
          success: true, 
          message: '流已在运行',
          recordingId: this.state.currentRecordingId ?? undefined
        };
      }
    }

    // 停止现有流（如果尚未停止）
    if (this.state.isStreaming) {
      console.log('[UnifiedMediaService] 检测到现有流，停止中...');
      await this.stopStream();
      // Windows 需要更长时间释放摄像头设备，等待 2000ms
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const fps = getConfig('video_fps') || '30';
    const resolution = getConfig('video_resolution') || '1280x720';
    const quality = getConfig('video_quality') || 'medium';

    try {
      // 获取输入参数
      const inputArgs = getCameraFFmpegInput(devicePath, fps, resolution);

      // 准备录制路径（总是准备，但只有在 enableRecording 时才创建数据库记录）
      const storagePath = getConfig('storage_path') || './data/recordings';
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      let ffmpegArgs: string[];

      if (enableRecording) {
        // 录制模式：输出 MP4 + MJPEG
        const filename = this.generateFilename();
        const recordingPath = path.join(storagePath, filename);

        ffmpegArgs = [
          ...inputArgs,
          // 输出1：MP4 文件（使用 moov atom 提前写入以支持流式播放）
          '-map', '0:v',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-movflags', '+faststart+frag_keyframe+empty_moov',
          '-frag_duration', '1000000',
          '-reset_timestamps', '1',
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

        addLog('info', 'media', `启动媒体流（预览+录制）: ${filename}`, {
          device: devicePath,
          resolution,
          fps
        });
      } else {
        // 预览模式：只输出 MJPEG，不写入文件
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

        addLog('info', 'media', '启动媒体流（仅预览）', {
          device: devicePath,
          resolution,
          fps
        });
      }

      console.log('[UnifiedMediaService] FFmpeg命令:', 'ffmpeg', ffmpegArgs.join(' '));
      console.log('[UnifiedMediaService] 参数数组:', JSON.stringify(ffmpegArgs));

      // 启动 FFmpeg 进程
      this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        windowsHide: true
      });

      console.log('[UnifiedMediaService] FFmpeg PID:', this.ffmpegProcess.pid);

      // 立即设置错误处理器，防止进程错误丢失
      this.ffmpegProcess.on('error', (error) => {
        console.error('[UnifiedMediaService] 进程启动错误:', error.message);
        addLog('error', 'media', `进程启动错误: ${error.message}`);
        this.handleFfmpegError(error.message);
      });

      // 检查进程是否成功启动
      if (!this.ffmpegProcess.pid) {
        throw new Error('FFmpeg 进程启动失败：无法获取 PID');
      }

      this.state.isStreaming = true;
      this.state.currentDevice = devicePath;

      // 先处理 stderr（捕获启动错误）
      this.setupStderrHandler();

      // 再处理 MJPEG 数据流（预览）
      this.setupMjpegHandler();

      // 最后处理进程退出
      this.setupProcessHandlers();

      this.emit('streamStarted', { 
        device: devicePath,
        recording: enableRecording,
        recordingId: this.state.currentRecordingId ?? undefined
      });

      // 如果启用了录制，额外触发录制开始事件并启动进度定时器
      if (enableRecording) {
        this.emit('recordingStarted', {
          recordingId: this.state.currentRecordingId ?? undefined,
          device: devicePath,
        });
        
        // 启动录制进度定时器（监控文件大小和时长）
        this.startRecordingProgressTimer();
      }

      return { 
        success: true, 
        message: enableRecording ? '预览和录制已启动' : '预览已启动',
        recordingId: this.state.currentRecordingId ?? undefined
      };
    } catch (error: any) {
      addLog('error', 'media', `启动媒体流失败: ${error.message}`);
      return { success: false, message: `启动失败: ${error.message}` };
    }
  }

  /**
   * 开始录制（在已有预览流的基础上）
   */
  async startRecording(): Promise<{ 
    success: boolean; 
    message: string;
    recordingId?: number;
  }> {
    if (this.state.isRecording) {
      return { 
        success: false, 
        message: '已经在录制中',
        recordingId: this.state.currentRecordingId ?? undefined
      };
    }

    if (!this.state.isStreaming || !this.state.currentDevice) {
      return { success: false, message: '请先启动预览' };
    }

    // 调用统一的启用录制方法
    return this.enableRecording();
  }

  /**
   * 启用录制（需要重启 FFmpeg 以添加 MP4 输出）
   */
  private async enableRecording(): Promise<{ 
    success: boolean; 
    message: string;
    recordingId?: number;
  }> {
    if (this.state.isRecording) {
      return { 
        success: true, 
        message: '已在录制中',
        recordingId: this.state.currentRecordingId ?? undefined
      };
    }

    if (!this.state.isStreaming || !this.state.currentDevice) {
      return { success: false, message: '流未启动' };
    }

    // 重启 FFmpeg，从仅预览模式切换到预览+录制模式
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
   * 启动录制进度定时器（同时监控文件大小）
   */
  private startRecordingProgressTimer(): void {
    // 清除已有定时器
    if (this.recordingProgressInterval) {
      clearInterval(this.recordingProgressInterval);
    }

    const MAX_FILE_SIZE = parseInt(getConfig('max_file_size') || '104857600'); // 默认 100MB

    // 每秒发送一次录制进度，并检查文件大小
    this.recordingProgressInterval = setInterval(() => {
      if (this.state.isRecording && this.state.recordingStartTime) {
        const duration = Math.floor((Date.now() - this.state.recordingStartTime.getTime()) / 1000);
        
        // 检查文件大小
        if (this.state.recordingFilePath && fs.existsSync(this.state.recordingFilePath)) {
          try {
            const stats = fs.statSync(this.state.recordingFilePath);
            this.state.currentFileSize = stats.size;
            
            // 发送进度事件
            this.emit('recordingProgress', {
              recordingId: this.state.currentRecordingId,
              duration,
              fileSize: stats.size,
            });
            
            // 如果文件大小超过 100MB，自动结束当前段
            if (stats.size >= MAX_FILE_SIZE) {
              console.log(`[UnifiedMediaService] 文件大小达到 ${(stats.size / 1024 / 1024).toFixed(2)}MB，自动结束当前段`);
              this.finishCurrentSegmentAndStartNext();
            }
          } catch (error: any) {
            console.error('[UnifiedMediaService] 获取文件大小失败:', error.message);
          }
        } else {
          // 文件不存在，只发送时长
          this.emit('recordingProgress', {
            recordingId: this.state.currentRecordingId,
            duration,
            fileSize: 0,
          });
        }
      }
    }, 1000);
  }

  /**
   * 结束当前分段并开始下一段（不中断录制）
   */
  private async finishCurrentSegmentAndStartNext(): Promise<void> {
    if (!this.state.isRecording || !this.state.currentDevice) {
      return;
    }

    // 标记正在自动分段，防止 close 事件覆盖状态
    this.state.isAutoSegmenting = true;

    const currentRecordingId = this.state.currentRecordingId;
    const currentFilePath = this.state.recordingFilePath;
    const duration = this.state.recordingStartTime
      ? Math.floor((Date.now() - this.state.recordingStartTime.getTime()) / 1000)
      : 0;

    console.log(`[UnifiedMediaService] 完成录制段 #${currentRecordingId}，时长: ${duration}秒`);

    // 更新当前录制记录为已完成
    if (currentRecordingId && currentFilePath && fs.existsSync(currentFilePath)) {
      const stats = fs.statSync(currentFilePath);
      RecordingModel.updateRecording(currentRecordingId, {
        duration,
        file_size: stats.size,
        status: 'completed',
        ended_at: new Date().toISOString(),
      });
      console.log(`[UnifiedMediaService] 录制段 #${currentRecordingId} 已完成: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
    }

    // 停止进度定时器（会在 restartFFmpeg 中重新启动）
    this.stopRecordingProgressTimer();

    // 重启 FFmpeg 开始新的分段
    // 注意：这里不触发 recordingEnded 事件，避免 autoRecordingService 重复创建录制
    const device = this.state.currentDevice;
    console.log('[UnifiedMediaService] 自动开始下一段录制（无缝切换）...');
    await this.restartFFmpeg(device, true);
    
    // 清除自动分段标志
    this.state.isAutoSegmenting = false;
  }

  /**
   * 停止录制进度定时器
   */
  private stopRecordingProgressTimer(): void {
    if (this.recordingProgressInterval) {
      clearInterval(this.recordingProgressInterval);
      this.recordingProgressInterval = null;
    }
  }

  /**
   * 开始录制（旧版本，保留以兼容）
   */
  async startRecordingOld(): Promise<{ 
    success: boolean; 
    message: string;
    recordingId?: number;
  }> {
    if (this.state.isRecording) {
      return { success: false, message: '已经在录制中' };
    }

    if (!this.state.isStreaming || !this.state.currentDevice) {
      return { success: false, message: '请先启动预览' };
    }

    // 重启流并启用录制（不递归调用 startRecording）
    const device = this.state.currentDevice;
    await this.stopStream();
    
    const result = await this.startStream(device, true);
    
    return {
      success: result.success,
      message: result.message,
      recordingId: this.state.currentRecordingId || undefined
    };
  }

  /**
   * 停止录制但保持预览
   */
  async stopRecording(): Promise<{ success: boolean; message: string }> {
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

        addLog('info', 'media', `录制完成: ID=${recordingId}, 时长=${duration}s, 大小=${stats.size}B`);
      } catch (error: any) {
        addLog('error', 'media', `更新录制记录失败: ${error.message}`);
      }
    }

    // 重置录制状态
    this.state.isRecording = false;
    this.state.currentRecordingId = null;
    this.state.recordingStartTime = null;

    // 停止进度定时器
    this.stopRecordingProgressTimer();

    console.log('[UnifiedMediaService] 录制已停止，预览继续（注意：FFmpeg 仍在写入文件，需要重启流才能完全停止录制）');

    // 触发录制结束事件
    this.emit('recordingEnded', {
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
   * 重启 FFmpeg 进程（保留客户端连接）
   */
  private async restartFFmpeg(devicePath: string, enableRecording: boolean): Promise<void> {
    console.log('[UnifiedMediaService] 重启 FFmpeg 进程:', { devicePath, enableRecording });

    // 停止当前 FFmpeg 进程
    if (this.ffmpegProcess) {
      // 如果是录制模式，使用SIGINT让FFmpeg完成文件封装
      const signal = this.state.isRecording ? 'SIGINT' : 'SIGTERM';
      console.log('[UnifiedMediaService] 终止旧进程 PID:', this.ffmpegProcess.pid, '信号:', signal);
      
      this.ffmpegProcess.kill(signal);
      
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.ffmpegProcess) {
            console.log('[UnifiedMediaService] 强制杀死进程');
            this.ffmpegProcess.kill('SIGKILL');
          }
          resolve();
        }, this.state.isRecording ? 5000 : 3000); // 录制模式给更多时间完成封装

        this.ffmpegProcess?.once('close', () => {
          console.log('[UnifiedMediaService] 旧进程已关闭');
          clearTimeout(timeout);
          resolve();
        });
      });

      this.ffmpegProcess = null;
    }

    // Windows 需要更多时间释放摄像头设备（增加到 1000ms）
    console.log('[UnifiedMediaService] 等待设备释放...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 重新构建 FFmpeg 命令并启动
    const fps = getConfig('video_fps') || '30';
    const resolution = getConfig('video_resolution') || '1280x720';
    const inputArgs = getCameraFFmpegInput(devicePath, fps, resolution);

    // 准备录制路径（总是准备，以便随时可以开始录制）
    const storagePath = getConfig('storage_path') || './data/recordings';
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    let ffmpegArgs: string[];

    if (enableRecording) {
      // 录制模式：输出 MP4 + MJPEG
      const filename = this.generateFilename();
      const recordingPath = path.join(storagePath, filename);

      ffmpegArgs = [
        ...inputArgs,
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

      addLog('info', 'media', `重启流并开始录制: ${filename}`, { device: devicePath });
    } else {
      // 预览模式：只输出 MJPEG，不写入文件
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

      addLog('info', 'media', `重启流为预览模式`, { device: devicePath });
    }

    console.log('[UnifiedMediaService] 新 FFmpeg 命令:', 'ffmpeg', ffmpegArgs.join(' '));

    // 启动新进程
    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, { windowsHide: true });

    console.log('[UnifiedMediaService] 新 FFmpeg PID:', this.ffmpegProcess.pid);

    // 设置处理器
    this.ffmpegProcess.on('error', (error) => {
      console.error('[UnifiedMediaService] 进程启动错误:', error.message);
    });

    this.setupStderrHandler();
    this.setupMjpegHandler();
    this.setupProcessHandlers();

    this.state.isStreaming = true;
    this.state.currentDevice = devicePath;

    // 如果是录制模式，启动进度定时器并触发录制开始事件
    if (enableRecording) {
      this.startRecordingProgressTimer();
      this.emit('recordingStarted', {
        recordingId: this.state.currentRecordingId ?? undefined,
        device: devicePath,
      });
    }
  }

  /**
   * 停止录制但保持预览（旧版本，保留以兼容）
   */
  async stopRecordingOld(): Promise<{ success: boolean; message: string }> {
    if (!this.state.isRecording) {
      return { success: true, message: '未在录制' };
    }

    const device = this.state.currentDevice;
    const recordingId = this.state.currentRecordingId;
    const recordingPath = this.state.recordingFilePath;

    // 停止当前流
    await this.stopStream();

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

        addLog('info', 'media', `录制完成: ID=${recordingId}, 时长=${duration}s, 大小=${stats.size}B`);
      } catch (error: any) {
        addLog('error', 'media', `更新录制记录失败: ${error.message}`);
      }
    }

    // 重新启动预览流（不录制）
    if (device) {
      setTimeout(async () => {
        await this.startStream(device, false);
      }, 500);
    }

    return { success: true, message: '录制已停止，预览继续' };
  }

  /**
   * 完全停止流
   */
  async stopStream(): Promise<{ success: boolean; message: string }> {
    console.log('[UnifiedMediaService] stopStream 被调用');
    console.trace('[UnifiedMediaService] stopStream 调用栈');

    if (!this.state.isStreaming && !this.ffmpegProcess) {
      console.log('[UnifiedMediaService] 流未运行，无需停止');
      return { success: true, message: '流未运行' };
    }

    const wasRecording = this.state.isRecording;
    const recordingId = this.state.currentRecordingId;
    const recordingPath = this.state.recordingFilePath;

    try {
      if (this.ffmpegProcess) {
        // 对于录制模式，先发送 SIGINT 让 FFmpeg 优雅退出
        if (this.state.isRecording) {
          console.log('[UnifiedMediaService] 发送 SIGINT 给 FFmpeg 进程进行优雅退出');
          this.ffmpegProcess.kill('SIGINT');
          
          // 等待 FFmpeg 优雅退出（最多 5 秒）
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              console.log('[UnifiedMediaService] FFmpeg 优雅退出超时，强制终止');
              this.ffmpegProcess?.kill('SIGTERM');
              resolve();
            }, 5000);

            this.ffmpegProcess?.once('close', () => {
              clearTimeout(timeout);
              console.log('[UnifiedMediaService] FFmpeg 已优雅退出');
              resolve();
            });
          });
        } else {
          // 预览模式直接终止
          this.ffmpegProcess.kill('SIGTERM');
          
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
        }
      }

      // 通知所有客户端
      this.clients.forEach(client => {
        try {
          client.end();
        } catch {}
      });
      this.clients.clear();
      this.frameBuffer = [];

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
        isAutoSegmenting: false,
      };

      this.ffmpegProcess = null;
      this.emit('streamStopped');

      return { success: true, message: '流已停止' };
    } catch (error: any) {
      return { success: false, message: `停止失败: ${error.message}` };
    }
  }

  /**
   * 设置 MJPEG 数据处理器（预览流）
   */
  private setupMjpegHandler(): void {
    if (!this.ffmpegProcess || !this.ffmpegProcess.stdout) {
      console.error('[UnifiedMediaService] FFmpeg stdout 不可用');
      return;
    }

    let buffer = Buffer.alloc(0);
    const JPEG_START = Buffer.from([0xff, 0xd8]);
    const JPEG_END = Buffer.from([0xff, 0xd9]);

    // 设置 stdout 为流动模式，防止背压阻塞
    this.ffmpegProcess.stdout.on('data', (chunk: Buffer) => {
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

          // 广播给所有预览客户端
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

    // 处理 stdout 错误
    this.ffmpegProcess.stdout.on('error', (error) => {
      console.error('[UnifiedMediaService] stdout 错误:', error.message);
    });

    // 确保流正常结束
    this.ffmpegProcess.stdout.on('end', () => {
      console.log('[UnifiedMediaService] stdout 流结束');
    });
  }

  /**
   * 设置 stderr 处理器（进度和错误）
   */
  private setupStderrHandler(): void {
    if (!this.ffmpegProcess || !this.ffmpegProcess.stderr) {
      console.error('[UnifiedMediaService] FFmpeg stderr 不可用');
      return;
    }

    this.ffmpegProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      
      // 检测关键错误
      if (output.includes('Error opening input') || 
          output.includes('I/O error') || 
          output.includes('Device not found') ||
          output.includes('Cannot open video device')) {
        console.error('[UnifiedMediaService] FFmpeg关键错误:', output.substring(0, 300));
        addLog('error', 'media', `FFmpeg关键错误: ${output.slice(0, 200)}`);
        this.handleFfmpegError(output);
      }
      // 只在有错误时打印
      else if (output.includes('error') || output.includes('Error')) {
        console.log('[UnifiedMediaService] FFmpeg错误:', output.substring(0, 300));
        addLog('error', 'media', `FFmpeg错误: ${output.slice(0, 200)}`);
      }

      // 发送进度事件（录制时）
      if (this.state.isRecording) {
        const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (timeMatch) {
          this.emit('recordingProgress', { time: timeMatch[1] });
        }
      }
    });

    // 处理 stderr 错误
    this.ffmpegProcess.stderr.on('error', (error) => {
      console.error('[UnifiedMediaService] stderr 错误:', error.message);
    });
  }

  /**
   * 处理 FFmpeg 错误
   */
  private handleFfmpegError(errorMessage: string): void {
    console.error('[UnifiedMediaService] 处理FFmpeg错误:', errorMessage);
    
    // 重置状态
    this.state.isStreaming = false;
    this.state.isRecording = false;
    this.ffmpegProcess = null;
    
    // 触发错误事件
    this.emit('streamError', { 
      error: errorMessage,
      device: this.state.currentDevice 
    });
  }

  /**
   * 设置进程事件处理器
   */
  private setupProcessHandlers(): void {
    this.ffmpegProcess!.on('spawn', () => {
      console.log('[UnifiedMediaService] FFmpeg进程已启动');
    });

    this.ffmpegProcess!.on('exit', (code, signal) => {
      console.log('[UnifiedMediaService] FFmpeg进程退出，退出码:', code, '信号:', signal);
    });

    this.ffmpegProcess!.on('close', (code, signal) => {
      console.log('[UnifiedMediaService] FFmpeg进程关闭，退出码:', code, '信号:', signal);
      
      const wasRecording = this.state.isRecording;
      const recordingId = this.state.currentRecordingId;
      const isAutoSegmenting = this.state.isAutoSegmenting;

      // 更新录制状态（跳过自动分段场景，因为已经手动更新为 completed）
      if (wasRecording && recordingId && this.state.recordingFilePath && !isAutoSegmenting) {
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
          console.log(`[UnifiedMediaService] 录制 #${recordingId} 状态已更新: ${code === 0 ? 'completed' : 'error'}`);
        } catch {}
      } else if (isAutoSegmenting) {
        console.log(`[UnifiedMediaService] 自动分段中，跳过状态更新（已在 finishCurrentSegmentAndStartNext 中更新为 completed）`);
      }

      this.state.isStreaming = false;
      this.state.isRecording = false;
      this.ffmpegProcess = null;
      
      this.emit('streamStopped', { code, wasRecording });
    });

    this.ffmpegProcess!.on('error', (error) => {
      console.error('[UnifiedMediaService] FFmpeg进程错误:', error.message);
      addLog('error', 'media', `FFmpeg进程错误: ${error.message}`);
    });
  }

  /**
   * 添加预览客户端
   */
  addClient(client: StreamClient): void {
    this.clients.set(client.id, client);
    
    // 发送最新帧给新客户端
    if (this.frameBuffer.length > 0) {
      const latestFrame = this.frameBuffer[this.frameBuffer.length - 1];
      this.sendFrameToClient(client, latestFrame);
    }

    addLog('info', 'media', `新客户端连接: ${client.id}，当前连接数: ${this.clients.size}`);
  }

  /**
   * 移除预览客户端
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    addLog('info', 'media', `客户端断开: ${clientId}，当前连接数: ${this.clients.size}`);
  }

  /**
   * 发送帧给单个客户端
   */
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

  /**
   * 广播帧给所有客户端
   */
  private broadcastFrame(frame: Buffer): void {
    this.clients.forEach(client => {
      this.sendFrameToClient(client, frame);
    });
  }

  /**
   * 获取最新帧（快照）
   */
  getLatestFrame(): Buffer | null {
    if (this.frameBuffer.length === 0) {
      return null;
    }
    return this.frameBuffer[this.frameBuffer.length - 1];
  }

  /**
   * 生成录制文件名
   */
  private generateFilename(): string {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `recording_${dateStr}_${uuidv4().slice(0, 8)}.mp4`;
  }
}

export const unifiedMediaService = new UnifiedMediaService();
export default unifiedMediaService;
