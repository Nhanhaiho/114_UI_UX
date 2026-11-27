import type { ModelStatus } from '../types';

/**
 * Rút gọn tên mô hình từ ModelStatus để hiển thị gọn trên Header và bảng kết quả.
 */
export function getShortModelName(status: ModelStatus | null): string {
  if (!status?.is_ready) return 'Chưa nạp';
  const name = status.model_name || status.model_path || '';
  const lower = name.toLowerCase();

  if (name.includes('P2+SRC') || lower.includes('src')) return 'YOLO-SRC';
  if (lower.includes('plain')) return 'YOLO-Plain';
  if (lower.includes('p2')) return 'YOLO26n-P2';
  if (lower.includes('26n') || lower.includes('combined') || lower.includes('best')) return 'YOLO26n';
  if (lower.includes('v10')) return 'YOLOv10';
  if (lower.includes('v11')) return 'YOLOv11';
  if (lower.includes('v8')) return 'YOLOv8';
  return name.split(' ')[0] || 'YOLO';
}
