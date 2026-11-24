import React from 'react';
import { Image as ImageIcon, Play, Camera } from 'lucide-react';
import type { SourceType } from '../types';

interface SourceTabsProps {
  activeSource: SourceType;
  onChangeSource: (source: SourceType) => void;
}

export const SourceTabs: React.FC<SourceTabsProps> = ({ activeSource, onChangeSource }) => {
  const getTitle = () => {
    switch (activeSource) {
      case 'image':
        return 'Phân tích hình ảnh';
      case 'video':
        return 'Phân tích video';
      case 'camera':
        return 'Phân tích webcam';
      default:
        return 'Phân tích hình ảnh';
    }
  };

  return (
    <div className="source-header-section">
      <h1 className="source-heading">{getTitle()}</h1>
      <div className="source-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeSource === 'image'}
          className={`source-tab-btn ${activeSource === 'image' ? 'active' : ''}`}
          onClick={() => onChangeSource('image')}
        >
          <ImageIcon size={18} className="tab-icon" />
          <span>Ảnh</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSource === 'video'}
          className={`source-tab-btn ${activeSource === 'video' ? 'active' : ''}`}
          onClick={() => onChangeSource('video')}
        >
          <Play size={18} className="tab-icon" />
          <span>Video</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSource === 'camera'}
          className={`source-tab-btn ${activeSource === 'camera' ? 'active' : ''}`}
          onClick={() => onChangeSource('camera')}
        >
          <Camera size={18} className="tab-icon" />
          <span>Webcam</span>
        </button>
      </div>
      <div className="source-tabs-bottom-line" />
    </div>
  );
};
