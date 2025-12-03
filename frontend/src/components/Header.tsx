import { Video, Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  isConnected: boolean;
}

export function Header({ isConnected }: HeaderProps) {
  return (
    <header className="bg-dark-card/80 backdrop-blur-lg border-b border-dark-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/25">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-dark-text">USB 摄像头录制</h1>
              <p className="text-xs text-dark-muted">Camera Recording System</p>
            </div>
          </div>

          {/* 连接状态 */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              isConnected
                ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4" />
                <span>已连接</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" />
                <span>未连接</span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
