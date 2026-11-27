import React from 'react';
import { Flame, Settings, ChevronDown, User, LogOut } from 'lucide-react';
import type { ModelStatus, UserProfile } from '../types';
import { getShortModelName } from '../utils/modelUtils';

interface HeaderProps {
  isConnected: boolean;
  isChecking: boolean;
  modelStatus: ModelStatus | null;
  isMockMode: boolean;
  onToggleMockMode: (val: boolean) => void;
  onOpenSettings: () => void;
  user?: UserProfile | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  isChecking,
  modelStatus,
  isMockMode,
  onToggleMockMode,
  onOpenSettings,
  user,
  onOpenAuth,
  onSignOut,
}) => {
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
            className={`conn-dot ${
              isChecking ? 'checking' : isConnected ? 'online' : 'offline'
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

        {/* 3. Đăng nhập / Tài khoản */}
        {user ? (
          <div className="editorial-user-pill" title={`Đã đăng nhập: ${user.email}`}>
            <span className="user-dot online" />
            <span className="user-email">{user.email}</span>
            {onSignOut && (
              <button
                type="button"
                className="editorial-signout-mini-btn"
                onClick={onSignOut}
                title="Đăng xuất tài khoản"
                aria-label="Đăng xuất"
              >
                <LogOut size={13} />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="editorial-auth-btn"
            title="Đăng nhập để nhận cảnh báo lửa qua email"
            aria-label="Đăng nhập"
          >
            <User size={14} />
            <span>Đăng nhập</span>
          </button>
        )}

        <span className="editorial-divider">|</span>

        {/* 4. Nút cài đặt (icon Gear) */}
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
