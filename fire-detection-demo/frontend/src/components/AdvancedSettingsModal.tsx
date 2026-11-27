import React, { useState, useEffect } from 'react';
import { X, Cpu, Server, Sliders, CheckCircle, AlertCircle, RefreshCw, Sparkles, Mail, Send, Check, LogIn, LogOut, Info } from 'lucide-react';
import type { ModelStatus, BackendHealth, UserProfile, UserEmailPreferences, TestEmailFeedback } from '../types';
import { getAvailableModels, switchModel, type ModelListItem } from '../services/api';

interface AdvancedSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelStatus: ModelStatus | null;
  health: BackendHealth | null;
  confidenceThreshold: number;
  onChangeConfidence: (val: number) => void;
  targetFps: number;
  onChangeTargetFps: (fps: number) => void;
  timestampToleranceMs: number;
  onChangeTolerance: (ms: number) => void;
  showLabels: boolean;
  onToggleShowLabels: () => void;
  onRefreshStatus?: () => void;
  isMockMode: boolean;
  onToggleMockMode: (val: boolean) => void;
  user?: UserProfile | null;
  userPreferences?: UserEmailPreferences | null;
  onToggleEmailAlerts?: (enabled: boolean) => void;
  onSendTestEmail?: () => Promise<void>;
  onSignOut?: () => void;
  onOpenAuth?: () => void;
  testEmailCooldown?: number;
  isSendingTestEmail?: boolean;
  testEmailFeedback?: TestEmailFeedback | null;
}

export const AdvancedSettingsModal: React.FC<AdvancedSettingsModalProps> = ({
  isOpen,
  onClose,
  modelStatus,
  health,
  confidenceThreshold,
  onChangeConfidence,
  targetFps,
  onChangeTargetFps,
  timestampToleranceMs,
  onChangeTolerance,
  showLabels,
  onToggleShowLabels,
  onRefreshStatus,
  isMockMode,
  onToggleMockMode,
  user,
  userPreferences,
  onToggleEmailAlerts,
  onSendTestEmail,
  onSignOut,
  onOpenAuth,
  testEmailCooldown = 0,
  isSendingTestEmail = false,
  testEmailFeedback = null,
}) => {
  const [modelList, setModelList] = useState<ModelListItem[]>([]);
  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const [switchFeedback, setSwitchFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void getAvailableModels()
        .then((res) => setModelList(res.models))
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelectModel = async (modelPath: string) => {
    setIsSwitching(true);
    setSwitchFeedback('Đang nạp mô hình vào bộ nhớ...');
    try {
      await switchModel(modelPath);
      setSwitchFeedback('Chuyển đổi mô hình thành công!');
      if (onRefreshStatus) onRefreshStatus();
      setTimeout(() => setSwitchFeedback(null), 3000);
    } catch (err: any) {
      setSwitchFeedback(`Lỗi: ${err.message || 'Không thể đổi model'}`);
    } finally {
      setIsSwitching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <Sliders size={20} className="text-amber-500" />
            <h3 id="modal-settings-title" className="modal-title">Thông số & Cấu hình Kỹ thuật</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-subtle-btn"
            aria-label="Đóng bảng cài đặt"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Nhóm 1: Thông tin Mô hình Backend */}
          <div className="settings-section">
            <h4 className="settings-section-title">
              <Cpu size={16} />
              <span>Trạng thái Mô hình & Phần cứng</span>
            </h4>
            <div className="info-kv-grid">
              <div className="info-kv-row">
                <span className="info-key">Trạng thái nạp:</span>
                <span className="info-val">
                  {modelStatus?.is_ready ? (
                    <span className="text-emerald-500 flex items-center gap-1">
                      <CheckCircle size={14} /> Sẵn sàng suy luận
                    </span>
                  ) : (
                    <span className="text-amber-500 flex items-center gap-1">
                      <AlertCircle size={14} /> Chưa nạp checkpoint
                    </span>
                  )}
                </span>
              </div>
              <div className="info-kv-row">
                <span className="info-key">Thiết bị tính toán:</span>
                <span className="info-val font-mono">{modelStatus?.device || 'cpu'}</span>
              </div>
              <div className="info-kv-row">
                <span className="info-key">Kích thước ảnh chuẩn (imgsz):</span>
                <span className="info-val font-mono">{modelStatus?.imgsz || 640} px</span>
              </div>
              <div className="info-kv-row">
                <span className="info-key">Đường dẫn trọng số:</span>
                <span className="info-val font-mono text-xs">{modelStatus?.model_path || 'weights/best.pt'}</span>
              </div>
              <div className="info-kv-row">
                <span className="info-key">Thời gian máy chủ chạy:</span>
                <span className="info-val font-mono">{health?.uptime_seconds ? `${Math.round(health.uptime_seconds)}s` : '--'}</span>
              </div>
            </div>

            {/* Chuyển đổi mô hình nhanh */}
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  Đổi sang checkpoint khác ({modelList.length} weights có sẵn):
                </span>
                {isSwitching && (
                  <span style={{ fontSize: '12px', color: '#f97316', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <RefreshCw size={12} className="animate-spin" /> Đang nạp...
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                {modelList.map((m) => {
                  const isCurrent = modelStatus?.model_path?.toLowerCase().includes(m.filename.toLowerCase());
                  return (
                    <button
                      key={m.filename}
                      type="button"
                      disabled={isSwitching || isCurrent}
                      onClick={() => handleSelectModel(m.path)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 12px',
                        borderRadius: '6px',
                        border: isCurrent ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                        background: isCurrent ? '#ecfdf5' : '#ffffff',
                        cursor: isCurrent ? 'default' : 'pointer',
                        textAlign: 'left',
                        fontSize: '13px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, color: isCurrent ? '#065f46' : '#1e293b' }}>
                          {m.filename}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>({m.size_mb} MB)</span>
                      </div>
                      {isCurrent ? (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: '4px' }}>
                          Đang dùng
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#f97316', fontWeight: 500 }}>
                          Chọn model này &rarr;
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {switchFeedback && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: switchFeedback.startsWith('Lỗi') ? '#ef4444' : '#059669' }}>
                  {switchFeedback}
                </div>
              )}
            </div>

            {modelStatus?.error_message && (
              <div className="settings-note-banner">
                {modelStatus.error_message}
              </div>
            )}
          </div>

          {/* Nhóm 2: Tham số lấy mẫu và hiển thị */}
          <div className="settings-section">
            <h4 className="settings-section-title">
              <Server size={16} />
              <span>Tham số lấy mẫu & Trình hiển thị</span>
            </h4>

            {/* Ngưỡng tin cậy */}
            <div className="setting-control-item">
              <div className="setting-control-header">
                <span>Ngưỡng tin cậy nhận diện (Confidence)</span>
                <span className="font-semibold text-amber-500">
                  {Math.round(confidenceThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={confidenceThreshold}
                onChange={(e) => onChangeConfidence(parseFloat(e.target.value))}
                className="w-full accent-amber-500"
              />
              <p className="setting-hint">
                Chỉ các bounding box có độ tin cậy lớn hơn hoặc bằng giá trị này mới được hiển thị.
              </p>
            </div>

            {/* Tần số lấy mẫu Video */}
            <div className="setting-control-item">
              <div className="setting-control-header">
                <span>Tần số lấy mẫu frame Video/Webcam</span>
                <span className="font-semibold text-amber-500">{targetFps} FPS</span>
              </div>
              <div className="fps-options-group">
                {[2, 3, 4, 5, 8].map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    className={`fps-btn ${targetFps === fps ? 'active' : ''}`}
                    onClick={() => onChangeTargetFps(fps)}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
              <p className="setting-hint">
                Khoảng 3 - 5 FPS đảm bảo độ mượt của demo mà không làm tắc nghẽn hàng đợi suy luận.
              </p>
            </div>

            {/* Dung sai lệch thời gian timestamp */}
            <div className="setting-control-item">
              <div className="setting-control-header">
                <span>Dung sai độ trễ frame (Tolerance)</span>
                <span className="font-semibold text-amber-500">{timestampToleranceMs} ms</span>
              </div>
              <input
                type="range"
                min={150}
                max={600}
                step={50}
                value={timestampToleranceMs}
                onChange={(e) => onChangeTolerance(parseInt(e.target.value))}
                className="w-full accent-amber-500"
              />
              <p className="setting-hint">
                Nếu video chạy vượt quá mốc thời gian của frame quá mức dung sai này, bounding box cũ sẽ tự động ẩn để tránh hiển thị lệch hình.
              </p>
            </div>

            {/* Hiển thị nhãn trên box */}
            <div className="setting-checkbox-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={onToggleShowLabels}
                  className="checkbox-input"
                />
                <span>Hiển thị nhãn tên lớp và tỷ lệ phần trăm trên Bounding Box</span>
              </label>
            </div>
          </div>

          {/* Nhóm 3: Chế độ Kiểm thử Ngoại tuyến (Mock Data) */}
          <div className="settings-section">
            <h4 className="settings-section-title">
              <Sparkles size={16} />
              <span>Chế độ Kiểm thử Ngoại tuyến (Mock Data)</span>
            </h4>
            <div className="setting-checkbox-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isMockMode}
                  onChange={(e) => onToggleMockMode(e.target.checked)}
                  className="checkbox-input"
                />
                <span className="font-medium text-slate-800">
                  Bật dữ liệu mô phỏng cố định (Mock)
                </span>
              </label>
              <p className="setting-hint" style={{ marginTop: '4px', paddingLeft: '24px' }}>
                Chỉ nên bật khi cần kiểm thử luồng giao diện mà không có kết nối đến máy chủ AI backend.
              </p>
            </div>
          </div>

          {/* Nhóm 4: Cảnh báo qua Email (Supabase Auth & SMTP) */}
          <div className="settings-section">
            <h4 className="settings-section-title">
              <Mail size={16} />
              <span>Cảnh báo qua Email (Supabase & SMTP)</span>
            </h4>

            <div className="setting-checkbox-item">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(user && userPreferences?.email_alerts_enabled)}
                  onChange={(e) => {
                    if (!user) {
                      if (onOpenAuth) onOpenAuth();
                    } else {
                      if (onToggleEmailAlerts) onToggleEmailAlerts(e.target.checked);
                    }
                  }}
                  className="checkbox-input"
                />
                <span className="font-medium text-slate-800">
                  Nhận cảnh báo lửa qua email
                </span>
              </label>
              <p className="setting-hint" style={{ marginTop: '4px', paddingLeft: '24px' }}>
                Tự động gửi email thông báo khi phát hiện sự kiện lửa kéo dài trên Video tải lên hoặc Webcam.
              </p>
            </div>

            {user ? (
              <div className="email-account-panel">
                <div className="email-account-info-row">
                  <div className="email-info-left">
                    <span className="info-key">Hộp thư nhận cảnh báo:</span>
                    <span className="email-highlight-chip">{user.email}</span>
                  </div>
                  {onSignOut && (
                    <button
                      type="button"
                      className="email-signout-btn"
                      onClick={onSignOut}
                      title="Đăng xuất tài khoản hiện tại"
                    >
                      <LogOut size={13} />
                      <span>Đăng xuất</span>
                    </button>
                  )}
                </div>

                <div className="test-email-action-row">
                  <button
                    type="button"
                    className="test-email-btn"
                    disabled={isSendingTestEmail || (testEmailCooldown !== undefined && testEmailCooldown > 0)}
                    onClick={onSendTestEmail}
                    title="Gửi thư thử nghiệm kiểm tra kết nối SMTP độc lập với model"
                  >
                    {isSendingTestEmail ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Đang chờ gửi...</span>
                      </>
                    ) : testEmailCooldown && testEmailCooldown > 0 ? (
                      <>
                        <Send size={13} />
                        <span>Gửi lại ({testEmailCooldown}s)</span>
                      </>
                    ) : (
                      <>
                        <Send size={13} />
                        <span>Gửi email thử</span>
                      </>
                    )}
                  </button>
                  <span className="test-email-hint">
                    Kiểm tra đường gửi thư SMTP độc lập với AI model (cooldown 60s).
                  </span>
                </div>

                {testEmailFeedback && (
                  <div
                    className={`test-email-feedback ${
                      testEmailFeedback.type === 'error'
                        ? 'error'
                        : testEmailFeedback.type === 'simulated'
                        ? 'mock'
                        : testEmailFeedback.type === 'pending'
                        ? 'pending'
                        : 'success'
                    }`}
                  >
                    {testEmailFeedback.type === 'error' && (
                      <AlertCircle size={14} className="shrink-0" />
                    )}
                    {testEmailFeedback.type === 'simulated' && (
                      <Info size={14} className="shrink-0" />
                    )}
                    {testEmailFeedback.type === 'pending' && (
                      <RefreshCw size={14} className="shrink-0 animate-spin" />
                    )}
                    {testEmailFeedback.type === 'accepted' && (
                      <Check size={14} className="shrink-0" />
                    )}
                    <span>{testEmailFeedback.message}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="email-guest-callout">
                <div className="guest-callout-text">
                  Bạn đang dùng chế độ Khách. Đăng nhập để bật nhận cảnh báo qua email.
                </div>
                {onOpenAuth && (
                  <button
                    type="button"
                    className="guest-login-btn"
                    onClick={onOpenAuth}
                  >
                    <LogIn size={14} />
                    <span>Đăng nhập</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="primary-action-btn">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
