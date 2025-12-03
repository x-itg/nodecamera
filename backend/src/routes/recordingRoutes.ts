import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import recordingService from '../services/recordingService';
import unifiedMediaService from '../services/unifiedMediaService';
import autoRecordingService from '../services/autoRecordingService';
import * as RecordingModel from '../models/recording';
import { getConfig } from '../config/database';

const router = Router();

// 获取录制状态
router.get('/status', (req: Request, res: Response) => {
  try {
    const mediaState = unifiedMediaService.getState();
    const recordingState = recordingService.getState();
    
    res.json({
      success: true,
      data: {
        recording: {
          isRecording: mediaState.isRecording,
          isPaused: recordingState.isPaused,
          currentRecordingId: mediaState.currentRecordingId,
          startTime: mediaState.recordingStartTime,
          elapsedSeconds: mediaState.recordingStartTime 
            ? Math.round((Date.now() - mediaState.recordingStartTime.getTime()) / 1000)
            : 0,
          currentFileSize: 0,
          segmentNumber: recordingState.segmentNumber,
        },
        storage: recordingService.getStorageStatus(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取录制状态失败: ${error.message}`,
    });
  }
});

// 开始录制
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { cameraPath } = req.body;
    const targetDevice = cameraPath || getConfig('selected_camera');
    
    if (!targetDevice) {
      return res.status(400).json({
        success: false,
        message: '请先选择摄像头设备',
      });
    }

    // 使用自动录制服务（支持循环录制和自动清理）
    const result = await autoRecordingService.userStartRecording(targetDevice);
    
    res.json({
      success: result.success,
      message: result.message,
      data: result.recordingId ? { recordingId: result.recordingId } : undefined,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `开始录制失败: ${error.message}`,
    });
  }
});

// 停止录制
router.post('/stop', async (req: Request, res: Response) => {
  try {
    // 使用自动录制服务（会设置手动停止标志）
    const result = await autoRecordingService.userStopRecording();
    
    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `停止录制失败: ${error.message}`,
    });
  }
});

// 暂停录制
router.post('/pause', async (req: Request, res: Response) => {
  try {
    const result = await recordingService.pauseRecording();
    
    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `暂停录制失败: ${error.message}`,
    });
  }
});

// 恢复录制
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const result = await recordingService.resumeRecording();
    
    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `恢复录制失败: ${error.message}`,
    });
  }
});

// 获取录制列表
router.get('/list', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const recordings = RecordingModel.getAllRecordings(limit, offset);
    const stats = RecordingModel.getRecordingStats();
    
    res.json({
      success: true,
      data: {
        recordings,
        stats,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取录制列表失败: ${error.message}`,
    });
  }
});

// 获取单个录制详情
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const recording = RecordingModel.getRecordingById(id);
    
    if (!recording) {
      return res.status(404).json({
        success: false,
        message: '未找到指定的录制记录',
      });
    }

    res.json({
      success: true,
      data: recording,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取录制详情失败: ${error.message}`,
    });
  }
});

// 删除录制
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const recording = RecordingModel.getRecordingById(id);
    
    if (!recording) {
      return res.status(404).json({
        success: false,
        message: '未找到指定的录制记录',
      });
    }

    // 删除文件
    if (fs.existsSync(recording.filepath)) {
      fs.unlinkSync(recording.filepath);
    }

    // 硬删除记录
    RecordingModel.hardDeleteRecording(id);

    res.json({
      success: true,
      message: '录制已删除',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `删除录制失败: ${error.message}`,
    });
  }
});

// 下载录制文件
router.get('/:id/download', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const recording = RecordingModel.getRecordingById(id);
    
    if (!recording) {
      return res.status(404).json({
        success: false,
        message: '未找到指定的录制记录',
      });
    }

    if (!fs.existsSync(recording.filepath)) {
      return res.status(404).json({
        success: false,
        message: '录制文件不存在',
      });
    }

    res.download(recording.filepath, recording.filename);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `下载录制失败: ${error.message}`,
    });
  }
});

// 获取存储状态
router.get('/storage/status', (req: Request, res: Response) => {
  try {
    const status = recordingService.getStorageStatus();
    const storagePath = getConfig('storage_path');
    
    res.json({
      success: true,
      data: {
        ...status,
        path: storagePath,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取存储状态失败: ${error.message}`,
    });
  }
});

export default router;
