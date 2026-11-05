import React, { useRef } from 'react';
import { UploadCloud, Image as ImageIcon, Video as VideoIcon, Camera as CameraIcon, Sparkles } from 'lucide-react';
import type { SourceType } from '../types';

interface EmptyUploadAreaProps {
  sourceType: SourceType;
  onFileSelect: (file: File) => void;
  onLoadSample: (hasFire: boolean) => void;
  onStartCamera: () => void;
  cameraError: string | null;
  cameraDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelectDeviceId: (id: string) => void;
}

export const EmptyUploadArea: React.FC<EmptyUploadAreaProps> = ({
  sourceType,
  onFileSelect,
  onLoadSample,
  onStartCamera,
  cameraError,
  cameraDevices,
  selectedDeviceId,
  onSelectDeviceId,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  if (sourceType === 'camera') {
    return (
      <div className="empty-upload-card">
        <div className="empty-upload-icon-circle">
          <CameraIcon size={26} />
        </div>
        <h3 className="empty-upload-title">Quan sát trực tiếp qua Webcam</h3>
        <p className="empty-upload-desc">
          Mở camera máy tính để phát hiện lửa theo thời gian thực (real-time stream).
        </p>

        {cameraDevices.length > 1 && (
          <div className="camera-select-row">
            <label htmlFor="camera-device-select">Thiết bị:</label>
            <select
              id="camera-device-select"
              value={selectedDeviceId}
              onChange={(e) => onSelectDeviceId(e.target.value)}
              className="device-select"
            >
              {cameraDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {cameraError && (
          <div className="camera-error-banner">
            <p>{cameraError}</p>
          </div>
        )}

        <button type="button" onClick={onStartCamera} className="empty-cta-btn">
          <CameraIcon size={15} />
          <span>Mở Camera</span>
        </button>
      </div>
    );
  }

  const isVideo = sourceType === 'video';

  return (
    <div
      className="empty-upload-card"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={isVideo ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'}
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      <div className="empty-upload-icon-circle">
        {isVideo ? <VideoIcon size={26} /> : <ImageIcon size={26} />}
      </div>

      <h3 className="empty-upload-title">
        {isVideo ? 'Kéo thả tệp video vào đây' : 'Kéo thả tệp ảnh vào đây'}
      </h3>
      <p className="empty-upload-desc">
        {isVideo
          ? 'Hỗ trợ MP4, WebM (tối đa 300MB)'
          : 'Hỗ trợ JPG, PNG, WebP (tối đa 20MB)'}
      </p>

      <button
        type="button"
        className="empty-cta-btn"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
      >
        <UploadCloud size={15} />
        <span>{isVideo ? 'Chọn tệp video' : 'Chọn tệp ảnh'}</span>
      </button>

      {!isVideo && (
        <div
          className="sample-quick-buttons"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="sample-label">Thử nhanh mẫu:</span>
          <button
            type="button"
            className="sample-chip-btn"
            onClick={() => onLoadSample(true)}
          >
            <Sparkles size={12} className="text-amber-500" />
            <span>Ảnh mẫu có lửa</span>
          </button>
          <button
            type="button"
            className="sample-chip-btn"
            onClick={() => onLoadSample(false)}
          >
            <span>Ảnh không có lửa</span>
          </button>
        </div>
      )}
    </div>
  );
};
