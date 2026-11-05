import type { BackendHealth, ModelStatus, InferenceResponse } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function checkHealth(): Promise<BackendHealth> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      throw new ApiError(`Health check failed (${res.status})`, res.status);
    }
    return await res.json();
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Không thể kết nối đến backend máy chủ.', 0, 'network_error');
  }
}

export async function getModelStatus(): Promise<ModelStatus> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/model/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(data.detail || `Lỗi lấy trạng thái mô hình (${res.status})`, res.status);
    }
    return await res.json();
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Mất kết nối backend.', 0, 'network_error');
  }
}

export interface InferImageParams {
  file: Blob | File;
  sessionId?: string;
  generationId?: number;
  frameId?: number;
  timestampMs?: number;
  confidenceThreshold?: number;
  useMock?: boolean;
  signal?: AbortSignal;
}

export async function inferImage({
  file,
  sessionId,
  generationId,
  frameId,
  timestampMs,
  confidenceThreshold,
  useMock = false,
  signal,
}: InferImageParams): Promise<InferenceResponse> {
  const formData = new FormData();
  // Đặt tên tệp chuẩn hóa binary
  const fileName = file instanceof File ? file.name : 'frame.jpg';
  formData.append('file', file, fileName);

  if (sessionId) formData.append('session_id', sessionId);
  if (generationId !== undefined) formData.append('generation_id', generationId.toString());
  if (frameId !== undefined) formData.append('frame_id', frameId.toString());
  if (timestampMs !== undefined) formData.append('timestamp_ms', timestampMs.toString());
  if (confidenceThreshold !== undefined) {
    formData.append('confidence_threshold', confidenceThreshold.toString());
  }
  formData.append('use_mock', useMock ? 'true' : 'false');

  try {
    const res = await fetch(`${API_BASE_URL}/api/infer/image`, {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const message = errorData.message || errorData.detail || `Lỗi máy chủ (${res.status})`;
      throw new ApiError(message, res.status, errorData.error);
    }

    return await res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err; // Bỏ qua nếu bị abort chủ động
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError('Không thể gửi yêu cầu suy luận đến backend.', 0, 'network_error');
  }
}
