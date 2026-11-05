import React from 'react';
import { Image as ImageIcon, Video as VideoIcon, Camera as CameraIcon } from 'lucide-react';
import type { SourceType } from '../types';

interface SourceTabsProps {
  activeSource: SourceType;
  onChangeSource: (source: SourceType) => void;
}

export const SourceTabs: React.FC<SourceTabsProps> = ({ activeSource, onChangeSource }) => {
  return (
    <div className="source-tabs-container">
      <div className="source-tabs-list">
        <button
          type="button"
          className={`source-tab-btn ${activeSource === 'image' ? 'active' : ''}`}
          onClick={() => onChangeSource('image')}
        >
          <ImageIcon size={14} />
          <span>Ảnh</span>
        </button>

        <button
          type="button"
          className={`source-tab-btn ${activeSource === 'video' ? 'active' : ''}`}
          onClick={() => onChangeSource('video')}
        >
          <VideoIcon size={14} />
          <span>Video</span>
        </button>

        <button
          type="button"
          className={`source-tab-btn ${activeSource === 'camera' ? 'active' : ''}`}
          onClick={() => onChangeSource('camera')}
        >
          <CameraIcon size={14} />
          <span>Camera (Webcam)</span>
        </button>
      </div>
    </div>
  );
};
