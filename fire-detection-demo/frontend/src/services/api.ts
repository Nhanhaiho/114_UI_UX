import type {
  BackendHealth,
  ModelStatus,
  InferenceResponse,
  SourceType,
  UserEmailPreferences,
  EmailDispatchItem,
} from '../types';

const rawApiBase = import.meta.env.VITE_API_BASE_URL;
export const API_BASE_URL =
  rawApiBase !== undefined ? rawApiBase.trim().replace(/\/+$/, '') : 'http://localhost:8000';

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
  sourceType?: SourceType;
  useMock?: boolean;
  token?: string | null;
  signal?: AbortSignal;
}

export async function inferImage({
  file,
  sessionId,
  generationId,
  frameId,
  timestampMs,
  confidenceThreshold,
  sourceType = 'image',
  useMock = false,
  token,
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
  formData.append('source_type', sourceType);
  formData.append('use_mock', useMock ? 'true' : 'false');

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/infer/image`, {
      method: 'POST',
      headers,
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

export interface ModelListItem {
  filename: string;
  path: string;
  size_mb: number;
}

export async function getAvailableModels(): Promise<{ current_model: string; models: ModelListItem[] }> {
  const res = await fetch(`${API_BASE_URL}/api/model/list`);
  if (!res.ok) throw new ApiError('Không thể tải danh sách mô hình', res.status);
  return await res.json();
}

export async function switchModel(modelPath: string): Promise<ModelStatus> {
  const res = await fetch(`${API_BASE_URL}/api/model/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_path: modelPath }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(errorData.detail || 'Không thể chuyển đổi mô hình', res.status);
  }
  return await res.json();
}

// =============================================================================
// API QUẢN LÝ TÙY CHỌN EMAIL & GỬI THƯ CẢNH BÁO
// =============================================================================

export async function getUserPreferences(token: string): Promise<UserEmailPreferences> {
  const res = await fetch(`${API_BASE_URL}/api/user/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.detail || 'Không thể đọc tùy chọn người dùng', res.status);
  }
  return await res.json();
}

export async function updateUserPreferences(
  token: string,
  emailAlertsEnabled: boolean
): Promise<UserEmailPreferences> {
  const res = await fetch(`${API_BASE_URL}/api/user/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email_alerts_enabled: emailAlertsEnabled }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.detail || 'Không thể cập nhật tùy chọn', res.status);
  }
  return await res.json();
}

export async function sendTestEmail(
  token: string
): Promise<{
  success: boolean;
  mode: 'real' | 'mock';
  status: 'accepted' | 'simulated';
  message: string;
  recipient: string;
  cooldown_seconds: number;
}> {
  const res = await fetch(`${API_BASE_URL}/api/alerts/test-email`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.detail || 'Không thể gửi email thử nghiệm', res.status);
  }
  return await res.json();
}

export async function resetAlertSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/alerts/reset-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
  } catch (err) {
    console.warn('Lỗi reset alert session:', err);
  }
}

export async function getSessionDispatches(
  token: string,
  sessionId: string
): Promise<EmailDispatchItem[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/alerts/session-dispatches?session_id=${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.dispatches || [];
  } catch {
    return [];
  }
}
