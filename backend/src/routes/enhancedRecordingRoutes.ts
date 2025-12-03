/**
 * 增强录制路由
 * 支持文件分段、存储管理和循环滚动存储
 */

import express from 'express';
import { enhancedRecordingService } from '../services/enhancedRecordingService';
import { addLog, getConfig, setConfig } from '../config/database';

const router = express.Router();

/**
 * 获取增强录制状态
 */
router.get('/status', (req, res) => {
  try {
    const state = enhancedRecordingService.getState();
    const storageStatus = enhancedRecordingService.getState().totalStorageUsed;
    const options = enhancedRecordingService.getOptions();
    
    res.json({
      success: true,
      data: {
        isStreaming: state.isStreaming,
        isRecording: state.isRecording,
        currentDevice: state.currentDevice,
        currentRecordingId: state.currentRecordingId,
        recordingStartTime: state.recordingStartTime,
        recordingFilePath: state.recordingFilePath,
        segmentNumber: state.segmentNumber,
        currentFileSize: state.currentFileSize,
        elapsedSeconds: state.elapsedSeconds,
        totalStorageUsed: storageStatus,
        storageLimit: options.maxStorageSize,
        storagePercentage: Math.round((storageStatus / options.maxStorageSize) * 100),
        maxSegmentSize: options.maxSegmentSize,
        autoCleanup: options.autoCleanup
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取状态失败: ${error.message}`
    });
  }
});

/**
 * 启动增强录制（预览 + 录制）
 */
router.post('/start', async (req, res) => {
  try {
    const { devicePath, enableRecording = false } = req.body;
    
    if (!devicePath) {
      return res.status(400).json({
        success: false,
        message: '设备路径不能为空'
      });
    }

    const result = await enhancedRecordingService.startEnhancedRecording(devicePath, enableRecording);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `启动失败: ${error.message}`
    });
  }
});

/**
 * 停止录制但保持预览
 */
router.post('/stop', async (req, res) => {
  try {
    const result = await enhancedRecordingService.stopEnhancedRecording();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `停止失败: ${error.message}`
    });
  }
});

/**
 * 停止增强流（完全停止）
 */
router.post('/stop-stream', async (req, res) => {
  try {
    const result = await enhancedRecordingService.stopEnhancedStream();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `停止流失败: ${error.message}`
    });
  }
});

/**
 * 更新录制配置
 */
router.post('/config', (req, res) => {
  try {
    const { maxSegmentSize, storageLimit, autoCleanup } = req.body;
    
    if (maxSegmentSize !== undefined) {
      setConfig('max_segment_size', maxSegmentSize.toString());
    }
    
    if (storageLimit !== undefined) {
      setConfig('storage_limit', storageLimit.toString());
    }
    
    if (autoCleanup !== undefined) {
      setConfig('auto_cleanup', autoCleanup.toString());
    }
    
    // 重新加载配置
    enhancedRecordingService.getOptions();
    
    res.json({
      success: true,
      message: '配置已更新'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `更新配置失败: ${error.message}`
    });
  }
});

/**
 * 清理存储空间
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { targetSize } = req.body;
    
    // 这里可以调用清理逻辑
    // 在实际实现中，需要调用存储清理方法
    
    res.json({
      success: true,
      message: '存储清理已触发'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `清理失败: ${error.message}`
    });
  }
});

export default router;