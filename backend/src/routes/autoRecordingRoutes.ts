import express from 'express';
import { getConfig, setConfig, addLog } from '../config/database';
import autoRecordingService from '../services/autoRecordingService';

const router = express.Router();

/**
 * 获取自动录制状态
 */
router.get('/status', (req, res) => {
  try {
    const status = autoRecordingService.getStatus();
    const config = {
      auto_start: getConfig('auto_start') === 'true',
      selected_camera: getConfig('selected_camera') || '',
      video_quality: getConfig('video_quality') || 'medium',
      video_fps: getConfig('video_fps') || '30',
      video_resolution: getConfig('video_resolution') || '1280x720',
      recording_duration: getConfig('recording_duration') || '3600',
    };

    res.json({
      success: true,
      data: {
        status,
        config
      }
    });
  } catch (error: any) {
    addLog('error', 'auto-recording', `获取自动录制状态失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取状态失败',
      error: error.message
    });
  }
});

/**
 * 更新自动录制配置
 */
router.put('/config', (req, res) => {
  try {
    const { auto_start, selected_camera, video_quality, video_fps, video_resolution, recording_duration } = req.body;

    // 验证参数
    if (auto_start !== undefined) {
      if (typeof auto_start !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'auto_start 必须是布尔值'
        });
      }
      setConfig('auto_start', auto_start.toString());
    }

    if (selected_camera !== undefined) {
      setConfig('selected_camera', selected_camera);
    }

    if (video_quality !== undefined) {
      if (!['low', 'medium', 'high'].includes(video_quality)) {
        return res.status(400).json({
          success: false,
          message: 'video_quality 必须是 low、medium 或 high'
        });
      }
      setConfig('video_quality', video_quality);
    }

    if (video_fps !== undefined) {
      const fps = parseInt(video_fps);
      if (isNaN(fps) || fps < 1 || fps > 60) {
        return res.status(400).json({
          success: false,
          message: 'video_fps 必须是 1-60 之间的数字'
        });
      }
      setConfig('video_fps', video_fps);
    }

    if (video_resolution !== undefined) {
      if (!['640x480', '1280x720', '1920x1080'].includes(video_resolution)) {
        return res.status(400).json({
          success: false,
          message: 'video_resolution 必须是 640x480、1280x720 或 1920x1080'
        });
      }
      setConfig('video_resolution', video_resolution);
    }

    if (recording_duration !== undefined) {
      const duration = parseInt(recording_duration);
      if (isNaN(duration) || duration < 1) {
        return res.status(400).json({
          success: false,
          message: 'recording_duration 必须是正整数'
        });
      }
      setConfig('recording_duration', recording_duration);
    }

    // 重启自动录制服务以应用新配置
    autoRecordingService.stop();
    setTimeout(() => {
      autoRecordingService.start();
    }, 1000);

    addLog('info', 'auto-recording', '自动录制配置已更新', req.body);

    res.json({
      success: true,
      message: '配置更新成功'
    });
  } catch (error: any) {
    addLog('error', 'auto-recording', `更新自动录制配置失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '配置更新失败',
      error: error.message
    });
  }
});

/**
 * 手动触发硬件检查
 */
router.post('/check-hardware', async (req, res) => {
  try {
    const result = await autoRecordingService.triggerHardwareCheck();
    
    res.json({
      success: result.success,
      message: result.message
    });
  } catch (error: any) {
    addLog('error', 'auto-recording', `手动硬件检查失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '硬件检查失败',
      error: error.message
    });
  }
});

/**
 * 手动启动自动录制
 */
router.post('/start', (req, res) => {
  try {
    autoRecordingService.start();
    
    res.json({
      success: true,
      message: '自动录制服务已启动'
    });
  } catch (error: any) {
    addLog('error', 'auto-recording', `手动启动自动录制失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '启动失败',
      error: error.message
    });
  }
});

/**
 * 手动停止自动录制
 */
router.post('/stop', (req, res) => {
  try {
    autoRecordingService.stop();
    
    res.json({
      success: true,
      message: '自动录制服务已停止'
    });
  } catch (error: any) {
    addLog('error', 'auto-recording', `手动停止自动录制失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '停止失败',
      error: error.message
    });
  }
});

export default router;