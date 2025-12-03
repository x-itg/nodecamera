/**
 * 跨平台工具模块
 * 提供操作系统检测和平台特定功能
 */

import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 平台类型
export type Platform = 'windows' | 'linux' | 'darwin' | 'unknown';

// 获取当前平台
export function getPlatform(): Platform {
  const platform = os.platform();
  switch (platform) {
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'darwin';
    default:
      return 'unknown';
  }
}

// 检查是否为Windows
export function isWindows(): boolean {
  return getPlatform() === 'windows';
}

// 检查是否为Linux
export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

// 检查是否为macOS
export function isDarwin(): boolean {
  return getPlatform() === 'darwin';
}

// 获取FFmpeg输入格式
export function getFFmpegInputFormat(): string {
  switch (getPlatform()) {
    case 'windows':
      return 'dshow';
    case 'linux':
      return 'v4l2';
    case 'darwin':
      return 'avfoundation';
    default:
      return 'v4l2';
  }
}

// 格式化摄像头设备路径
export function formatDevicePath(deviceName: string, devicePath?: string): string {
  const platform = getPlatform();
  
  if (platform === 'windows') {
    // Windows DirectShow 格式: video=设备名称
    return `video=${deviceName}`;
  } else if (platform === 'darwin') {
    // macOS AVFoundation 格式: 设备索引
    return devicePath || '0';
  } else {
    // Linux V4L2 格式: /dev/videoX
    return devicePath || '/dev/video0';
  }
}

// 获取FFmpeg设备输入参数
export function getFFmpegDeviceInput(devicePath: string): string[] {
  const platform = getPlatform();
  const format = getFFmpegInputFormat();
  
  if (platform === 'windows') {
    // Windows需要特殊的输入格式
    return ['-f', format, '-i', devicePath];
  } else {
    return ['-f', format, '-i', devicePath];
  }
}

// 标准化路径（跨平台）
export function normalizePath(inputPath: string): string {
  // 使用Node.js的path.normalize确保路径正确
  return path.normalize(inputPath);
}

// 获取用户主目录
export function getHomeDir(): string {
  return os.homedir();
}

// 获取默认数据目录
export function getDefaultDataDir(): string {
  const platform = getPlatform();
  const homeDir = getHomeDir();
  
  if (platform === 'windows') {
    // Windows: %LOCALAPPDATA%\usb-camera-recorder
    return path.join(process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'usb-camera-recorder');
  } else if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/usb-camera-recorder
    return path.join(homeDir, 'Library', 'Application Support', 'usb-camera-recorder');
  } else {
    // Linux: ~/.local/share/usb-camera-recorder
    return path.join(homeDir, '.local', 'share', 'usb-camera-recorder');
  }
}

// 获取FFmpeg可执行文件路径
export async function getFFmpegPath(): Promise<string> {
  const platform = getPlatform();
  
  try {
    if (platform === 'windows') {
      // 尝试从PATH中找到ffmpeg
      const { stdout } = await execAsync('where ffmpeg');
      return stdout.trim().split('\n')[0];
    } else {
      const { stdout } = await execAsync('which ffmpeg');
      return stdout.trim();
    }
  } catch {
    // 如果找不到，返回默认名称（依赖PATH）
    return 'ffmpeg';
  }
}

// 检查FFmpeg是否可用
export async function checkFFmpegAvailable(): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync('ffmpeg -version');
    const output = stdout || stderr;
    const versionMatch = output.match(/ffmpeg version (\S+)/);
    return {
      available: true,
      version: versionMatch ? versionMatch[1] : 'unknown'
    };
  } catch (error: any) {
    return {
      available: false,
      error: error.message
    };
  }
}

// 获取空输出设备（用于测试）
export function getNullDevice(): string {
  return isWindows() ? 'NUL' : '/dev/null';
}

// 获取进程终止信号
export function getTermSignal(): NodeJS.Signals {
  return isWindows() ? 'SIGTERM' : 'SIGTERM';
}

// 获取强制终止信号
export function getKillSignal(): NodeJS.Signals {
  return isWindows() ? 'SIGKILL' : 'SIGKILL';
}

// 转义shell参数（防止注入）
export function escapeShellArg(arg: string): string {
  if (isWindows()) {
    // Windows CMD/PowerShell转义
    return `"${arg.replace(/"/g, '\\"')}"`;
  } else {
    // Unix shell转义
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
}

// 获取平台信息
export function getPlatformInfo(): {
  platform: Platform;
  arch: string;
  osVersion: string;
  nodeVersion: string;
} {
  return {
    platform: getPlatform(),
    arch: os.arch(),
    osVersion: os.release(),
    nodeVersion: process.version
  };
}

// 获取列出设备的命令
export function getListDevicesCommand(): string {
  const platform = getPlatform();
  
  if (platform === 'windows') {
    // Windows: 使用ffmpeg列出DirectShow设备
    return 'ffmpeg -list_devices true -f dshow -i dummy 2>&1';
  } else if (platform === 'darwin') {
    // macOS: 使用ffmpeg列出AVFoundation设备
    return 'ffmpeg -f avfoundation -list_devices true -i "" 2>&1';
  } else {
    // Linux: 使用v4l2-ctl
    return 'v4l2-ctl --list-devices 2>/dev/null || ls /dev/video* 2>/dev/null';
  }
}
