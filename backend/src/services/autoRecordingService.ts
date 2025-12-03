import { getConfig, addLog } from '../config/database';
import unifiedMediaService from './unifiedMediaService';
import { detectCameras } from './cameraService';
import type { CameraDevice } from './cameraService';

interface AutoRecordingConfig {
  enabled: boolean;
  selectedCamera: string;
  quality: string;
  fps: string;
  resolution: string;
  maxFileSize: number; // 每个文件最大大小（字节）
  checkInterval: number;
  storageLimit: number; // 存储限制（字节）
}

class AutoRecordingService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isChecking = false;
  private isRecording = false;
  private manualStop = false; // 用户手动停止标志

  /**
   * 获取自动录制配置
   */
  private getAutoRecordingConfig(): AutoRecordingConfig {
    return {
      enabled: getConfig('auto_start') === 'true',
      selectedCamera: getConfig('selected_camera') || '',
      quality: getConfig('video_quality') || 'medium',
      fps: getConfig('video_fps') || '30',
      resolution: getConfig('video_resolution') || '1280x720',
      maxFileSize: parseInt(getConfig('max_file_size') || '104857600'), // 默认 100MB
      checkInterval: 5000, // 5秒检查一次
      storageLimit: parseInt(getConfig('storage_limit') || '107374182400') // 默认 100GB
    };
  }

  /**
   * 检查硬件是否就绪
   */
  private async checkHardwareReady(): Promise<boolean> {
    try {
      const cameras = await detectCameras();
      const config = this.getAutoRecordingConfig();
      
      // 检查是否启用了自动录制
      if (!config.enabled) {
        return false;
      }

      // 如果用户手动停止，不自动启动
      if (this.manualStop) {
        return false;
      }

      // 检查是否有选中的摄像头
      if (!config.selectedCamera) {
        console.log('[AutoRecordingService] 未选择摄像头，跳过自动录制检查');
        return false;
      }

      // 检查选中的摄像头是否存在
      const selectedCamera = cameras.find((cam: CameraDevice) => cam.id === config.selectedCamera);
      if (!selectedCamera) {
        console.log(`[AutoRecordingService] 选中的摄像头不存在: ${config.selectedCamera}`);
        return false;
      }

      // 检查摄像头是否可用
      if (selectedCamera.status !== 'available') {
        console.log(`[AutoRecordingService] 摄像头不可用: ${selectedCamera.name} (状态: ${selectedCamera.status})`);
        return false;
      }

      console.log(`[AutoRecordingService] 硬件就绪: ${selectedCamera.name}`);
      return true;
    } catch (error) {
      console.error('[AutoRecordingService] 检查硬件状态失败:', error);
      return false;
    }
  }

  /**
   * 开始自动录制
   */
  private async startAutoRecording(): Promise<void> {
    if (this.isRecording) {
      return;
    }

    try {
      const config = this.getAutoRecordingConfig();
      
      // 检查并清理存储空间
      await this.cleanupStorageIfNeeded();
      
      console.log(`[AutoRecordingService] 开始自动录制: ${config.selectedCamera}`);
      console.log(`[AutoRecordingService] 文件大小限制: ${(config.maxFileSize / 1024 / 1024).toFixed(0)}MB`);
      
      const result = await unifiedMediaService.startStream(config.selectedCamera, true);
      
      if (result.success) {
        this.isRecording = true;
        addLog('info', 'auto-recording', '自动录制已启动', {
          camera: config.selectedCamera,
          resolution: config.resolution,
          fps: config.fps,
          maxFileSize: `${(config.maxFileSize / 1024 / 1024).toFixed(0)}MB`
        });
        
        console.log('[AutoRecordingService] 自动录制启动成功');
        console.log('[AutoRecordingService] 文件分段由 unifiedMediaService 自动处理，无需手动重启');
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error('[AutoRecordingService] 自动录制启动失败:', error.message);
      addLog('error', 'auto-recording', `自动录制启动失败: ${error.message}`);
    }
  }

  /**
   * 设置录制完成处理器（自动开始下一段）
   */
  private setupRecordingCompletionHandler(): void {
    const handler = async () => {
      if (this.isRecording && !this.manualStop) {
        console.log('[AutoRecordingService] 当前段录制完成，自动开始下一段...');
        // 等待一小段时间确保文件已保存
        await new Promise(resolve => setTimeout(resolve, 1000));
        // 重新启动录制（会自动停止当前并开始新的）
        await this.startAutoRecording();
      }
    };

    // 监听 unifiedMediaService 的录制结束事件
    unifiedMediaService.once('recordingEnded', handler);
  }

  /**
   * 检查存储空间并清理最旧的文件
   */
  private async cleanupStorageIfNeeded(): Promise<void> {
    try {
      const config = this.getAutoRecordingConfig();
      const RecordingModel = require('../models/recording');
      const fs = require('fs');
      const path = require('path');
      
      // 获取所有录制文件
      const recordings = RecordingModel.getAllRecordings(1000, 0);
      
      // 计算总大小
      let totalSize = 0;
      const filesWithSize: Array<{ id: number; filepath: string; size: number; created_at: string }> = [];
      
      for (const recording of recordings) {
        if (fs.existsSync(recording.filepath)) {
          const stats = fs.statSync(recording.filepath);
          const size = stats.size;
          totalSize += size;
          filesWithSize.push({
            id: recording.id,
            filepath: recording.filepath,
            size,
            created_at: recording.created_at
          });
        }
      }

      console.log(`[AutoRecordingService] 当前存储使用: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)}GB / ${(config.storageLimit / 1024 / 1024 / 1024).toFixed(0)}GB`);
      
      // 如果超过限制的 90%，开始清理
      if (totalSize > config.storageLimit * 0.9) {
        console.log('[AutoRecordingService] 存储空间接近上限，开始清理最旧的文件...');
        
        // 按创建时间排序（最旧的在前）
        filesWithSize.sort((a, b) => a.created_at.localeCompare(b.created_at));
        
        // 删除最旧的文件直到低于 80%
        let deletedCount = 0;
        for (const file of filesWithSize) {
          if (totalSize <= config.storageLimit * 0.8) {
            break;
          }
          
          console.log(`[AutoRecordingService] 删除旧文件: ${path.basename(file.filepath)} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
          
          // 删除文件
          if (fs.existsSync(file.filepath)) {
            fs.unlinkSync(file.filepath);
          }
          
          // 删除数据库记录
          RecordingModel.hardDeleteRecording(file.id);
          
          totalSize -= file.size;
          deletedCount++;
        }
        
        console.log(`[AutoRecordingService] 清理完成，删除了 ${deletedCount} 个文件`);
        addLog('info', 'auto-recording', `自动清理: 删除了 ${deletedCount} 个旧文件`);
      }
    } catch (error: any) {
      console.error('[AutoRecordingService] 存储清理失败:', error.message);
    }
  }

  /**
   * 停止自动录制
   */
  private async stopAutoRecording(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    try {
      console.log('[AutoRecordingService] 停止自动录制');
      
      const result = await unifiedMediaService.stopRecording();
      
      if (result.success) {
        this.isRecording = false;
        addLog('info', 'auto-recording', '自动录制已停止');
        console.log('[AutoRecordingService] 自动录制停止成功');
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error('[AutoRecordingService] 自动录制停止失败:', error.message);
      addLog('error', 'auto-recording', `自动录制停止失败: ${error.message}`);
    }
  }

  /**
   * 自动录制检查循环
   */
  private async checkAndStartRecording(): Promise<void> {
    if (this.isChecking) {
      return;
    }

    this.isChecking = true;

    try {
      // 如果已经在录制，检查是否需要停止
      if (this.isRecording) {
        const state = unifiedMediaService.getState();
        if (!state.isStreaming || !state.isRecording) {
          console.log('[AutoRecordingService] 录制意外停止，重置状态');
          this.isRecording = false;
        }
        return;
      }

      // 检查硬件是否就绪
      const hardwareReady = await this.checkHardwareReady();
      
      if (hardwareReady) {
        await this.startAutoRecording();
      }
    } catch (error) {
      console.error('[AutoRecordingService] 检查录制状态失败:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * 启动自动录制服务
   */
  start(): void {
    const config = this.getAutoRecordingConfig();
    
    if (!config.enabled) {
      console.log('[AutoRecordingService] 自动录制未启用，跳过启动');
      return;
    }

    console.log('[AutoRecordingService] 启动自动录制服务');
    console.log(`[AutoRecordingService] 模式: 每 ${(config.maxFileSize / 1024 / 1024).toFixed(0)}MB 一个文件，循环录制`);
    
    // 重置手动停止标志
    this.manualStop = false;
    
    // 立即检查一次
    this.checkAndStartRecording();
    
    // 设置定期检查
    this.checkInterval = setInterval(() => {
      this.checkAndStartRecording();
    }, config.checkInterval);

    addLog('info', 'auto-recording', '自动录制服务已启动');
  }

  /**
   * 停止自动录制服务
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.isRecording) {
      this.stopAutoRecording();
    }

    console.log('[AutoRecordingService] 自动录制服务已停止');
    addLog('info', 'auto-recording', '自动录制服务已停止');
  }

  /**
   * 用户手动停止录制（禁用自动重启）
   */
  async userStopRecording(): Promise<{ success: boolean; message: string }> {
    console.log('[AutoRecordingService] 用户手动停止录制');
    this.manualStop = true; // 设置手动停止标志
    
    if (this.isRecording) {
      const result = await unifiedMediaService.stopRecording();
      if (result.success) {
        this.isRecording = false;
        addLog('info', 'auto-recording', '用户手动停止录制');
      }
      return result;
    }
    
    return { success: true, message: '未在录制中' };
  }

  /**
   * 用户手动开始录制（启用自动重启）
   */
  async userStartRecording(cameraPath?: string): Promise<{ success: boolean; message: string; recordingId?: number }> {
    console.log('[AutoRecordingService] 用户手动开始录制');
    this.manualStop = false; // 清除手动停止标志，允许自动重启
    
    const config = this.getAutoRecordingConfig();
    const targetCamera = cameraPath || config.selectedCamera;
    
    if (!targetCamera) {
      return { success: false, message: '未选择摄像头' };
    }
    
    // 清理存储
    await this.cleanupStorageIfNeeded();
    
    const result = await unifiedMediaService.startStream(targetCamera, true);
    
    if (result.success) {
      this.isRecording = true;
      addLog('info', 'auto-recording', '用户手动开始录制');
      console.log('[AutoRecordingService] 录制已开始，文件分段将自动处理');
    }
    
    return result;
  }

  /**
   * 获取服务状态
   */
  getStatus(): {
    enabled: boolean;
    isRecording: boolean;
    isChecking: boolean;
    selectedCamera: string;
    manualStop: boolean; // 是否手动停止
  } {
    const config = this.getAutoRecordingConfig();
    
    return {
      enabled: config.enabled,
      isRecording: this.isRecording,
      isChecking: this.isChecking,
      selectedCamera: config.selectedCamera,
      manualStop: this.manualStop
    };
  }

  /**
   * 手动触发硬件检查
   */
  async triggerHardwareCheck(): Promise<{ success: boolean; message: string }> {
    try {
      const hardwareReady = await this.checkHardwareReady();
      return {
        success: true,
        message: hardwareReady ? '硬件已就绪' : '硬件未就绪'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `硬件检查失败: ${error.message}`
      };
    }
  }
}

export const autoRecordingService = new AutoRecordingService();
export default autoRecordingService;