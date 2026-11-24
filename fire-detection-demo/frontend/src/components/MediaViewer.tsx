import React, { useState, useEffect } from 'react';
import { BoundingBoxCanvas } from './BoundingBoxCanvas';
import type { SourceType, DetectionItem, FireAlertEvent } from '../types';
import { Loader2, Camera, UploadCloud, Flame } from 'lucide-react';

interface MediaViewerProps {
  sourceType: SourceType;
  imageSrc: string | null;
  videoSrc: string | null;
  webcamStream: MediaStream | null;
  isCameraActive: boolean;
  caption: string;
  onDropFile: (file: File) => void;

  videoRef: React.RefObject<HTMLVideoElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;

  detections: DetectionItem[];
  showBoxes: boolean;
  showLabels: boolean;
  isMockMode: boolean;
  highlightedIndex: number | null;
  isMirrored: boolean;
  isAnalyzing: boolean;
  activeAlert?: FireAlertEvent | null;

  onVideoPlay?: () => void;
  onVideoPause?: () => void;
  onVideoSeeked?: () => void;
  onVideoTimeUpdate?: () => void;
  onVideoLoadedMetadata?: () => void;
  onVideoEnded?: () => void;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  sourceType,
  imageSrc,
  videoSrc,
  webcamStream,
  isCameraActive,
  caption,
  onDropFile,
  videoRef,
  imageRef,
  containerRef,
  detections,
  showBoxes,
  showLabels,
  isMockMode,
  highlightedIndex,
  isMirrored,
  isAnalyzing,
  activeAlert,
  onVideoPlay,
  onVideoPause,
  onVideoSeeked,
  onVideoTimeUpdate,
  onVideoLoadedMetadata,
  onVideoEnded,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (sourceType === 'camera' && videoRef.current) {
      if (webcamStream) {
        videoRef.current.srcObject = webcamStream;
        videoRef.current.play().catch((err) => {
          console.warn('Lỗi phát stream camera:', err);
        });
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [sourceType, webcamStream, videoRef]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDropFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="editorial-media-wrapper">
      <div
        className={`editorial-media-stage ${isDragOver ? 'drag-over' : ''}`}
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop zone overlay indicator */}
        {isDragOver && (
          <div className="drag-drop-overlay">
            <UploadCloud size={36} className="text-amber-500 mb-2" />
            <span>Thả tệp vào đây để tải lên</span>
          </div>
        )}

        {/* Analyzing floating pill */}
        {isAnalyzing && (
          <div className="editorial-analyzing-pill">
            <Loader2 size={13} className="animate-spin text-amber-500" />
            <span>Đang suy luận...</span>
          </div>
        )}

        {/* Floating Active Fire Alert Banner (cạnh khung xem) */}
        {activeAlert && (
          <div
            className={`editorial-alert-banner ${activeAlert.isMock ? 'mock' : 'real'}`}
            role="alert"
            aria-live="assertive"
          >
            <Flame size={15} className="alert-flame-icon animate-pulse" />
            <span>
              {activeAlert.isMock
                ? `Cảnh báo mô phỏng: Phát hiện lửa · ${activeAlert.formattedTime}`
                : `Phát hiện lửa · ${activeAlert.formattedTime}`}
            </span>
          </div>
        )}

        {/* Tab 1: Image */}
        {sourceType === 'image' && (
          imageSrc ? (
            <div className="media-inner-container">
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Khung xem phát hiện đám cháy"
                className="media-content-img"
              />
              <BoundingBoxCanvas
                sourceType="image"
                imageRef={imageRef}
                detections={detections}
                showBoxes={showBoxes}
                showLabels={showLabels}
                isMockMode={isMockMode}
                highlightedIndex={highlightedIndex}
              />
            </div>
          ) : (
            <div className="media-placeholder-box">
              <p>Chưa có ảnh hiển thị. Kéo thả hoặc chọn ảnh từ máy tính.</p>
            </div>
          )
        )}

        {/* Tab 2: Video */}
        {sourceType === 'video' && (
          videoSrc ? (
            <div className="media-inner-container">
              <video
                ref={videoRef}
                src={videoSrc}
                className="media-content-video"
                playsInline
                controls
                loop
                onPlay={onVideoPlay}
                onPause={onVideoPause}
                onSeeked={onVideoSeeked}
                onTimeUpdate={onVideoTimeUpdate}
                onLoadedMetadata={onVideoLoadedMetadata}
                onEnded={onVideoEnded}
              />
              <BoundingBoxCanvas
                sourceType="video"
                videoRef={videoRef}
                detections={detections}
                showBoxes={showBoxes}
                showLabels={showLabels}
                isMockMode={isMockMode}
                highlightedIndex={highlightedIndex}
              />
            </div>
          ) : (
            <div className="media-placeholder-box">
              <p>Chưa có video. Kéo thả tệp video MP4/WebM hoặc chọn video từ máy tính.</p>
            </div>
          )
        )}

        {/* Tab 3: Camera */}
        {sourceType === 'camera' && (
          isCameraActive && webcamStream ? (
            <div className="media-inner-container">
              <video
                ref={videoRef}
                className={`media-content-video ${isMirrored ? 'mirrored' : ''}`}
                autoPlay
                playsInline
                muted
              />
              <BoundingBoxCanvas
                sourceType="camera"
                videoRef={videoRef}
                detections={detections}
                showBoxes={showBoxes}
                showLabels={showLabels}
                isMockMode={isMockMode}
                highlightedIndex={highlightedIndex}
                isMirrored={isMirrored}
              />
            </div>
          ) : (
            <div className="media-placeholder-box">
              <Camera size={36} className="text-stone-400 mb-2" />
              <p className="font-medium text-stone-700">Camera chưa được bật</p>
              <p className="text-xs text-stone-500">Bấm nút "Mở Camera" ở thanh công cụ hoặc cột bên phải để bắt đầu quan sát.</p>
            </div>
          )
        )}
      </div>

      {/* Caption row directly underneath the media stage */}
      <div className="editorial-media-caption-row">
        <span className="editorial-media-caption">{caption}</span>
        {activeAlert && (
          <span className={`caption-alert-badge ${activeAlert.isMock ? 'mock' : 'real'}`}>
            <span className="caption-alert-dot" />
            <span>
              {activeAlert.isMock ? 'Cảnh báo mô phỏng' : 'Phát hiện lửa'} · {activeAlert.formattedTime}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};
