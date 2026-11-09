import React from 'react';
import { Flame, Sliders } from 'lucide-react';
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
  return (
    <header className="app-header">
      {/* Brand logo & title */}
      <div className="header-brand">
        <div className="brand-icon-wrapper">
          <Flame className="brand-flame-icon" size={18} />
        </div>
        <div className="brand-text">
          <span className="brand-title">Fire Detection Studio</span>
          <span className="brand-subtitle">AI Fire Detection Workbench</span>
        </div>
      </div>

      {/* Status Indicators & Controls */}
      <div className="header-status-group">
        {/* 1. Chỉ báo kết nối Backend */}
        <div
          className="indicator-pill"
          title={
            isConnected
              ? 'Backend API đang phản hồi tốt (http://localhost:8000)'
              : 'Không thể kết nối đến máy chủ backend.'
          }
        >
          <span
            className={`status-dot ${
              isChecking
                ? 'status-dot-checking'
                : isConnected
                ? 'status-dot-online'
                : 'status-dot-offline'
            }`}
          />
          <span>{isConnected ? 'Backend: Kết nối' : 'Backend: Ngắt kết nối'}</span>
        </div>

        {/* 2. Chỉ báo sẵn sàng và Tên Mô hình AI đang sử dụng */}
        <div
          onClick={onOpenSettings}
          style={{ cursor: 'pointer' }}
          className={`model-status-chip ${
            modelStatus?.is_ready ? 'model-chip-ready' : 'model-chip-unready'
          }`}
          title={
            modelStatus?.error_message ||
            (modelStatus?.is_ready
              ? `Đang sử dụng mô hình: ${modelStatus.model_name || modelStatus.model_path} trên thiết bị ${modelStatus.device} (Bấm để xem/đổi mô hình)`
              : 'Chưa nạp được file model checkpoint (Bấm để chọn mô hình)')
          }
        >
          <span className="model-chip-dot" />
          <span className="model-chip-label">Model:</span>
          <span className="model-chip-name">
            {modelStatus?.is_ready
              ? (modelStatus.model_name || modelStatus.model_path || 'Mô hình AI')
              : 'Chưa nạp'}
          </span>
          {modelStatus?.is_ready && (
            <span className="model-chip-device">{modelStatus.device}</span>
          )}
        </div>

        {/* 3. Công tắc chế độ Mô phỏng (chỉ bật khi người dùng chủ động chọn) */}
        <button
          type="button"
          onClick={() => onToggleMockMode(!isMockMode)}
          className={`mock-toggle-btn ${isMockMode ? 'active' : ''}`}
          title="Bật/Tắt chế độ mô phỏng mẫu cố định để kiểm tra giao diện khi chưa có checkpoint thật"
        >
          <span>Xem thử</span>
          {isMockMode && <span className="mock-tag">MÔ PHỎNG</span>}
        </button>

        {/* 4. Nút mở cài đặt */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="header-settings-btn"
          title="Thông số & cấu hình hệ thống"
        >
          <Sliders size={16} />
        </button>
      </div>
    </header>
  );
};
