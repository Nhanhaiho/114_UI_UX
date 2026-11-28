import React from 'react';
import {
  Flame,
  Eye,
  EyeOff,
  Maximize2,
  FolderOpen,
  Camera,
  CameraOff,
  FlipHorizontal,
  RotateCcw,
} from 'lucide-react';
import type { SourceType } from '../types';

interface ToolbarProps {
  sourceType: SourceType;

  // AI & Visual Overlays
  isDetectionActive: boolean;
  onToggleDetectionActive: (val: boolean) => void;
  showBoxes: boolean;
  onToggleShowBoxes: () => void;
  confidenceThreshold: number;
  onChangeConfidence: (val: number) => void;

  // Image actions
  onReinferImage?: () => void;
  hasImage?: boolean;
  isAnalyzing?: boolean;
  onChangeImageFile?: () => void;

  // Video actions
  playbackRate?: number;
  onChangePlaybackRate?: (rate: number) => void;
  onChangeVideoFile?: () => void;

  // Camera actions
  isCameraActive?: boolean;
  onStartCamera?: () => void;
  onStopCamera?: () => void;
  isMirrored?: boolean;
  onToggleMirror?: () => void;
  cameraDevices?: MediaDeviceInfo[];
  selectedDeviceId?: string;
  onSelectDeviceId?: (id: string) => void;

  // Fullscreen
  onToggleFullscreen: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  sourceType,
  isDetectionActive,
  onToggleDetectionActive,
  showBoxes,
  onToggleShowBoxes,
  confidenceThreshold,
  onChangeConfidence,
  onReinferImage,
  hasImage = true,
  isAnalyzing,
  onChangeImageFile,
  playbackRate = 1.0,
  onChangePlaybackRate,
  onChangeVideoFile,
  isCameraActive,
  onStartCamera,
  onStopCamera,
  isMirrored,
  onToggleMirror,
  cameraDevices,
  selectedDeviceId,
  onSelectDeviceId,
  onToggleFullscreen,
}) => {
  return (
    <div className="editorial-toolbar" role="toolbar" aria-label="Thanh điều khiển AI và Media">
      {/* NHÓM 1: CÁC NÚT ĐẶC THÙ THEO NGUỒN (Trái) */}
      <div className="toolbar-section-left">
        {/* Nguồn ẢNH */}
        {sourceType === 'image' && (
          <>
            <button
              type="button"
              className="toolbar-btn primary-action"
              onClick={onReinferImage}
              disabled={isAnalyzing || !hasImage}
              title="Phân tích lại ảnh hiện tại với mô hình hoặc ngưỡng đã chọn"
            >
              <RotateCcw size={14} className={isAnalyzing ? 'animate-spin' : ''} />
              <span>{isAnalyzing ? 'Đang suy luận...' : 'Phân tích lại'}</span>
            </button>

            {onChangeImageFile && (
              <button
                type="button"
                className="toolbar-btn subtle"
                onClick={onChangeImageFile}
                title="Chọn một tệp hình ảnh khác từ máy tính"
              >
                <FolderOpen size={14} />
                <span>Đổi ảnh</span>
              </button>
            )}
          </>
        )}

        {/* Nguồn VIDEO */}
        {sourceType === 'video' && (
          <>
            {/* Đổi tốc độ phát (không trùng với trình phát native) */}
            {onChangePlaybackRate && (
              <div className="toolbar-control-wrap" title="Tốc độ phát video">
                <span className="control-sublabel">Tốc độ:</span>
                <select
                  value={playbackRate}
                  onChange={(e) => onChangePlaybackRate(parseFloat(e.target.value))}
                  className="toolbar-select-inline"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                </select>
              </div>
            )}

            {onChangeVideoFile && (
              <button
                type="button"
                className="toolbar-btn subtle"
                onClick={onChangeVideoFile}
                title="Chọn một tệp video khác từ máy tính"
              >
                <FolderOpen size={14} />
                <span>Đổi video</span>
              </button>
            )}
          </>
        )}

        {/* Nguồn WEBCAM */}
        {sourceType === 'camera' && (
          <>
            {/* Nút Bật/Tắt Camera (riêng biệt với nhận diện AI) */}
            {isCameraActive ? (
              <button
                type="button"
                className="toolbar-btn danger"
                onClick={onStopCamera}
                title="Tắt luồng webcam máy tính"
              >
                <CameraOff size={14} />
                <span>Tắt Camera</span>
              </button>
            ) : (
              <button
                type="button"
                className="toolbar-btn primary-action"
                onClick={onStartCamera}
                title="Bật webcam máy tính"
              >
                <Camera size={14} />
                <span>Mở Camera</span>
              </button>
            )}

            {/* Lật gương */}
            {onToggleMirror && (
              <button
                type="button"
                className={`toolbar-btn ${isMirrored ? 'active-pill' : 'subtle'}`}
                onClick={onToggleMirror}
                title="Lật gương hình ảnh webcam"
              >
                <FlipHorizontal size={14} />
                <span>Lật gương</span>
              </button>
            )}

            {/* Chọn thiết bị camera nếu có nhiều camera */}
            {cameraDevices && cameraDevices.length > 1 && (
              <select
                value={selectedDeviceId}
                onChange={(e) => onSelectDeviceId?.(e.target.value)}
                className="toolbar-select-inline"
                title="Chọn thiết bị camera"
              >
                {cameraDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      {/* NHÓM 2: ĐIỀU KHIỂN AI & LỚP HIỂN THỊ CHUNG (Phải) */}
      <div className="toolbar-section-right">
        {/* Nút BẬT/TẮT NHẬN DIỆN AI (áp dụng cho Video và Camera) */}
        {(sourceType === 'video' || sourceType === 'camera') && (
          <button
            type="button"
            className={`toolbar-ai-toggle ${isDetectionActive ? 'active' : 'inactive'}`}
            onClick={() => onToggleDetectionActive(!isDetectionActive)}
            title="Bật/Tắt gửi khung hình lên mô hình AI (Video/Camera vẫn phát độc lập)"
          >
            <Flame size={14} className={isDetectionActive ? 'text-amber-500 fill-amber-500' : 'text-stone-400'} />
            <span>{isDetectionActive ? 'Nhận diện: BẬT' : 'Nhận diện: TẮT'}</span>
          </button>
        )}

        {/* Nút ẨN/HIỆN BOUNDING BOX */}
        <button
          type="button"
          className={`toolbar-btn ${showBoxes ? 'active-pill' : 'subtle'}`}
          onClick={onToggleShowBoxes}
          title="Ẩn hoặc hiện các khung Bounding Box trên màn hình"
        >
          {showBoxes ? <Eye size={14} /> : <EyeOff size={14} />}
          <span>{showBoxes ? 'Hiện Box' : 'Ẩn Box'}</span>
        </button>

        {/* THANH TRƯỢT NGƯỠNG TIN CẬY (Confidence Threshold) */}
        <div className="toolbar-confidence-control" title="Điều chỉnh ngưỡng lọc độ tin cậy của mô hình">
          <span className="conf-label">
            Ngưỡng: <strong>{Math.round(confidenceThreshold * 100)}%</strong>
          </span>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={confidenceThreshold}
            onChange={(e) => onChangeConfidence(parseFloat(e.target.value))}
            className="toolbar-conf-slider"
            aria-label="Ngưỡng lọc độ tin cậy"
          />
        </div>

        {/* NÚT TOÀN MÀN HÌNH */}
        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={onToggleFullscreen}
          title="Phóng to toàn màn hình vùng xem"
          aria-label="Toàn màn hình"
        >
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
};
