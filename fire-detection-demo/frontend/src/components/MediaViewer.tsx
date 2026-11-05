import React, { useEffect } from 'react';
import { BoundingBoxCanvas } from './BoundingBoxCanvas';
import { EmptyUploadArea } from './EmptyUploadArea';
import type { SourceType, DetectionItem } from '../types';
import { Loader2 } from 'lucide-react';

interface MediaViewerProps {
  sourceType: SourceType;
  // File / Stream states
  imageSrc: string | null;
  videoSrc: string | null;
  webcamStream: MediaStream | null;
  hasMedia: boolean;

  // Handlers for empty area
  onFileSelect: (file: File) => void;
  onLoadSample: (hasFire: boolean) => void;
  onStartCamera: () => void;
  cameraError: string | null;
  cameraDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelectDeviceId: (id: string) => void;

  // Video element state/refs
  videoRef: React.RefObject<HTMLVideoElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Detections & Overlay
  detections: DetectionItem[];
  showBoxes: boolean;
  showLabels: boolean;
  isMockMode: boolean;
  highlightedIndex: number | null;
  isMirrored: boolean;

  // Status
  isAnalyzing: boolean;
  onVideoTimeUpdate: () => void;
  onVideoLoadedMetadata: () => void;
  onVideoEnded: () => void;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  sourceType,
  imageSrc,
  videoSrc,
  webcamStream,
  hasMedia,
  onFileSelect,
  onLoadSample,
  onStartCamera,
  cameraError,
  cameraDevices,
  selectedDeviceId,
  onSelectDeviceId,
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
  onVideoTimeUpdate,
  onVideoLoadedMetadata,
  onVideoEnded,
}) => {
  // Gắn stream vào video element khi ở chế độ webcam
  useEffect(() => {
    if (sourceType === 'camera' && videoRef.current) {
      if (webcamStream) {
        videoRef.current.srcObject = webcamStream;
        videoRef.current.play().catch((err) => {
          console.warn('Lỗi tự động phát stream webcam:', err);
        });
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [sourceType, webcamStream, videoRef]);


  return (
    <div className="media-viewer-container" ref={containerRef}>
      {!hasMedia ? (
        <EmptyUploadArea
          sourceType={sourceType}
          onFileSelect={onFileSelect}
          onLoadSample={onLoadSample}
          onStartCamera={onStartCamera}
          cameraError={cameraError}
          cameraDevices={cameraDevices}
          selectedDeviceId={selectedDeviceId}
          onSelectDeviceId={onSelectDeviceId}
        />
      ) : (
        <div className="media-stage-wrapper">
          {/* Badge chế độ mô phỏng */}
          {isMockMode && (
            <div className="media-mock-badge" title="Kết quả được tạo từ chế độ mô phỏng">
              MÔ PHỎNG
            </div>
          )}

          {/* Chỉ báo đang phân tích */}
          {isAnalyzing && (
            <div className="media-analyzing-pill">
              <Loader2 size={14} className="animate-spin text-amber-500" />
              <span>Đang suy luận...</span>
            </div>
          )}

          {/* Ảnh tĩnh */}
          {sourceType === 'image' && imageSrc && (
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Ảnh phân tích"
              className="media-content-img"
            />
          )}

          {/* Video hoặc Webcam */}
          {(sourceType === 'video' || sourceType === 'camera') && (
            <video
              ref={videoRef}
              src={sourceType === 'video' ? videoSrc || undefined : undefined}
              className={`media-content-video ${isMirrored && sourceType === 'camera' ? 'mirrored' : ''}`}
              playsInline
              onTimeUpdate={onVideoTimeUpdate}
              onLoadedMetadata={onVideoLoadedMetadata}
              onEnded={onVideoEnded}
            />
          )}

          {/* Canvas lớp phủ Bounding Box */}
          <BoundingBoxCanvas
            sourceType={sourceType}
            videoRef={videoRef}
            imageRef={imageRef}
            detections={detections}
            showBoxes={showBoxes}
            showLabels={showLabels}
            isMockMode={isMockMode}
            highlightedIndex={highlightedIndex}
            isMirrored={isMirrored && sourceType === 'camera'}
          />
        </div>
      )}
    </div>
  );
};
