import React from 'react';
import { X, Cpu, Server, Sliders, CheckCircle, AlertCircle } from 'lucide-react';
import type { ModelStatus, BackendHealth } from '../types';

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
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Sliders size={20} className="text-amber-500" />
            <h3 className="modal-title">Thông số & Cấu hình Kỹ thuật</h3>
          </div>
          <button type="button" onClick={onClose} className="icon-subtle-btn">
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
