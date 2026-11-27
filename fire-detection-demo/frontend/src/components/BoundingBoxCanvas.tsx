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
    const drawCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const containerW = canvas.clientWidth;
      const containerH = canvas.clientHeight;

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(containerW * dpr);
      const targetH = Math.round(containerH * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
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
        mediaW = mediaElement.videoWidth;
        mediaH = mediaElement.videoHeight;
      } else if (mediaElement instanceof HTMLImageElement) {
        mediaW = mediaElement.naturalWidth;
        mediaH = mediaElement.naturalHeight;
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
        const isConfirmedFire = !!det.isConfirmedFire;

        // Màu viền và màu nền
        const borderColor = isHighlighted
          ? '#fbbf24' // Vàng nổi bật khi hover
          : isConfirmedFire
          ? '#dc2626' // Đỏ rực cảnh báo lửa đã xác nhận
          : isMockMode
          ? '#f97316' // Cam mô phỏng
          : isSmoke
          ? '#06b6d4' // Cyan cho khói
          : '#ef4444'; // Đỏ cho lửa thường

        const fillColor = isHighlighted
          ? 'rgba(251, 191, 36, 0.12)'
          : isConfirmedFire
          ? 'rgba(220, 38, 38, 0.15)'
          : isSmoke
          ? 'rgba(6, 182, 212, 0.06)'
          : 'rgba(239, 68, 68, 0.05)';

        // 1. Nền mờ
        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, w, h);

        // 2. Viền chính (nếu là cảnh báo lửa thì viền đậm 2.5px kèm đổ bóng)
        if (isConfirmedFire) {
          ctx.save();
          ctx.shadowColor = '#dc2626';
          ctx.shadowBlur = 10;
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
        } else {
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1.75;
          ctx.strokeRect(x, y, w, h);
        }

        // 3. 4 góc định vị (crosshairs)
        const cornerLen = Math.max(7, Math.min(14, Math.min(w, h) * 0.22));
        ctx.lineWidth = 2.5;

        // Góc trên-trái
        ctx.beginPath();
        ctx.moveTo(x, y + cornerLen);
        ctx.lineTo(x, y);
        ctx.lineTo(x + cornerLen, y);
        ctx.stroke();

        // Góc trên-phải
        ctx.beginPath();
        ctx.moveTo(x + w - cornerLen, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + cornerLen);
        ctx.stroke();

        // Góc dưới-trái
        ctx.beginPath();
        ctx.moveTo(x, y + h - cornerLen);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + cornerLen, y + h);
        ctx.stroke();

        // Góc dưới-phải
        ctx.beginPath();
        ctx.moveTo(x + w - cornerLen, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - cornerLen);
        ctx.stroke();

        // 4. Nhãn tên lớp & Confidence
        if (showLabels) {
          const classNameVi = isSmoke ? 'Khói' : 'Lửa';
          const confText = `${Math.round(det.confidence * 100)}%`;
          let labelText = isMockMode
            ? `Mô phỏng: ${classNameVi} ${confText}`
            : `${classNameVi} ${confText}`;

          if (isConfirmedFire) {
            labelText = isMockMode
              ? `Cảnh báo mô phỏng: Lửa ${confText}`
              : `Phát hiện lửa · ${confText}`;
          }

          ctx.font = isConfirmedFire
            ? '700 11px system-ui, -apple-system, sans-serif'
            : '600 11px system-ui, -apple-system, sans-serif';
          const textMetrics = ctx.measureText(labelText);
          const pillW = textMetrics.width + 20;
          const pillH = 19;

          // Ưu tiên đặt BÊN NGOÀI phía trên box:
          let pillX = Math.max(viewport.offsetX, Math.min(x, viewport.offsetX + viewport.renderW - pillW));
          let pillY: number;

          if (y - pillH - 4 >= viewport.offsetY) {
            pillY = y - pillH - 4;
          } else if (y + h + pillH + 4 <= viewport.offsetY + viewport.renderH) {
            pillY = y + h + 4;
          } else {
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
    };

    drawCanvas();

    const canvas = canvasRef.current;
    const targetElement = canvas?.parentElement || canvas;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && targetElement) {
      ro = new ResizeObserver(() => {
        drawCanvas();
      });
      ro.observe(targetElement);
    }

    const mediaEl = sourceType === 'image' ? imageRef?.current : videoRef?.current;
    if (mediaEl) {
      mediaEl.addEventListener('load', drawCanvas);
      mediaEl.addEventListener('loadedmetadata', drawCanvas);
    }

    window.addEventListener('resize', drawCanvas);
    return () => {
      if (ro) ro.disconnect();
      if (mediaEl) {
        mediaEl.removeEventListener('load', drawCanvas);
        mediaEl.removeEventListener('loadedmetadata', drawCanvas);
      }
      window.removeEventListener('resize', drawCanvas);
    };
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
