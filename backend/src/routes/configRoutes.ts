import { Router, Request, Response } from 'express';
import { getAllConfigs, getConfig, setConfig, getLogs } from '../config/database';

const router = Router();

// 获取所有配置
router.get('/', (req: Request, res: Response) => {
  try {
    const configs = getAllConfigs();
    
    res.json({
      success: true,
      data: configs,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取配置失败: ${error.message}`,
    });
  }
});

// 获取单个配置
router.get('/:key', (req: Request, res: Response) => {
  try {
    const value = getConfig(req.params.key);
    
    if (value === null) {
      return res.status(404).json({
        success: false,
        message: '配置项不存在',
      });
    }

    res.json({
      success: true,
      data: { key: req.params.key, value },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取配置失败: ${error.message}`,
    });
  }
});

// 更新配置
router.put('/:key', (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        message: '请提供配置值',
      });
    }

    setConfig(req.params.key, String(value));
    
    res.json({
      success: true,
      message: '配置已更新',
      data: { key: req.params.key, value: String(value) },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `更新配置失败: ${error.message}`,
    });
  }
});

// 批量更新配置
router.put('/', (req: Request, res: Response) => {
  try {
    const configs = req.body;
    
    console.log('📝 收到配置更新请求:', configs);
    
    if (!configs || typeof configs !== 'object') {
      return res.status(400).json({
        success: false,
        message: '请提供有效的配置对象',
      });
    }

    for (const [key, value] of Object.entries(configs)) {
      console.log(`  设置配置: ${key} = ${value}`);
      setConfig(key, String(value));
    }
    
    console.log('✅ 配置更新成功');
    
    res.json({
      success: true,
      message: '配置已更新',
      data: configs,
    });
  } catch (error: any) {
    console.error('❌ 配置更新失败:', error.message);
    res.status(500).json({
      success: false,
      message: `更新配置失败: ${error.message}`,
    });
  }
});

// 获取系统日志
router.get('/logs/list', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const category = req.query.category as string | undefined;
    
    const logs = getLogs(limit, category);
    
    res.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `获取日志失败: ${error.message}`,
    });
  }
});

export default router;
