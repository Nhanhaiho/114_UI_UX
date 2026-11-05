import React from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Flame,
  Eye,
  EyeOff,
  FolderOpen,
  PowerOff,
  FlipHorizontal,
} from 'lucide-react';
import type { SourceType } from '../types';
import { formatTime } from '../utils/coordinateUtils';

interface ToolbarProps {
  sourceType: SourceType;
  // Image
  onInferImage: () => void;
  isAnalyzing: boolean;
  canInferImage: boolean;
  onChangeFile: () => void;

  // Video
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;

  // Camera
  onStopCamera: () => void;
  isMirrored: boolean;
  onToggleMirror: () => void;

  // Common
  isDetectionActive: boolean;
  onToggleDetectionActive: (active: boolean) => void;
  showBoxes: boolean;
  onToggleShowBoxes: () => void;
  confidenceThreshold: number;
  onChangeConfidence: (conf: number) => void;
  onToggleFullscreen: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  sourceType,
  onInferImage,
  isAnalyzing,
  canInferImage,
  onChangeFile,
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  onSeek,
  playbackRate,
  onChangePlaybackRate,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  onStopCamera,
  isMirrored,
  onToggleMirror,
  isDetectionActive,
  onToggleDetectionActive,
  showBoxes,
  onToggleShowBoxes,
  confidenceThreshold,
  onChangeConfidence,
  onToggleFullscreen,
}) => {
  return (
    <div className="media-toolbar">
      {/* 1. Timeline Seek Bar cho Video */}
      {sourceType === 'video' && (
        <div className="video-timeline-row">
          <span className="time-display">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.05}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="timeline-slider"
          />
          <span className="time-display">{formatTime(duration)}</span>
        </div>
      )}

      {/* 2. Hàng điều khiển chính */}
      <div className="toolbar-controls-row">
        {/* Nhóm trái */}
        <div className="toolbar-left-group">
          {sourceType === 'image' && (
            <>
              <button
                type="button"
                onClick={onInferImage}
                disabled={!canInferImage || isAnalyzing}
                className="primary-fire-btn"
                title="Gửi ảnh để phát hiện lửa"
              >
                <Flame size={14} />
                <span>{isAnalyzing ? 'Đang suy luận...' : 'Phát hiện lửa'}</span>
              </button>

              <button
                type="button"
                onClick={onChangeFile}
                className="tool-btn"
                title="Chọn một tệp hình ảnh khác"
              >
                <FolderOpen size={13} />
                <span>Đổi ảnh</span>
              </button>
            </>
          )}

          {sourceType === 'video' && (
            <>
              <button
                type="button"
                onClick={onTogglePlay}
                className="play-pause-btn"
                title={isPlaying ? 'Tạm dừng (Phím cách)' : 'Phát (Phím cách)'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>

              <select
                value={playbackRate}
                onChange={(e) => onChangePlaybackRate(parseFloat(e.target.value))}
                className="toolbar-select"
                title="Tốc độ phát video"
              >
                <option value={0.5}>0.5x</option>
                <option value={1.0}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2.0}>2.0x</option>
              </select>

              <div className="volume-control-group">
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="tool-icon-btn"
                  title={isMuted ? 'Bật âm thanh' : 'Tắt tiếng'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="volume-slider"
                  title="Âm lượng"
                />
              </div>

              <button
                type="button"
                onClick={onChangeFile}
                className="tool-btn"
                title="Tải tệp video khác"
              >
                <FolderOpen size={13} />
                <span>Đổi video</span>
              </button>
            </>
          )}

          {sourceType === 'camera' && (
            <>
              <button
                type="button"
                onClick={onStopCamera}
                className="danger-btn"
                title="Dừng và giải phóng webcam"
              >
                <PowerOff size={13} />
                <span>Tắt Camera</span>
              </button>

              <button
                type="button"
                onClick={onToggleMirror}
                className={`tool-btn ${isMirrored ? 'tool-btn-active' : ''}`}
                title="Lật gương hình ảnh webcam"
              >
                <FlipHorizontal size={13} />
                <span>Lật gương</span>
              </button>
            </>
          )}
        </div>

        {/* Nhóm phải: Nhận diện AI, Box overlay, Ngưỡng tin cậy, Toàn màn hình */}
        <div className="toolbar-right-group">
          {(sourceType === 'video' || sourceType === 'camera') && (
            <button
              type="button"
              onClick={() => onToggleDetectionActive(!isDetectionActive)}
              className={`ai-toggle-switch ${isDetectionActive ? 'active' : ''}`}
              title="Bật/Tắt gửi frame lên máy chủ để suy luận AI (Không ảnh hưởng đến trình phát)"
            >
              <Flame size={14} />
              <span>{isDetectionActive ? 'Nhận diện AI: BẬT' : 'Nhận diện AI: TẮT'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleShowBoxes}
            className={`tool-btn ${showBoxes ? 'tool-btn-active' : ''}`}
            title="Ẩn/Hiện lớp vẽ Bounding Box (Không can thiệp tiến trình AI hay phát media)"
          >
            {showBoxes ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{showBoxes ? 'Hiện Box' : 'Ẩn Box'}</span>
          </button>

          <div className="confidence-group">
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
              className="conf-slider"
              title="Ngưỡng lọc điểm tin cậy"
            />
          </div>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="tool-icon-btn"
            title="Xem toàn màn hình"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
