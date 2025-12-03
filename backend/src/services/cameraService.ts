import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { addLog } from '../config/database';
import { 
  getPlatform, 
  isWindows, 
  isLinux, 
  isDarwin,
  getFFmpegInputFormat,
  formatDevicePath,
  getListDevicesCommand,
  getNullDevice
} from '../utils/platform';

const execAsync = promisify(exec);

export interface CameraDevice {
  id: string;
  name: string;
  path: string;
  capabilities: string[];
  resolutions: string[];
  status: 'available' | 'in_use' | 'error';
}

// 检测系统中的USB摄像头设备
export async function detectCameras(): Promise<CameraDevice[]> {
  const platform = getPlatform();
  
  console.log('[detectCameras] 开始检测摄像头，平台:', platform);
  
  try {
    if (platform === 'windows') {
      console.log('[detectCameras] 调用 detectWindowsCameras');
      return await detectWindowsCameras();
    } else if (platform === 'darwin') {
      return await detectMacCameras();
    } else {
      return await detectLinuxCameras();
    }
  } catch (error: any) {
    console.error('[detectCameras] 错误:', error);
    addLog('error', 'camera', '检测摄像头设备失败', { error: error.message, platform });
    return [];
  }
}

// Windows摄像头检测（使用DirectShow）
async function detectWindowsCameras(): Promise<CameraDevice[]> {
  const cameras: CameraDevice[] = [];
  
  try {
    // 使用FFmpeg列出DirectShow设备
    const command = 'ffmpeg -list_devices true -f dshow -i dummy 2>&1';
    
    console.log('[Camera Detection] 执行命令:', command);
    
    let stdout = '';
    try {
      const result = await execAsync(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      stdout = result.stdout + result.stderr;
    } catch (e: any) {
      // ffmpeg -list_devices 会返回非0退出码，但输出包含设备信息
      stdout = (e.stdout || '') + (e.stderr || '');
    }
    
    console.log('[Camera Detection] FFmpeg 输出长度:', stdout.length);
    console.log('[Camera Detection] FFmpeg 输出前500字符:', stdout.substring(0, 500));
    
    // 解析视频设备
    const lines = stdout.split('\n');
    
    console.log('[Camera Detection] 总行数:', lines.length);
    
    let skipNext = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 如果上一行已经添加了设备，这一行是 Alternative name，跳过
      if (skipNext) {
        skipNext = false;
        continue;
      }
      
      // 查找视频设备行，格式: [dshow @ xxx] "设备名称" (video)
      if (line.includes('(video)') && line.includes('"')) {
        console.log('[Camera Detection] 找到视频设备行:', line);
        
        const deviceMatch = line.match(/"([^"]+)"/);
        
        if (deviceMatch) {
          const deviceName = deviceMatch[1];
          
          console.log('[Camera Detection] 提取设备名称:', deviceName);
          
          // 跳过虚拟设备
          if (deviceName.includes('Virtual') || 
              deviceName.includes('Screen Capture') ||
              deviceName.includes('screen-capture')) {
            console.log('[Camera Detection] 跳过虚拟设备:', deviceName);
            continue;
          }
          
          console.log('[Camera Detection] 添加摄像头:', deviceName);
          
          const camera: CameraDevice = {
            id: `video=${deviceName}`,
            name: deviceName,
            path: `video=${deviceName}`,
            capabilities: ['video'],
            resolutions: await getWindowsDeviceResolutions(deviceName),
            status: 'available'
          };
          
          cameras.push(camera);
          
          // 下一行可能是 Alternative name，设置标记跳过
          skipNext = true;
        }
      }
    }
    
    console.log('[Camera Detection] 最终检测到摄像头数量:', cameras.length);
    addLog('info', 'camera', `Windows检测到 ${cameras.length} 个摄像头设备`, { cameras: cameras.map(c => c.name) });
  } catch (error: any) {
    console.error('[Camera Detection] 错误:', error);
    addLog('error', 'camera', 'Windows摄像头检测失败', { error: error.message });
  }
  
  return cameras;
}

// 获取Windows设备分辨率
async function getWindowsDeviceResolutions(deviceName: string): Promise<string[]> {
  try {
    // 使用ffmpeg查询设备支持的格式
    const command = `ffmpeg -f dshow -list_options true -i video="${deviceName}" 2>&1`;
    
    let stdout = '';
    try {
      const result = await execAsync(command);
      stdout = result.stdout + result.stderr;
    } catch (e: any) {
      stdout = e.stdout + e.stderr;
    }
    
    // 解析分辨率
    const resolutions = new Set<string>();
    const resMatches = stdout.matchAll(/(\d{3,4})x(\d{3,4})/g);
    
    for (const match of resMatches) {
      const res = `${match[1]}x${match[2]}`;
      // 过滤合理的分辨率
      const width = parseInt(match[1]);
      const height = parseInt(match[2]);
      if (width >= 320 && width <= 4096 && height >= 240 && height <= 2160) {
        resolutions.add(res);
      }
    }
    
    const resArray = Array.from(resolutions);
    return resArray.length > 0 ? resArray : ['1280x720', '640x480', '1920x1080'];
  } catch {
    return ['1280x720', '640x480', '1920x1080'];
  }
}

// macOS摄像头检测（使用AVFoundation）
async function detectMacCameras(): Promise<CameraDevice[]> {
  const cameras: CameraDevice[] = [];
  
  try {
    const command = 'ffmpeg -f avfoundation -list_devices true -i "" 2>&1';
    
    let stdout = '';
    try {
      const result = await execAsync(command);
      stdout = result.stdout + result.stderr;
    } catch (e: any) {
      stdout = e.stdout + e.stderr;
    }
    
    // 解析视频设备
    const lines = stdout.split('\n');
    let isVideoSection = false;
    let deviceIndex = 0;
    
    for (const line of lines) {
      if (line.includes('AVFoundation video devices')) {
        isVideoSection = true;
        continue;
      }
      
      if (line.includes('AVFoundation audio devices')) {
        isVideoSection = false;
        continue;
      }
      
      if (isVideoSection) {
        // 格式: [AVFoundation @ xxx] [0] FaceTime HD Camera
        const deviceMatch = line.match(/\[(\d+)\]\s+(.+)$/);
        if (deviceMatch) {
          const index = deviceMatch[1];
          const name = deviceMatch[2].trim();
          
          cameras.push({
            id: `video=${name}`,
            name: name,
            path: index,
            capabilities: ['video'],
            resolutions: ['1280x720', '640x480', '1920x1080'],
            status: 'available'
          });
        }
      }
    }
    
    addLog('info', 'camera', `macOS检测到 ${cameras.length} 个摄像头设备`, { cameras: cameras.map(c => c.name) });
  } catch (error: any) {
    addLog('error', 'camera', 'macOS摄像头检测失败', { error: error.message });
  }
  
  return cameras;
}

// Linux摄像头检测（使用V4L2）
async function detectLinuxCameras(): Promise<CameraDevice[]> {
  const cameras: CameraDevice[] = [];

  try {
    // Linux: 使用 v4l2-ctl 检测摄像头
    const { stdout } = await execAsync('v4l2-ctl --list-devices 2>/dev/null || echo ""');
    
    if (stdout.trim()) {
      const lines = stdout.split('\n');
      let currentCamera: Partial<CameraDevice> | null = null;
      
      for (const line of lines) {
        if (line.includes(':')) {
          // 这是设备名称行
          if (currentCamera && currentCamera.path) {
            cameras.push(currentCamera as CameraDevice);
          }
          currentCamera = {
            name: line.replace(':', '').trim(),
            capabilities: [],
            resolutions: [],
            status: 'available',
          };
        } else if (line.trim().startsWith('/dev/video')) {
          // 这是设备路径行
          if (currentCamera) {
            const devicePath = line.trim();
            currentCamera.path = devicePath;
            currentCamera.id = `video=${devicePath.replace('/dev/', '')}`;
            
            // 获取设备分辨率支持
            try {
              const resolutions = await getLinuxDeviceResolutions(devicePath);
              currentCamera.resolutions = resolutions;
            } catch (e) {
              currentCamera.resolutions = ['1280x720', '640x480'];
            }
          }
        }
      }
      
      if (currentCamera && currentCamera.path) {
        cameras.push(currentCamera as CameraDevice);
      }
    }

    // 如果没有检测到设备，尝试直接检查 /dev/video* 设备
    if (cameras.length === 0) {
      const { stdout: lsOutput } = await execAsync('ls /dev/video* 2>/dev/null || echo ""');
      const devices = lsOutput.trim().split('\n').filter(d => d);
      
      for (const devicePath of devices) {
        const id = devicePath.replace('/dev/', '');
        cameras.push({
          id: `video=${id}`,
          name: `Video Device ${id}`,
          path: devicePath,
          capabilities: [],
          resolutions: ['1280x720', '640x480', '1920x1080'],
          status: 'available',
        });
      }
    }

    addLog('info', 'camera', `Linux检测到 ${cameras.length} 个摄像头设备`, { cameras: cameras.map(c => c.id) });
  } catch (error: any) {
    addLog('error', 'camera', 'Linux检测摄像头设备失败', { error: error.message });
  }

  return cameras;
}

// 获取Linux设备支持的分辨率
async function getLinuxDeviceResolutions(devicePath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `v4l2-ctl -d ${devicePath} --list-formats-ext 2>/dev/null | grep -oP '\\d+x\\d+' | sort -u`
    );
    const resolutions = stdout.trim().split('\n').filter(r => r);
    return resolutions.length > 0 ? resolutions : ['1280x720', '640x480'];
  } catch {
    return ['1280x720', '640x480'];
  }
}

// 检查摄像头是否可用
export async function checkCameraAvailability(devicePath: string): Promise<boolean> {
  const platform = getPlatform();
  
  try {
    if (platform === 'windows') {
      // Windows: 使用ffmpeg测试
      const deviceName = devicePath.replace('video=', '');
      await execAsync(`ffmpeg -f dshow -i video="${deviceName}" -t 1 -f null NUL 2>&1`);
      return true;
    } else if (platform === 'darwin') {
      // macOS: 使用ffmpeg测试
      await execAsync(`ffmpeg -f avfoundation -i "${devicePath}" -t 1 -f null /dev/null 2>&1`);
      return true;
    } else {
      // Linux: 使用v4l2-ctl
      const { stdout } = await execAsync(`v4l2-ctl -d ${devicePath} --all 2>/dev/null`);
      return stdout.includes('Video input');
    }
  } catch {
    return false;
  }
}

// 获取单个摄像头信息
export async function getCameraInfo(devicePath: string): Promise<CameraDevice | null> {
  try {
    const cameras = await detectCameras();
    return cameras.find(c => c.path === devicePath) || null;
  } catch {
    return null;
  }
}

// 测试摄像头是否正常工作
export async function testCamera(devicePath: string): Promise<{ success: boolean; message: string }> {
  const platform = getPlatform();
  const inputFormat = getFFmpegInputFormat();
  const nullDevice = getNullDevice();
  
  try {
    let command: string;
    
    if (platform === 'windows') {
      // Windows DirectShow
      const deviceName = devicePath.replace('video=', '');
      command = `ffmpeg -f ${inputFormat} -i video="${deviceName}" -vframes 1 -f null ${nullDevice} 2>&1`;
    } else if (platform === 'darwin') {
      // macOS AVFoundation
      command = `ffmpeg -f ${inputFormat} -i "${devicePath}" -vframes 1 -f null ${nullDevice} 2>&1`;
    } else {
      // Linux V4L2
      command = `timeout 5 ffmpeg -f ${inputFormat} -i ${devicePath} -vframes 1 -f null ${nullDevice} 2>/dev/null`;
    }
    
    await execAsync(command);
    addLog('info', 'camera', `摄像头测试成功: ${devicePath}`);
    return { success: true, message: '摄像头工作正常' };
  } catch (error: any) {
    addLog('error', 'camera', `摄像头测试失败: ${devicePath}`, { error: error.message });
    return { success: false, message: '摄像头无法访问或不可用' };
  }
}

// 获取摄像头预览流URL（用于前端WebRTC或MJPEG）
export function getCameraStreamUrl(devicePath: string, port: number = 8081): string {
  return `http://localhost:${port}/stream?device=${encodeURIComponent(devicePath)}`;
}

// 获取摄像头设备的FFmpeg输入参数
export function getCameraFFmpegInput(devicePath: string, fps: string = '30', resolution: string = '1280x720'): string[] {
  const platform = getPlatform();
  const inputFormat = getFFmpegInputFormat();
  const [width, height] = resolution.split('x');
  
  if (platform === 'windows') {
    // Windows DirectShow: 确保设备路径正确格式
    let finalDevicePath = devicePath;
    if (!devicePath.startsWith('video=')) {
      finalDevicePath = `video=${devicePath}`;
    }
    
    // 添加更多的设备参数以提高兼容性
    return [
      '-f', inputFormat,
      '-rtbufsize', '100M',  // 增加实时缓冲区大小
      '-thread_queue_size', '512',  // 增加线程队列大小
      '-i', finalDevicePath,
      '-r', fps,  // 明确指定帧率
      '-video_size', `${width}x${height}`  // 明确指定分辨率
    ];
  } else if (platform === 'darwin') {
    return [
      '-f', inputFormat,
      '-framerate', fps,
      '-video_size', `${width}x${height}`,
      '-i', devicePath
    ];
  } else {
    return [
      '-f', inputFormat,
      '-framerate', fps,
      '-video_size', `${width}x${height}`,
      '-i', devicePath
    ];
  }
}
