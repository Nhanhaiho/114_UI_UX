import React from 'react';
import { Flame, Settings, ChevronDown } from 'lucide-react';
import type { ModelStatus } from '../types';

interface HeaderProps {
  isConnected: boolean;
  isChecking: boolean;
  modelStatus: ModelStatus | null;
  isMockMode: boolean;
  onToggleMockMode: (val: boolean) => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  isChecking,
  modelStatus,
  isMockMode,
  onToggleMockMode,
  onOpenSettings,
}) => {
  const getShortModelName = (status: ModelStatus | null) => {
    if (!status?.is_ready) return 'Chưa nạp';
    const name = status.model_name || status.model_path || '';
    if (name.includes('P2+SRC')) return 'YOLO-SRC';
    if (name.includes('combined') || name.includes('26n')) return 'YOLO26n';
    if (name.includes('v10') || name.includes('V10')) return 'YOLOv10';
    if (name.includes('v8') || name.includes('V8')) return 'YOLOv8';
    if (name.includes('v11') || name.includes('V11')) return 'YOLOv11';
    return name.split(' ')[0] || 'YOLO';
  };

  return (
    <header className="editorial-header">
      {/* Brand logo & title */}
      <div className="editorial-brand">
        <Flame className="editorial-flame-icon" size={20} />
        <span className="editorial-brand-title">Fire Detection Studio</span>
      </div>

      {/* Controls & Indicators */}
      <div className="editorial-header-actions">
        {/* 1. Trạng thái kết nối */}
        <div
          className="editorial-conn-pill"
          title={isConnected ? 'Backend đang kết nối tốt' : 'Mất kết nối backend'}
        >
          <span
            className={`conn-dot ${isChecking ? 'checking' : isConnected ? 'online' : 'offline'
              }`}
          />
          <span className="conn-text">{isConnected ? 'Kết nối' : 'Ngắt kết nối'}</span>
        </div>

        <span className="editorial-divider">|</span>

        {/* 2. Model selector dropdown pill (tên model ngắn) */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="editorial-model-btn"
          title={
            modelStatus?.is_ready
              ? `Mô hình: ${modelStatus.model_name} (Bấm để xem danh sách .pt và đổi mô hình)`
              : 'Chưa nạp checkpoint (Bấm để chọn mô hình)'
          }
          aria-label="Chọn mô hình AI"
        >
          <span>{getShortModelName(modelStatus)}</span>
          <ChevronDown size={14} className="model-chevron" />
        </button>

        {isMockMode && (
          <button
            type="button"
            className="editorial-mock-chip"
            onClick={() => onToggleMockMode(false)}
            title="Đang bật dữ liệu mô phỏng cố định. Bấm để tắt."
          >
            Mô phỏng ✕
          </button>
        )}

        <span className="editorial-divider">|</span>

        {/* 3. Nút cài đặt (icon Gear) */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="editorial-settings-btn"
          title="Thông số & Cấu hình Kỹ thuật"
          aria-label="Cài đặt kỹ thuật"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
};
