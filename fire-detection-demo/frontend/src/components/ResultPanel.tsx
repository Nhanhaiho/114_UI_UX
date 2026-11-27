import React, { useRef } from 'react';
import {
  FolderOpen,
  Camera,
  CameraOff,
  Flame,
  Wind,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { SourceType, AnalysisState, DetectionItem, ModelStatus, FireAlertEvent } from '../types';
import { getShortModelName } from '../utils/modelUtils';

interface ResultPanelProps {
  sourceType: SourceType;
  analysisState: AnalysisState;
  errorMessage: string | null;
  detections: DetectionItem[];
  inferenceMs: number;
  measuredFps: number;
  isMockMode: boolean;
  highlightedIndex: number | null;
  onHoverDetection: (idx: number | null) => void;
  modelStatus: ModelStatus | null;
  isDetectionActive: boolean;
  isPlaying?: boolean;
  isCameraActive?: boolean;
  confidenceThreshold?: number;
  alerts?: FireAlertEvent[];

  // File uploads
  onSelectImageFile: (file: File) => void;
  onSelectVideoFile: (file: File) => void;

  // Sample actions
  onSelectSample: (type: 'fire_smoke' | 'neutral') => void;
  onAnalyzeCurrentSample: () => void;
  activeSample: 'fire_smoke' | 'neutral' | 'custom';
  isSampleAnalyzed: boolean;

  // Video / Camera actions
  onLoadSampleVideo?: () => void;
  onStartCamera?: () => void;
  onStopCamera?: () => void;
  cameraDevices?: MediaDeviceInfo[];
  selectedDeviceId?: string;
  onSelectDeviceId?: (id: string) => void;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  sourceType,
  analysisState,
  errorMessage,
  detections,
  inferenceMs,
  measuredFps,
  isMockMode,
  highlightedIndex,
  onHoverDetection,
  modelStatus,
  isDetectionActive,
  isPlaying = false,
  isCameraActive = false,
  alerts = [],
  onSelectImageFile,
  onSelectVideoFile,
  onSelectSample,
  onAnalyzeCurrentSample,
  activeSample,
  isSampleAnalyzed,
  onLoadSampleVideo,
  onStartCamera,
  onStopCamera,
  cameraDevices,
  selectedDeviceId,
  onSelectDeviceId,
}) => {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const fireDetections = detections.filter(
    (d) => d.class_name.toLowerCase() === 'fire'
  );
  const smokeDetections = detections.filter(
    (d) => d.class_name.toLowerCase() === 'smoke'
  );

  const getSummaryHeading = () => {
    if (fireDetections.length > 0 && smokeDetections.length > 0) {
      return `Phát hiện ${fireDetections.length} vùng lửa, ${smokeDetections.length} vùng khói`;
    }
    if (fireDetections.length > 0) {
      return `Phát hiện ${fireDetections.length} vùng lửa`;
    }
    if (smokeDetections.length > 0) {
      return `Phát hiện ${smokeDetections.length} vùng khói`;
    }
    if (detections.length > 0) {
      return `Phát hiện ${detections.length} mục tiêu`;
    }
    return 'Khung hình này chưa có vùng vượt ngưỡng';
  };

  const renderStatusOrResults = () => {
    // 1. Lỗi
    if (analysisState === 'error') {
      return (
        <div className="editorial-status-error">
          <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <div className="error-content">
            <span className="error-title">Không thể hoàn tất phân tích</span>
            <p className="error-desc">{errorMessage || 'Lỗi kết nối máy chủ suy luận'}</p>
          </div>
        </div>
      );
    }

    // 2. Tab VIDEO
    if (sourceType === 'video') {
      if (!isDetectionActive) {
        return <p className="editorial-status-idle">Nhận diện đang tắt</p>;
      }
      if (!isPlaying && analysisState === 'idle' && detections.length === 0) {
        return <p className="editorial-status-idle">Phát video để bắt đầu nhận diện</p>;
      }
      if (analysisState === 'analyzing' && detections.length === 0) {
        return (
          <div className="editorial-status-analyzing">
            <Loader2 size={16} className="animate-spin text-amber-600" />
            <span>Đang nhận diện khung hình...</span>
          </div>
        );
      }
      if ((analysisState === 'empty' || analysisState === 'success') && detections.length === 0) {
        return <p className="editorial-status-idle">Khung hình này chưa có vùng vượt ngưỡng</p>;
      }
    }

    // 3. Tab CAMERA
    if (sourceType === 'camera') {
      if (!isCameraActive) {
        return (
          <p className="editorial-status-idle">
            Camera chưa được bật. Bấm "Mở Camera" để bắt đầu.
          </p>
        );
      }
      if (!isDetectionActive) {
        return <p className="editorial-status-idle">Nhận diện đang tắt</p>;
      }
      if (analysisState === 'analyzing' && detections.length === 0) {
        return (
          <div className="editorial-status-analyzing">
            <Loader2 size={16} className="animate-spin text-amber-600" />
            <span>Đang nhận diện khung hình trực tiếp...</span>
          </div>
        );
      }
      if ((analysisState === 'empty' || analysisState === 'success') && detections.length === 0) {
        return <p className="editorial-status-idle">Khung hình này chưa có vùng vượt ngưỡng</p>;
      }
    }

    // 4. Tab ẢNH (khi chưa chạy hoặc không có kết quả)
    if (sourceType === 'image') {
      if (analysisState === 'idle' && detections.length === 0) {
        return (
          <p className="editorial-status-idle">
            Chọn ảnh hoặc chạy mẫu để xem kết quả.
          </p>
        );
      }
      if (analysisState === 'analyzing') {
        return (
          <div className="editorial-status-analyzing">
            <Loader2 size={16} className="animate-spin text-amber-600" />
            <span>Đang suy luận với mô hình {getShortModelName(modelStatus)}...</span>
          </div>
        );
      }
      if (analysisState === 'empty' && detections.length === 0) {
        return (
          <div className="empty-results-box">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>Khung hình này chưa có vùng vượt ngưỡng</span>
          </div>
        );
      }
    }

    // 5. Khi CÓ KẾT QUẢ VÙNG NHẬN DIỆN (> 0 mục tiêu)
    if (detections.length > 0) {
      return (
        <div className="editorial-results-container">
          <div className="results-summary-card">
            <div className="summary-heading-row">
              <span className="summary-title">{getSummaryHeading()}</span>
              {isMockMode ? (
                <span className="origin-badge badge-mock" title="Dữ liệu mẫu mô phỏng">
                  Mô phỏng
                </span>
              ) : (
                <span className="origin-badge badge-real" title="Suy luận từ mô hình AI thật">
                  Model thật: {getShortModelName(modelStatus)}
                </span>
              )}
            </div>

            <div className="summary-metrics-row">
              <span className="metric-chip">
                <Clock size={13} className="text-stone-500" />
                <span>Thời gian xử lý: <strong>{inferenceMs.toFixed(0)} ms</strong></span>
              </span>
              {sourceType !== 'image' && measuredFps > 0 && (
                <span className="metric-chip">
                  <span>Tốc độ: <strong>{measuredFps.toFixed(1)} fps</strong></span>
                </span>
              )}
            </div>
          </div>

          <div className="detection-regions-list" role="list">
            {detections.map((det, idx) => {
              const isFire = det.class_name.toLowerCase() === 'fire';
              const isHighlighted = highlightedIndex === idx;

              return (
                <div
                  key={`det-${idx}-${det.class_name}-${det.confidence}`}
                  className={`detection-region-item ${isHighlighted ? 'highlighted' : ''}`}
                  onMouseEnter={() => onHoverDetection(idx)}
                  onMouseLeave={() => onHoverDetection(null)}
                  role="listitem"
                  tabIndex={0}
                >
                  <div className="region-class-group">
                    <span className={`class-indicator-pill ${isFire ? 'pill-fire' : 'pill-smoke'}`}>
                      {isFire ? <Flame size={12} /> : <Wind size={12} />}
                      <span>{isFire ? 'Lửa' : 'Khói'}</span>
                    </span>
                    <span className="region-index-label">Vùng #{idx + 1}</span>
                  </div>

                  <div className="region-confidence-group">
                    <span className="confidence-label">Độ tin cậy:</span>
                    <span className="confidence-value">
                      {(det.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <p className="editorial-status-idle">
        Chọn ảnh hoặc chạy mẫu để xem kết quả.
      </p>
    );
  };

  return (
    <aside className="editorial-sidebar">
      {/* =========================================================================
          SECTION 1: NGUỒN MEDIA (Ảnh, Video, Camera)
         ========================================================================= */}
      <section className="editorial-section">
        {sourceType === 'image' && (
          <>
            <h2 className="editorial-section-title">Nguồn ảnh</h2>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onSelectImageFile(e.target.files[0]);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              className="editorial-primary-btn"
              onClick={() => imageInputRef.current?.click()}
            >
              <FolderOpen size={18} />
              <span>Chọn ảnh từ máy</span>
            </button>
            <div className="editorial-btn-subtext">hoặc kéo ảnh vào đây</div>
          </>
        )}

        {sourceType === 'video' && (
          <>
            <h2 className="editorial-section-title">Nguồn video</h2>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onSelectVideoFile(e.target.files[0]);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              className="editorial-primary-btn"
              onClick={() => videoInputRef.current?.click()}
            >
              <FolderOpen size={18} />
              <span>Chọn video từ máy</span>
            </button>
            <div className="editorial-btn-subtext">hoặc kéo video vào đây (MP4, WebM)</div>
          </>
        )}

        {sourceType === 'camera' && (
          <>
            <h2 className="editorial-section-title">Nguồn camera</h2>
            {isCameraActive ? (
              <button
                type="button"
                className="editorial-secondary-btn"
                onClick={onStopCamera}
              >
                <CameraOff size={18} />
                <span>Tắt Camera</span>
              </button>
            ) : (
              <button
                type="button"
                className="editorial-primary-btn"
                onClick={onStartCamera}
              >
                <Camera size={18} />
                <span>Mở Camera</span>
              </button>
            )}
            <div className="editorial-btn-subtext">Quan sát khói lửa thời gian thực</div>

            {cameraDevices && cameraDevices.length > 1 && (
              <div style={{ marginTop: '12px' }}>
                <select
                  className="editorial-select"
                  value={selectedDeviceId}
                  onChange={(e) => onSelectDeviceId?.(e.target.value)}
                  title="Chọn thiết bị camera đầu vào"
                >
                  {cameraDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </section>

      <div className="editorial-divider-line" />

      {/* =========================================================================
          SECTION 2: MẪU THỬ (Sample Trials)
         ========================================================================= */}
      <section className="editorial-section">
        {sourceType === 'image' && (
          <>
            <h2 className="editorial-section-title">Mẫu thử</h2>
            <div className="editorial-thumbnail-grid">
              {/* Thumbnail 1: Có lửa hoặc khói */}
              <button
                type="button"
                className={`editorial-thumb-card ${activeSample === 'fire_smoke' ? 'active' : ''}`}
                onClick={() => onSelectSample('fire_smoke')}
                title="Bấm để nạp và tự động nhận diện ảnh khói cháy rừng"
              >
                <div className="editorial-thumb-img-wrap">
                  <img
                    src="/samples/sample_fire_smoke.jpg"
                    alt="Mẫu có khói và lửa rừng"
                    className="editorial-thumb-img"
                  />
                </div>
                <span className="editorial-thumb-caption">Có lửa hoặc khói</span>
              </button>

              {/* Thumbnail 2: Cảnh bình thường */}
              <button
                type="button"
                className={`editorial-thumb-card ${activeSample === 'neutral' ? 'active' : ''}`}
                onClick={() => onSelectSample('neutral')}
                title="Bấm để nạp và tự động nhận diện ảnh rừng bình thường"
              >
                <div className="editorial-thumb-img-wrap">
                  <img
                    src="/samples/sample_neutral.jpg"
                    alt="Mẫu cảnh rừng bình thường"
                    className="editorial-thumb-img"
                  />
                </div>
                <span className="editorial-thumb-caption">Cảnh bình thường</span>
              </button>
            </div>

            {/* Nút Phân tích / Phân tích lại ảnh mẫu */}
            <button
              type="button"
              className="editorial-outline-btn"
              onClick={onAnalyzeCurrentSample}
              disabled={analysisState === 'analyzing'}
              title="Phân tích hoặc phân tích lại ảnh hiện tại với model và ngưỡng mới"
            >
              {analysisState === 'analyzing' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Đang phân tích...</span>
                </>
              ) : isSampleAnalyzed ? (
                <>
                  <RotateCcw size={15} />
                  <span>Phân tích lại ảnh mẫu</span>
                </>
              ) : (
                'Phân tích ảnh mẫu'
              )}
            </button>
          </>
        )}

        {sourceType === 'video' && (
          <>
            <h2 className="editorial-section-title">Mẫu thử</h2>
            <div className="editorial-thumbnail-grid single">
              <button
                type="button"
                className="editorial-thumb-card active"
                onClick={onLoadSampleVideo}
                title="Bấm để nạp video khói lửa thử nghiệm"
              >
                <div className="editorial-thumb-img-wrap video-wrap">
                  <img
                    src="/samples/sample_fire_smoke.jpg"
                    alt="Video mẫu"
                    className="editorial-thumb-img"
                  />
                  <div className="video-thumb-overlay">
                    <Play size={20} className="fill-white text-white" />
                  </div>
                </div>
                <span className="editorial-thumb-caption">Video mẫu khói cháy rừng</span>
              </button>
            </div>
            {onLoadSampleVideo && (
              <button
                type="button"
                className="editorial-outline-btn"
                onClick={onLoadSampleVideo}
                title="Nạp video mẫu để kiểm tra nhận diện"
              >
                Nạp video mẫu
              </button>
            )}
          </>
        )}

        {sourceType === 'camera' && (
          <>
            <h2 className="editorial-section-title">Thông số camera</h2>
            <div className="editorial-camera-meta">
              <div className="meta-row">
                <span className="meta-label">Trạng thái AI:</span>
                <span className="meta-value" style={{ color: isDetectionActive ? '#c2410c' : '#78716c' }}>
                  {isDetectionActive ? 'Đang nhận diện' : 'Đã tạm tắt'}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">FPS đo được:</span>
                <span className="meta-value">{measuredFps.toFixed(1)} fps</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Độ trễ xử lý:</span>
                <span className="meta-value">{inferenceMs.toFixed(0)} ms</span>
              </div>
            </div>
          </>
        )}
      </section>

      <div className="editorial-divider-line" />

      {/* =========================================================================
          SECTION 3: KẾT QUẢ (Dynamic Results per Tab & State)
         ========================================================================= */}
      <section className="editorial-section editorial-results-section">
        <h2 className="editorial-section-title">Kết quả</h2>
        {renderStatusOrResults()}
      </section>

      {/* =========================================================================
          SECTION 4: CẢNH BÁO TRONG PHIÊN (Session Fire Alerts)
         ========================================================================= */}
      {(sourceType === 'video' || sourceType === 'camera' || alerts.length > 0) && (
        <>
          <div className="editorial-divider-line" />
          <section className="editorial-section editorial-alerts-section">
            <div className="editorial-section-header-row">
              <h2 className="editorial-section-title">Cảnh báo trong phiên</h2>
              {alerts.length > 0 && (
                <span className="alerts-count-badge">
                  {alerts.length}
                </span>
              )}
            </div>

            {alerts.length === 0 ? (
              <p className="editorial-status-idle">
                Chưa ghi nhận cảnh báo lửa trong phiên quan sát.
              </p>
            ) : (
              <div className="editorial-session-alerts-list" role="list">
                {alerts.map((alt) => (
                  <div
                    key={alt.id}
                    className={`session-alert-card ${alt.isActive ? 'active' : 'ended'}`}
                    role="listitem"
                  >
                    <div className="session-alert-header">
                      <div className="session-alert-title-wrap">
                        <Flame
                          size={15}
                          className={alt.isActive ? 'alert-flame-active animate-pulse' : 'alert-flame-ended'}
                        />
                        <span className="session-alert-title">
                          Phát hiện lửa · {alt.formattedTime}
                        </span>
                      </div>
                      <span className={`status-pill ${alt.isActive ? 'pill-active' : 'pill-ended'}`}>
                        {alt.isActive ? 'Đang diễn ra' : 'Đã kết thúc'}
                      </span>
                    </div>

                    <div className="session-alert-meta-row">
                      <span>Độ tin cậy cao nhất: <strong>{Math.round(alt.maxConfidence * 100)}%</strong></span>
                      <div className="alert-meta-badges">
                        {alt.isMock ? (
                          <span className="origin-badge badge-mock">
                            Cảnh báo mô phỏng
                          </span>
                        ) : (
                          <span className="origin-badge badge-real">
                            Xác nhận AI
                          </span>
                        )}

                        {alt.emailDispatchStatus && (
                          <span
                            className={`dispatch-badge ${
                              alt.emailDispatchStatus === 'sent' && alt.emailDispatchMode === 'mock'
                                ? 'badge-mock'
                                : `badge-${alt.emailDispatchStatus}`
                            }`}
                            title={
                              alt.emailDispatchStatus === 'failed'
                                ? alt.emailDispatchError || 'Gửi thư thất bại'
                                : alt.emailDispatchStatus === 'sent' && alt.emailDispatchMode === 'mock'
                                ? 'Đã mô phỏng gửi email (SMTP Mock)'
                                : alt.emailDispatchStatus === 'sent'
                                ? 'Máy chủ email đã chấp nhận thư'
                                : 'Đang chờ gửi qua máy chủ email...'
                            }
                          >
                            {alt.emailDispatchStatus === 'pending' && (
                              <>
                                <Loader2 size={10} className="animate-spin" />
                                <span>Đang chờ gửi</span>
                              </>
                            )}
                            {alt.emailDispatchStatus === 'sent' && alt.emailDispatchMode === 'mock' && (
                              <>
                                <Check size={11} />
                                <span>Đã mô phỏng gửi email</span>
                              </>
                            )}
                            {alt.emailDispatchStatus === 'sent' && alt.emailDispatchMode !== 'mock' && (
                              <>
                                <Check size={11} />
                                <span>Máy chủ email đã chấp nhận thư</span>
                              </>
                            )}
                            {alt.emailDispatchStatus === 'failed' && (
                              <>
                                <AlertCircle size={11} />
                                <span>Gửi lỗi</span>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {alt.emailDispatchStatus === 'failed' && alt.emailDispatchError && (
                      <div className="session-alert-error-note">
                        {alt.emailDispatchError}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </aside>
  );
};
