import { useEffect, useState } from 'react';
import { Settings, Camera, Save, RefreshCw, CheckCircle } from 'lucide-react';
import { cameraApi, configApi } from '../services/api';
import type { CameraDevice, AppConfig } from '../types';

interface SettingsPanelProps {
  onCameraChange: (path: string) => void;
  selectedCamera: string | null;
}

export function SettingsPanel({ onCameraChange, selectedCamera }: SettingsPanelProps) {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [config, setConfig] = useState<Partial<AppConfig>>({});
  const [isLoadingCameras, setIsLoadingCameras] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载摄像头列表
  const loadCameras = async () => {
    setIsLoadingCameras(true);
    const result = await cameraApi.getDevices();
    if (result.success && result.data) {
      setCameras(result.data.cameras);
      if (result.data.selectedCamera && !selectedCamera) {
        onCameraChange(result.data.selectedCamera);
      }
    }
    setIsLoadingCameras(false);
  };

  // 加载配置
  const loadConfig = async () => {
    const result = await configApi.getAll();
    if (result.success && result.data) {
      setConfig(result.data);
      if (result.data.selected_camera) {
        onCameraChange(result.data.selected_camera);
      }
    }
  };

  useEffect(() => {
    loadCameras();
    loadConfig();
  }, []);

  // 选择摄像头
  const handleCameraSelect = async (devicePath: string) => {
    const result = await cameraApi.selectCamera(devicePath);
    if (result.success) {
      onCameraChange(devicePath);
      setConfig((prev) => ({ ...prev, selected_camera: devicePath }));
    } else {
      setError(result.message || '选择摄像头失败');
    }
  };

  // 更新配置
  const handleConfigChange = (key: keyof AppConfig, value: string) => {
    console.log(`🔧 配置变更: ${key} = ${value}`);
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // 保存配置
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    console.log('💾 保存配置:', config);
    const result = await configApi.updateAll(config);
    console.log('💾 保存结果:', result);
    
    if (result.success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setError(result.message || '保存配置失败');
    }

    setIsSaving(false);
  };

  // 格式化存储大小显示
  const formatStorageSize = (bytes: string): string => {
    const num = parseInt(bytes);
    if (isNaN(num)) return bytes;
    return (num / (1024 * 1024 * 1024)).toFixed(2);
  };

  // 将GB转换为字节
  const gbToBytes = (gb: string): string => {
    const num = parseFloat(gb);
    if (isNaN(num)) return gb;
    return Math.floor(num * 1024 * 1024 * 1024).toString();
  };

  return (
    <div className="card-glass p-6">
      <h3 className="text-lg font-semibold text-dark-text mb-4 flex items-center gap-2">
        <Settings className="w-5 h-5 text-primary-500" />
        设置
      </h3>

      {/* 摄像头选择 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-dark-muted flex items-center gap-2">
            <Camera className="w-4 h-4" />
            摄像头设备
          </label>
          <button
            onClick={loadCameras}
            disabled={isLoadingCameras}
            className="text-primary-500 hover:text-primary-400 transition-colors"
            title="刷新设备列表"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingCameras ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <select
          value={selectedCamera || ''}
          onChange={(e) => handleCameraSelect(e.target.value)}
          className="select-dark w-full"
          disabled={isLoadingCameras}
        >
          <option value="">选择摄像头...</option>
          {cameras.map((camera) => (
            <option key={camera.id} value={camera.path}>
              {camera.name} ({camera.path})
            </option>
          ))}
        </select>
        {cameras.length === 0 && !isLoadingCameras && (
          <p className="mt-2 text-sm text-dark-muted">未检测到摄像头设备</p>
        )}
      </div>

      {/* 录制时长 */}
      <div className="mb-4">
        <label className="block text-sm text-dark-muted mb-2">录制时长（分钟/段）</label>
        <input
          type="number"
          value={Math.floor(parseInt(config.recording_duration || '3600') / 60)}
          onChange={(e) =>
            handleConfigChange('recording_duration', (parseInt(e.target.value) * 60).toString())
          }
          className="input-dark w-full"
          min="1"
          max="1440"
        />
        <p className="mt-1 text-xs text-dark-muted">每段录制完成后自动开始下一段</p>
      </div>

      {/* 存储限制 */}
      <div className="mb-4">
        <label className="block text-sm text-dark-muted mb-2">存储限制（GB）</label>
        <input
          type="number"
          step="0.01"
          value={formatStorageSize(config.storage_limit || '107374182400')}
          onChange={(e) => handleConfigChange('storage_limit', gbToBytes(e.target.value))}
          className="input-dark w-full"
          min="0.01"
          max="10000"
        />
        <p className="mt-1 text-xs text-dark-muted">接近上限时自动删除最旧的录制文件（支持小数，如 0.05 = 50MB）</p>
      </div>

      {/* 单文件大小限制 */}
      <div className="mb-4">
        <label className="block text-sm text-dark-muted mb-2">单文件大小限制（MB）</label>
        <input
          type="number"
          step="0.1"
          value={(parseInt(config.max_file_size || '104857600') / 1024 / 1024).toFixed(1)}
          onChange={(e) => 
            handleConfigChange('max_file_size', Math.floor(parseFloat(e.target.value) * 1024 * 1024).toString())
          }
          className="input-dark w-full"
          min="0.1"
          max="10000"
        />
        <p className="mt-1 text-xs text-dark-muted">达到此大小自动开始下一段录制（支持小数，如 0.5 = 500KB）</p>
      </div>

      {/* 视频质量 */}
      <div className="mb-4">
        <label className="block text-sm text-dark-muted mb-2">视频质量</label>
        <select
          value={config.video_quality || 'medium'}
          onChange={(e) => handleConfigChange('video_quality', e.target.value)}
          className="select-dark w-full"
        >
          <option value="low">低（高压缩率）</option>
          <option value="medium">中等（推荐）</option>
          <option value="high">高（大文件）</option>
        </select>
      </div>

      {/* 视频分辨率 */}
      <div className="mb-4">
        <label className="block text-sm text-dark-muted mb-2">视频分辨率</label>
        <select
          value={config.video_resolution || '1280x720'}
          onChange={(e) => handleConfigChange('video_resolution', e.target.value)}
          className="select-dark w-full"
        >
          <option value="640x480">640x480 (VGA)</option>
          <option value="1280x720">1280x720 (720p)</option>
          <option value="1920x1080">1920x1080 (1080p)</option>
        </select>
      </div>

      {/* 帧率 */}
      <div className="mb-4">
        <label className="block text-sm text-dark-muted mb-2">帧率 (FPS)</label>
        <select
          value={config.video_fps || '30'}
          onChange={(e) => handleConfigChange('video_fps', e.target.value)}
          className="select-dark w-full"
        >
          <option value="15">15 FPS</option>
          <option value="24">24 FPS</option>
          <option value="30">30 FPS</option>
          <option value="60">60 FPS</option>
        </select>
      </div>

      {/* 自动启动录制 */}
      <div className="mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.auto_start === 'true'}
            onChange={(e) => handleConfigChange('auto_start', e.target.checked.toString())}
            className="w-4 h-4 rounded border-dark-border bg-dark-card text-primary-500 focus:ring-primary-500/50"
          />
          <span className="text-sm text-dark-text">开机自动启动录制</span>
        </label>
        <p className="mt-1 text-xs text-dark-muted ml-7">服务启动后自动开始录制选中的摄像头</p>
      </div>

      {/* 自动清理 */}
      <div className="mb-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.auto_cleanup === 'true'}
            onChange={(e) => handleConfigChange('auto_cleanup', e.target.checked.toString())}
            className="w-4 h-4 rounded border-dark-border bg-dark-card text-primary-500 focus:ring-primary-500/50"
          />
          <span className="text-sm text-dark-text">自动清理旧录制文件</span>
        </label>
        <p className="mt-1 text-xs text-dark-muted ml-7">达到存储限制时自动删除最旧的录制</p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 保存按钮 */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className={`w-full flex items-center justify-center gap-2 py-3 font-medium rounded-lg transition-colors ${
          saveSuccess
            ? 'bg-green-500 text-white'
            : 'bg-primary-500 hover:bg-primary-600 text-white'
        }`}
      >
        {saveSuccess ? (
          <>
            <CheckCircle className="w-5 h-5" />
            已保存
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            {isSaving ? '保存中...' : '保存设置'}
          </>
        )}
      </button>
    </div>
  );
}
