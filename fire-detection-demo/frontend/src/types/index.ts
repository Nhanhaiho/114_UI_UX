export type SourceType = 'image' | 'video' | 'camera';

export interface DetectionItem {
  class_id: number;
  class_name: string;
  confidence: number;
  box: [number, number, number, number]; // [x1, y1, x2, y2] trong [0, 1]
}

export interface InferenceResponse {
  session_id?: string;
  generation_id?: number;
  frame_id?: number;
  timestamp_ms?: number;
  image_width: number;
  image_height: number;
  inference_ms: number;
  mode: 'real' | 'mock';
  detections: DetectionItem[];
}

export interface ModelStatus {
  is_ready: boolean;
  model_name?: string | null;
  model_path: string;
  device: string;
  imgsz: number;
  supported_classes: Record<number, string>;
  error_message?: string | null;
  notes: string;
}

export interface BackendHealth {
  status: string;
  model_ready: boolean;
  uptime_seconds: number;
}

export type AnalysisState = 'idle' | 'analyzing' | 'success' | 'empty' | 'error';

export interface FireEventRecord {
  id: string;
  timestamp_ms: number;
  formattedTime: string;
  count: number;
  max_confidence: number;
}

export interface RenderViewportRect {
  renderW: number;
  renderH: number;
  offsetX: number;
  offsetY: number;
}

