import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import unifiedMediaService from '../services/unifiedMediaService';
import { getConfig } from '../config/database';

const router = Router();

// MJPEG视频流端点
router.get('/video', async (req: Request, res: Response) => {
  try {
    const devicePath = req.query.device as string || getConfig('selected_camera');
    
    console.log('[StreamRoutes] /video 请求:', { devicePath, query: req.query });

    if (!devicePath) {
      return res.status(400).json({
        success: false,
        message: '请先选择摄像头设备',
      });
    }

    // 启动流（如果尚未启动）- 仅预览模式
    const result = await unifiedMediaService.startStream(devicePath, false);
    console.log('[StreamRoutes] startStream 结果:', result);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    // 设置MJPEG响应头
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=mjpegboundary',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const clientId = uuidv4();

    console.log('[StreamRoutes] 添加客户端:', clientId);

    // 添加为流客户端
    unifiedMediaService.addClient({
      id: clientId,
      write: (data: Buffer) => {
        try {
          return res.write(data);
        } catch {
          return false;
        }
      },
      end: () => {
        try {
          res.end();
        } catch {}
      },
    });

    // 处理客户端断开
    req.on('close', () => {
      unifiedMediaService.removeClient(clientId);
    });
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: `获取视频流失败: ${error.message}`,
      });
    }
  }
});

// 获取流状态
router.get('/status', (req: Request, res: Response) => {
  try {
    const state = unifiedMediaService.getState();
    
    res.json({
      success: true,
      data: {
        isStreaming: state.isStreaming,
        clientCount: 0,
        device: state.currentDevice,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取流状态失败: ${error.message}`,
    });
  }
});

// 启动流
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { devicePath } = req.body;
    const targetDevice = devicePath || getConfig('selected_camera');
    
    if (!targetDevice) {
      return res.status(400).json({
        success: false,
        message: '请先选择摄像头设备',
      });
    }

    const result = await unifiedMediaService.startStream(targetDevice, false);
    
    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `启动流失败: ${error.message}`,
    });
  }
});

// 停止流
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const result = await unifiedMediaService.stopStream();
    
    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `停止流失败: ${error.message}`,
    });
  }
});

// 获取快照
router.get('/snapshot', (req: Request, res: Response) => {
  try {
    const frame = unifiedMediaService.getLatestFrame();
    
    if (!frame) {
      return res.status(404).json({
        success: false,
        message: '没有可用的视频帧，请先启动预览',
      });
    }

    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': frame.length,
    });
    res.end(frame);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取快照失败: ${error.message}`,
    });
  }
});

export default router;
