import type { DetectionItem, FireAlertEvent } from '../types';

export interface FireCandidate {
  id: string;
  firstSeenMs: number;
  lastSeenMs: number;
  box: [number, number, number, number]; // [x1, y1, x2, y2]
  maxConfidence: number;
  isConfirmed: boolean;
  confirmedAtMs?: number;
}

export type { FireAlertEvent };

export interface TrackerOptions {
  triggerConfidence?: number; // Ngưỡng bắt đầu theo dõi: mặc định 0.30
  continueConfidence?: number; // Ngưỡng duy trì theo dõi: mặc định 0.20 (lửa > 0.20)
  confirmDurationMs?: number; // Thời gian duy trì liên tục để xác nhận: mặc định 500ms
  iouThreshold?: number; // Ngưỡng trùng khớp không gian IoU: mặc định 0.20
  maxGapMs?: number; // Dung sai mất frame tối đa: mặc định 400ms
}

/**
 * Tính toán IoU (Intersection over Union) giữa hai bounding box chuẩn hóa [x1, y1, x2, y2]
 */
export function calculateIoU(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number]
): number {
  const [ax1, ay1, ax2, ay2] = boxA;
  const [bx1, by1, bx2, by2] = boxB;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;

  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);

  const unionArea = areaA + areaB - interArea;
  if (unionArea <= 0) return 0;

  return interArea / unionArea;
}

/**
 * Kiểm tra xem 2 bounding box có thuộc cùng một vùng không gian không.
 * Kết hợp IoU >= threshold và khoảng cách tâm (center distance) để bao quát trường hợp ngọn lửa bùng to/thu nhỏ.
 */
export function isSameSpatialRegion(
  boxA: [number, number, number, number],
  boxB: [number, number, number, number],
  iouThreshold: number = 0.20
): boolean {
  const iou = calculateIoU(boxA, boxB);
  if (iou >= iouThreshold) return true;

  // Fallback: Kiểm tra khoảng cách tâm chuẩn hóa
  const centerAX = (boxA[0] + boxA[2]) / 2;
  const centerAY = (boxA[1] + boxA[3]) / 2;
  const centerBX = (boxB[0] + boxB[2]) / 2;
  const centerBY = (boxB[1] + boxB[3]) / 2;

  const distSq = (centerAX - centerBX) ** 2 + (centerAY - centerBY) ** 2;
  // Tâm cách nhau < 0.12 (khoảng cách Euclide chuẩn hóa) và có giao cắt
  if (distSq < 0.12 * 0.12) {
    const hasOverlap =
      Math.max(boxA[0], boxB[0]) < Math.min(boxA[2], boxB[2]) &&
      Math.max(boxA[1], boxB[1]) < Math.min(boxA[3], boxB[3]);
    if (hasOverlap) return true;
  }

  return false;
}

/**
 * Định dạng thời điểm xác nhận:
 * - Video: MM:SS (ví dụ 00:03)
 * - Webcam / Realtime: HH:MM:SS (ví dụ 16:30:15)
 */
export function formatAlertTime(timestampMs: number, isVideo: boolean = true): string {
  if (isVideo) {
    const totalSec = Math.max(0, Math.floor(timestampMs / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(mins)}:${pad(secs)}`;
  } else {
    const d = new Date(timestampMs > 1e11 ? timestampMs : Date.now());
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

export class FireAlertTracker {
  private candidates: Map<string, FireCandidate> = new Map();
  private alerts: FireAlertEvent[] = [];
  private candidateIdCounter = 0;
  private alertIdCounter = 0;

  private readonly triggerConfidence: number;
  private readonly continueConfidence: number;
  private readonly confirmDurationMs: number;
  private readonly iouThreshold: number;
  private readonly maxGapMs: number;

  constructor(options: TrackerOptions = {}) {
    this.triggerConfidence = options.triggerConfidence ?? 0.30;
    this.continueConfidence = options.continueConfidence ?? 0.20;
    this.confirmDurationMs = options.confirmDurationMs ?? 500;
    this.iouThreshold = options.iouThreshold ?? 0.20;
    this.maxGapMs = options.maxGapMs ?? 400;
  }

  /**
   * Xử lý một khung hình mới với danh sách detections và timestamp của frame (ms).
   */
  public processFrame(
    detections: DetectionItem[],
    timestampMs: number,
    meta: { isMock?: boolean; isVideo?: boolean } = {}
  ): {
    activeAlerts: FireAlertEvent[];
    newAlerts: FireAlertEvent[];
    allAlerts: FireAlertEvent[];
    confirmedBoxes: [number, number, number, number][];
  } {
    const isMock = !!meta.isMock;
    const isVideo = meta.isVideo !== false;

    // Lọc các detection là Lửa (fire)
    const fireDetections = detections.filter(
      (d) => d.class_name.toLowerCase() === 'fire'
    );

    const matchedDetectionIndices = new Set<number>();
    const newAlerts: FireAlertEvent[] = [];

    // 1. Cập nhật các ứng viên (candidates) đang theo dõi
    for (const [candId, candidate] of Array.from(this.candidates.entries())) {
      // Tìm detection lửa khớp với vùng của candidate (ưu tiên IoU cao nhất và confidence > continueConfidence)
      let bestMatchIdx = -1;
      let highestIoU = -1;

      for (let i = 0; i < fireDetections.length; i++) {
        if (matchedDetectionIndices.has(i)) continue;
        const det = fireDetections[i];
        if (det.confidence <= this.continueConfidence) continue;

        if (isSameSpatialRegion(candidate.box, det.box, this.iouThreshold)) {
          const iou = calculateIoU(candidate.box, det.box);
          if (iou > highestIoU) {
            highestIoU = iou;
            bestMatchIdx = i;
          }
        }
      }

      if (bestMatchIdx !== -1) {
        // Khớp ứng viên trong frame này
        const matchedDet = fireDetections[bestMatchIdx];
        matchedDetectionIndices.add(bestMatchIdx);

        candidate.lastSeenMs = timestampMs;
        candidate.box = matchedDet.box;
        candidate.maxConfidence = Math.max(candidate.maxConfidence, matchedDet.confidence);

        if (candidate.isConfirmed) {
          // Sự kiện đã xác nhận và vẫn tiếp diễn -> giữ trạng thái active
          const alert = this.alerts.find((a) => a.id === candId);
          if (alert) {
            alert.isActive = true;
            alert.box = matchedDet.box;
            alert.maxConfidence = Math.max(alert.maxConfidence, matchedDet.confidence);
          }
        } else {
          // Kiểm tra thời gian duy trì liên tục
          const duration = timestampMs - candidate.firstSeenMs;
          if (duration >= this.confirmDurationMs) {
            candidate.isConfirmed = true;
            candidate.confirmedAtMs = timestampMs;

            this.alertIdCounter += 1;
            const formattedTime = formatAlertTime(timestampMs, isVideo);
            const newAlert: FireAlertEvent = {
              id: candId,
              firstSeenMs: candidate.firstSeenMs,
              confirmedTimeMs: timestampMs,
              formattedTime,
              box: candidate.box,
              maxConfidence: candidate.maxConfidence,
              isMock,
              isActive: true,
            };

            this.alerts.unshift(newAlert); // Đưa alert mới nhất lên đầu danh sách phiên
            newAlerts.push(newAlert);
          }
        }
      } else {
        // Không tìm thấy detection trong frame này -> Kiểm tra xem đã mất bao lâu
        const gap = timestampMs - candidate.lastSeenMs;
        if (gap > this.maxGapMs) {
          // Quá thời gian dung sai mất frame -> Hủy ứng viên hoặc kết thúc alert
          if (!candidate.isConfirmed) {
            // Biến mất trước khi đủ 0.5s -> Hủy ứng viên (0 cảnh báo)
            this.candidates.delete(candId);
          } else {
            // Đã xác nhận trước đó nhưng nay lửa đã tắt -> Đổi trạng thái active = false
            const alert = this.alerts.find((a) => a.id === candId);
            if (alert) {
              alert.isActive = false;
              alert.endedAtMs = timestampMs;
            }
            this.candidates.delete(candId);
          }
        }
      }
    }

    // 2. Tạo ứng viên mới từ các detection chưa được ghép có confidence >= triggerConfidence (>= 0.30)
    for (let i = 0; i < fireDetections.length; i++) {
      if (matchedDetectionIndices.has(i)) continue;
      const det = fireDetections[i];

      if (det.confidence >= this.triggerConfidence) {
        // Kiểm tra xem vị trí này đã có active candidate hay chưa
        let alreadyTracked = false;
        for (const cand of this.candidates.values()) {
          if (isSameSpatialRegion(cand.box, det.box, this.iouThreshold)) {
            alreadyTracked = true;
            break;
          }
        }

        if (!alreadyTracked) {
          this.candidateIdCounter += 1;
          const newId = `fire-cand-${Date.now()}-${this.candidateIdCounter}`;
          this.candidates.set(newId, {
            id: newId,
            firstSeenMs: timestampMs,
            lastSeenMs: timestampMs,
            box: det.box,
            maxConfidence: det.confidence,
            isConfirmed: false,
          });
        }
      }
    }

    const activeAlerts = this.alerts.filter((a) => a.isActive);
    const confirmedBoxes = activeAlerts.map((a) => a.box);

    return {
      activeAlerts,
      newAlerts,
      allAlerts: [...this.alerts],
      confirmedBoxes,
    };
  }

  /**
   * Xóa các ứng viên đang theo dõi dở dang (unconfirmed).
   * Dùng khi tua video, đổi nguồn hoặc tắt nhận diện.
   */
  public resetPending(): void {
    for (const [candId, cand] of Array.from(this.candidates.entries())) {
      if (!cand.isConfirmed) {
        this.candidates.delete(candId);
      } else {
        // Đánh dấu active alerts thành false khi tạm dừng / tua
        const alert = this.alerts.find((a) => a.id === candId);
        if (alert) alert.isActive = false;
        this.candidates.delete(candId);
      }
    }
  }

  /**
   * Xóa toàn bộ ứng viên và danh sách cảnh báo trong phiên (khi đổi tệp mới)
   */
  public resetAll(): void {
    this.candidates.clear();
    this.alerts = [];
  }

  /**
   * Lấy danh sách toàn bộ cảnh báo trong phiên
   */
  public getAlertHistory(): FireAlertEvent[] {
    return [...this.alerts];
  }

  /**
   * Lấy danh sách cảnh báo đang diễn ra
   */
  public getActiveAlerts(): FireAlertEvent[] {
    return this.alerts.filter((a) => a.isActive);
  }

  /**
   * Kiểm tra một box có khớp với cảnh báo đang hoạt động nào không
   */
  public isBoxConfirmed(box: [number, number, number, number]): boolean {
    return this.getActiveAlerts().some((alert) =>
      isSameSpatialRegion(alert.box, box, this.iouThreshold)
    );
  }
}
