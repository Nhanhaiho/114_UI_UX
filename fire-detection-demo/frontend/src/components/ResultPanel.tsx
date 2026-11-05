import React from 'react';
import {
  Flame,
  CheckCircle,
  AlertTriangle,
  Clock,
  Gauge,
  HelpCircle,
} from 'lucide-react';
import type { AnalysisState, DetectionItem } from '../types';

interface ResultPanelProps {
  analysisState: AnalysisState;
  errorMessage: string | null;
  detections: DetectionItem[];
  inferenceMs: number;
  measuredFps: number;
  isMockMode: boolean;
  highlightedIndex: number | null;
  onHoverDetection: (idx: number | null) => void;
  isVideoOrCamera: boolean;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  analysisState,
  errorMessage,
  detections,
  inferenceMs,
  measuredFps,
  isMockMode,
  highlightedIndex,
  onHoverDetection,
  isVideoOrCamera,
}) => {
  const fireCount = detections.filter(
    (d) => d.class_name.toLowerCase() === 'fire'
  ).length;
  const smokeCount = detections.filter(
    (d) => d.class_name.toLowerCase() === 'smoke'
  ).length;
  const totalCount = detections.length;

  const getSuccessTitle = () => {
    if (fireCount > 0 && smokeCount > 0) {
      return `Phát hiện ${fireCount} vùng lửa, ${smokeCount} vùng khói`;
    }
    if (fireCount > 0) {
      return `Phát hiện ${fireCount} vùng lửa`;
    }
    if (smokeCount > 0) {
      return `Phát hiện ${smokeCount} vùng khói`;
    }
    return `Phát hiện ${totalCount} mục tiêu`;
  };

  return (
    <aside className="result-panel">
      {/* Tiêu đề Panel */}
      <div className="panel-header">
        <span className="panel-title">Kết quả phân tích</span>
        {isMockMode && <span className="mock-badge-indicator">MÔ PHỎNG</span>}
      </div>

      {/* Thẻ Trạng thái Chính cho Nguồn Hiện tại */}
      <div className="status-card-container">
        {analysisState === 'idle' && (
          <div className="status-card status-card-idle">
            <HelpCircle size={18} className="text-slate-400" />
            <div>
              <div className="status-card-title">Chưa phân tích</div>
              <div className="status-card-desc">Bấm 'Phát hiện lửa' hoặc bật nhận diện media.</div>
            </div>
          </div>
        )}

        {analysisState === 'analyzing' && (
          <div className="status-card status-card-analyzing">
            <div className="status-spinner" />
            <div>
              <div className="status-card-title">Đang suy luận...</div>
              <div className="status-card-desc">Gửi frame đến mô hình YOLO-SRC</div>
            </div>
          </div>
        )}

        {analysisState === 'success' && totalCount > 0 && (
          <div className="status-card status-card-fire">
            <Flame size={20} className={fireCount > 0 ? "text-red-500" : "text-cyan-400"} />
            <div>
              <div className="status-card-title text-red-400">
                {getSuccessTitle()}
              </div>
              <div className="status-card-desc">
                {isMockMode
                  ? 'Dữ liệu mẫu từ chế độ mô phỏng'
                  : 'Phát hiện theo ngưỡng tin cậy đã chọn'}
              </div>
            </div>
          </div>
        )}

        {analysisState === 'empty' && (
          <div className="status-card status-card-safe">
            <CheckCircle size={18} className="text-emerald-500" />
            <div>
              <div className="status-card-title text-emerald-400">Không phát hiện lửa</div>
              <div className="status-card-desc">Không có đối tượng vượt ngưỡng tin cậy hiện tại.</div>
            </div>
          </div>
        )}

        {analysisState === 'error' && (
          <div className="status-card status-card-error">
            <AlertTriangle size={18} className="text-rose-500" />
            <div>
              <div className="status-card-title text-rose-400">Lỗi phân tích</div>
              <div className="status-card-desc">{errorMessage || 'Không thể hoàn thành suy luận.'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Thông số đo thực tế từ nguồn hiện tại */}
      <div className="telemetry-grid">
        <div className="telemetry-item">
          <div className="telemetry-label">
            <Clock size={12} />
            <span>Thời gian suy luận</span>
          </div>
          <div className="telemetry-value">
            {inferenceMs > 0 ? `${inferenceMs.toFixed(1)} ms` : '—'}
          </div>
        </div>

        {isVideoOrCamera && (
          <div className="telemetry-item">
            <div className="telemetry-label">
              <Gauge size={12} />
              <span>FPS xử lý</span>
            </div>
            <div className="telemetry-value">
              {measuredFps > 0 ? `${measuredFps.toFixed(1)} fps` : '—'}
            </div>
          </div>
        )}
      </div>

      {/* Danh sách Bounding Box trong frame đang xem */}
      <div className="detection-list-section">
        <div className="section-subtitle">
          <span>Vùng phát hiện ({detections.length})</span>
        </div>

        {detections.length === 0 ? (
          <div className="empty-list-note">Chưa có phát hiện nào trên frame này.</div>
        ) : (
          <div className="detection-items-container">
            {detections.map((det, index) => {
              const isHighlight = highlightedIndex === index;
              const percent = (det.confidence * 100).toFixed(1);
              const isSmoke = det.class_name.toLowerCase() === 'smoke';
              const labelVi = det.class_name.toLowerCase() === 'fire' ? 'Lửa' : isSmoke ? 'Khói' : det.class_name;
              return (
                <div
                  key={index}
                  className={`detection-row ${isHighlight ? 'highlighted' : ''}`}
                  onMouseEnter={() => onHoverDetection(index)}
                  onMouseLeave={() => onHoverDetection(null)}
                >
                  <div className="detection-row-left">
                    <span className={`detection-color-dot ${isSmoke ? 'dot-smoke' : 'dot-fire'}`} />
                    <span className="detection-name">{labelVi}</span>
                  </div>
                  <div className="detection-conf-badge">{percent}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chú thích khách quan khoa học */}
      <div className="disclaimer-note">
        * Lưu ý: Số lượng bounding box phản ánh các vùng ứng viên phát hiện được trên frame, không đại diện cho số lượng đám cháy độc lập thực tế.
      </div>
    </aside>
  );
};
