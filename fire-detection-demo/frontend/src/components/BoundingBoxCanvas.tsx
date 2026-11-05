import React, { useEffect, useRef } from 'react';
import type { DetectionItem, SourceType } from '../types';
import { calculateContainRect, normalizedBoxToCanvas } from '../utils/coordinateUtils';

interface BoundingBoxCanvasProps {
  sourceType: SourceType;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  imageRef?: React.RefObject<HTMLImageElement | null>;
  detections: DetectionItem[];
  showBoxes: boolean;
  showLabels: boolean;
  isMockMode?: boolean;
  highlightedIndex?: number | null;
  isMirrored?: boolean;
}

export const BoundingBoxCanvas: React.FC<BoundingBoxCanvasProps> = ({
  sourceType,
  videoRef,
  imageRef,
  detections,
  showBoxes,
  showLabels,
  isMockMode = false,
  highlightedIndex = null,
  isMirrored = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const containerW = canvas.clientWidth;
    const containerH = canvas.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== containerW * dpr || canvas.height !== containerH * dpr) {
      canvas.width = containerW * dpr;
      canvas.height = containerH * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, containerW, containerH);

    const mediaElement = sourceType === 'image' ? imageRef?.current : videoRef?.current;

    if (!showBoxes || detections.length === 0 || !mediaElement) {
      ctx.restore();
      return;
    }

    let mediaW = 0;
    let mediaH = 0;

    if (mediaElement instanceof HTMLVideoElement) {
      mediaW = mediaElement.videoWidth || 640;
      mediaH = mediaElement.videoHeight || 360;
    } else if (mediaElement instanceof HTMLImageElement) {
      mediaW = mediaElement.naturalWidth || 640;
      mediaH = mediaElement.naturalHeight || 360;
    }

    if (!mediaW || !mediaH) {
      ctx.restore();
      return;
    }

    // Tính toán vùng bù trừ viền đen của object-fit: contain
    const viewport = calculateContainRect(containerW, containerH, mediaW, mediaH);

    detections.forEach((det, idx) => {
      let boxCoords = det.box;
      if (isMirrored) {
        boxCoords = [1.0 - det.box[2], det.box[1], 1.0 - det.box[0], det.box[3]];
      }

      const { x, y, w, h } = normalizedBoxToCanvas(boxCoords, viewport);
      const isHighlighted = highlightedIndex === idx;

      const isSmoke = det.class_name.toLowerCase() === 'smoke';
      // Màu viền và màu nền (nền cực kỳ nhẹ để không che ngọn lửa nhỏ bên trong)
      const borderColor = isHighlighted
        ? '#fbbf24' // Vàng nổi bật khi hover
        : isMockMode
        ? '#f97316' // Cam mô phỏng
        : isSmoke
        ? '#06b6d4' // Cyan cho khói
        : '#ef4444'; // Đỏ cho lửa thật

      const fillColor = isHighlighted
        ? 'rgba(251, 191, 36, 0.12)'
        : isSmoke
        ? 'rgba(6, 182, 212, 0.06)'
        : 'rgba(239, 68, 68, 0.05)'; // Cực mỏng, không che lửa/khói

      // 1. Tô nền mờ trong suốt
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, w, h);

      // 2. Vẽ viền hộp (2px sắc nét)
      ctx.lineWidth = isHighlighted ? 2.5 : 1.75;
      ctx.strokeStyle = borderColor;
      ctx.strokeRect(x, y, w, h);

      // 3. Vẽ 4 góc định vị (crosshairs) tinh tế
      const cornerLen = Math.min(8, w / 4, h / 4);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Góc trên trái
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      // Góc trên phải
      ctx.moveTo(x + w - cornerLen, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + cornerLen);
      // Góc dưới trái
      ctx.moveTo(x, y + h - cornerLen);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + cornerLen, y + h);
      // Góc dưới phải
      ctx.moveTo(x + w - cornerLen, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - cornerLen);
      ctx.stroke();

      // 4. Vẽ nhãn (Label): Ưu tiên nằm NGOÀI box khi đủ chỗ để không che lửa
      if (showLabels) {
        const percent = Math.round(det.confidence * 100);
        const classNameVi =
          det.class_name.toLowerCase() === 'fire'
            ? 'Lửa'
            : det.class_name.toLowerCase() === 'smoke'
            ? 'Khói'
            : det.class_name;
        const labelText = isMockMode
          ? `Mô phỏng: ${classNameVi} ${percent}%`
          : `${classNameVi} ${percent}%`;

        ctx.font = '600 11px Inter, system-ui, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const paddingX = 6;
        const pillW = textMetrics.width + paddingX * 2 + 10;
        const pillH = 18;

        // Ưu tiên đặt BÊN NGOÀI phía trên box:
        let pillX = Math.max(viewport.offsetX, Math.min(x, viewport.offsetX + viewport.renderW - pillW));
        let pillY: number;

        if (y - pillH - 4 >= viewport.offsetY) {
          // Đủ chỗ phía trên ngoài box
          pillY = y - pillH - 4;
        } else if (y + h + pillH + 4 <= viewport.offsetY + viewport.renderH) {
          // Nếu sát mép trên -> đặt phía dưới ngoài box
          pillY = y + h + 4;
        } else {
          // Bất khả kháng mới đặt góc trong
          pillY = y + 2;
        }

        // Vẽ nền pill tương phản cao
        ctx.fillStyle = 'rgba(7, 9, 14, 0.95)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 3);
        ctx.fill();

        // Viền pill
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Chấm màu trạng thái (3px)
        ctx.fillStyle = borderColor;
        ctx.beginPath();
        ctx.arc(pillX + 7, pillY + pillH / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Chữ trắng sắc nét
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, pillX + 14, pillY + 13);
      }
    });

    ctx.restore();
  }, [
    sourceType,
    videoRef,
    imageRef,
    detections,
    showBoxes,
    showLabels,
    isMockMode,
    highlightedIndex,
    isMirrored,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  );
};
