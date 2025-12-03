import { Router, Request, Response } from 'express';
import * as cameraService from '../services/cameraService';
import { getConfig, setConfig } from '../config/database';

const router = Router();

// 获取所有摄像头设备
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const cameras = await cameraService.detectCameras();
    const selectedCamera = getConfig('selected_camera');
    
    res.json({
      success: true,
      data: {
        cameras,
        selectedCamera,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取摄像头列表失败: ${error.message}`,
    });
  }
});

// 选择摄像头
router.post('/select', async (req: Request, res: Response) => {
  try {
    const { devicePath } = req.body;
    
    if (!devicePath) {
      return res.status(400).json({
        success: false,
        message: '请提供设备路径',
      });
    }

    // 验证设备是否存在
    const cameras = await cameraService.detectCameras();
    const camera = cameras.find(c => c.path === devicePath);
    
    if (!camera) {
      return res.status(404).json({
        success: false,
        message: '未找到指定的摄像头设备',
      });
    }

    setConfig('selected_camera', devicePath);
    
    res.json({
      success: true,
      message: '摄像头已选择',
      data: { camera },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `选择摄像头失败: ${error.message}`,
    });
  }
});

// 测试摄像头
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { devicePath } = req.body;
    const targetDevice = devicePath || getConfig('selected_camera');
    
    if (!targetDevice) {
      return res.status(400).json({
        success: false,
        message: '请先选择摄像头设备',
      });
    }

    const result = await cameraService.testCamera(targetDevice);
    res.json({
      success: result.success,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `测试摄像头失败: ${error.message}`,
    });
  }
});

// 获取摄像头信息
router.get('/info/:deviceId', async (req: Request, res: Response) => {
  try {
    const devicePath = `/dev/${req.params.deviceId}`;
    const camera = await cameraService.getCameraInfo(devicePath);
    
    if (!camera) {
      return res.status(404).json({
        success: false,
        message: '未找到指定的摄像头设备',
      });
    }

    res.json({
      success: true,
      data: camera,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取摄像头信息失败: ${error.message}`,
    });
  }
});

export default router;
