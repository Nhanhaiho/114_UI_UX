import type { RenderViewportRect } from '../types';

/**
 * Tính toán hình chữ nhật hiển thị thực tế khi phần tử media sử dụng CSS object-fit: contain.
 */
export function calculateContainRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number
): RenderViewportRect {
  if (!containerWidth || !containerHeight || !mediaWidth || !mediaHeight) {
    return { renderW: containerWidth, renderH: containerHeight, offsetX: 0, offsetY: 0 };
  }

  const containerAspect = containerWidth / containerHeight;
  const mediaAspect = mediaWidth / mediaHeight;

  let renderW = containerWidth;
  let renderH = containerHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (mediaAspect > containerAspect) {
    // Media rộng hơn tỉ lệ khung chứa -> xuất hiện viền đen trên và dưới
    renderW = containerWidth;
    renderH = containerWidth / mediaAspect;
    offsetX = 0;
    offsetY = (containerHeight - renderH) / 2;
  } else {
    // Media cao hơn tỉ lệ khung chứa -> xuất hiện viền đen trái và phải
    renderH = containerHeight;
    renderW = containerHeight * mediaAspect;
    offsetX = (containerWidth - renderW) / 2;
    offsetY = 0;
  }

  return { renderW, renderH, offsetX, offsetY };
}

/**
 * Chuyển đổi tọa độ bounding box chuẩn hóa [x1, y1, x2, y2] sang pixel trên canvas.
 */
export function normalizedBoxToCanvas(
  box: [number, number, number, number],
  viewport: RenderViewportRect
): { x: number; y: number; w: number; h: number } {
  const [x1, y1, x2, y2] = box;
  const x = viewport.offsetX + x1 * viewport.renderW;
  const y = viewport.offsetY + y1 * viewport.renderH;
  const w = (x2 - x1) * viewport.renderW;
  const h = (y2 - y1) * viewport.renderH;
  return { x, y, w, h };
}

/**
 * Định dạng số giây sang định dạng mm:ss hoặc mm:ss.ms
 */
export function formatTime(seconds: number, includeMs: boolean = false): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
  const formattedMins = mins < 10 ? `0${mins}` : `${mins}`;

  if (includeMs) {
    const ms = Math.floor((seconds % 1) * 10);
    return `${formattedMins}:${formattedSecs}.${ms}`;
  }
  return `${formattedMins}:${formattedSecs}`;
}
