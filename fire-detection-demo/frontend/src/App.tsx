import { useState, useRef, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SourceTabs } from './components/SourceTabs';
import { MediaViewer } from './components/MediaViewer';
import { Toolbar } from './components/Toolbar';
import { ResultPanel } from './components/ResultPanel';
import { AdvancedSettingsModal } from './components/AdvancedSettingsModal';
import { AuthModal } from './components/AuthModal';
import { useBackendStatus } from './hooks/useBackendStatus';
import { useWebcam } from './hooks/useWebcam';
import { useAuth } from './hooks/useAuth';
import {
  inferImage,
  getUserPreferences,
  updateUserPreferences,
  sendTestEmail,
  resetAlertSession,
  getSessionDispatches,
  ApiError,
} from './services/api';
import { FireAlertTracker } from './utils/fireAlertTracker';
import { getShortModelName } from './utils/modelUtils';
import type {
  SourceType,
  DetectionItem,
  AnalysisState,
  FireAlertEvent,
  UserEmailPreferences,
  TestEmailFeedback,
} from './types';

export function App() {
  // 1. Trạng thái Backend & Mô hình
  const { health, modelStatus, isConnected, isChecking, refreshStatus } = useBackendStatus();
  const [isMockMode, setIsMockMode] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // 1b. Trạng thái Xác thực & Tùy chọn Email
  const {
    user,
    accessToken,
    signInWithOtp,
    verifyOtp,
    signOut,
    isMockAuth,
  } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [userPreferences, setUserPreferences] = useState<UserEmailPreferences | null>(null);
  const [testEmailCooldown, setTestEmailCooldown] = useState<number>(0);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState<boolean>(false);
  const [testEmailFeedback, setTestEmailFeedback] = useState<TestEmailFeedback | null>(null);
  const testEmailTimerRef = useRef<number | null>(null);

  // 2. Trạng thái Nguồn Media
  const [sourceType, setSourceType] = useState<SourceType>('image');
  const [imageSrc, setImageSrc] = useState<string>('/samples/sample_fire_smoke.jpg');
  const [caption, setCaption] = useState<string>('Ảnh mẫu · Chưa phân tích');
  const [activeSample, setActiveSample] = useState<'fire_smoke' | 'neutral' | 'custom'>('fire_smoke');
  const [isSampleAnalyzed, setIsSampleAnalyzed] = useState<boolean>(false);
  const currentBlobRef = useRef<Blob | File | null>(null);

  const [videoSrc, setVideoSrc] = useState<string | null>('/samples/sample_fire.mp4');

  // Webcam Hook
  const webcam = useWebcam();
  const [isMirrored, setIsMirrored] = useState<boolean>(false);

  // 3. Trạng thái Trình phát Video
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isDetectionActive, setIsDetectionActive] = useState<boolean>(true);

  // 4. Cấu hình suy luận & Hiển thị
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.25);
  const [targetFps, setTargetFps] = useState<number>(4);
  const [timestampToleranceMs, setTimestampToleranceMs] = useState<number>(250);
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  // 5. Kết quả suy luận & Đo lường thực tế
  const [detections, setDetections] = useState<DetectionItem[]>([]);
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inferenceMs, setInferenceMs] = useState<number>(0);
  const [measuredFps, setMeasuredFps] = useState<number>(0);

  // 6. Cảnh báo lửa thời gian thực (Video & Webcam)
  const [alerts, setAlerts] = useState<FireAlertEvent[]>([]);
  const [activeAlert, setActiveAlert] = useState<FireAlertEvent | null>(null);
  const trackerRef = useRef<FireAlertTracker>(new FireAlertTracker());

  // Refs điều khiển vòng lặp và đồng bộ
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const hiddenVideoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Đồng bộ phiên & thế hệ (để hủy kết quả cũ khi tua/đổi nguồn)
  const sessionIdRef = useRef<string>(`session_${Date.now()}`);
  const generationIdRef = useRef<number>(1);
  const frameIdCounterRef = useRef<number>(0);
  const isInferringRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);

  // Bộ tính FPS thực tế
  const fpsFrameCountRef = useRef<number>(0);
  const fpsWindowStartRef = useRef<number>(0);
  const prevModelPathRef = useRef<string | null>(null);

  // Hủy request đang chờ và xóa trạng thái theo dõi dở (dùng chung khi tua, tắt AI, đổi nguồn, đổi model)
  const abortAndResetPendingTracking = useCallback(() => {
    generationIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isInferringRef.current = false;
    fpsFrameCountRef.current = 0;
    fpsWindowStartRef.current = 0;
    trackerRef.current.resetPending();
    setActiveAlert(null);
    setDetections([]);
    void resetAlertSession(sessionIdRef.current);
  }, []);

  // Nếu backend đổi checkpoint (qua modal hoặc auto-reload .env), reset tracker và bỏ request model cũ
  useEffect(() => {
    const currentPath = modelStatus?.model_path || null;
    if (currentPath && prevModelPathRef.current && prevModelPathRef.current !== currentPath) {
      abortAndResetPendingTracking();
    }
    if (currentPath) {
      prevModelPathRef.current = currentPath;
    }
  }, [modelStatus?.model_path, abortAndResetPendingTracking]);

  // Nạp cấu hình nhận email khi đăng nhập
  useEffect(() => {
    if (accessToken) {
      void getUserPreferences(accessToken)
        .then((prefs) => setUserPreferences(prefs))
        .catch((err) => console.warn('Lỗi đọc preferences:', err));
    } else {
      setUserPreferences(null);
    }
  }, [accessToken]);

  // Bộ đếm lùi cooldown cho nút gửi email thử
  useEffect(() => {
    let timer: any;
    if (testEmailCooldown > 0) {
      timer = setInterval(() => {
        setTestEmailCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [testEmailCooldown]);

  // Đồng bộ trạng thái gửi email từ backend cho các cảnh báo đang chờ gửi trong phiên
  const hasPendingEmail = alerts.some((alt) => alt.emailDispatchStatus === 'pending');
  useEffect(() => {
    if (!accessToken || !hasPendingEmail || isMockMode) return;

    let isSubscribed = true;
    const fetchDispatches = async () => {
      try {
        const dispatches = await getSessionDispatches(accessToken, sessionIdRef.current);
        if (!isSubscribed || dispatches.length === 0) return;

        setAlerts((prevAlerts) =>
          prevAlerts.map((alt) => {
            const expectedEventId = `${sessionIdRef.current}_${alt.id}`;
            const match = dispatches.find(
              (d) => d.event_id === expectedEventId || d.event_id.endsWith(`_${alt.id}`)
            );
            if (match) {
              return {
                ...alt,
                emailDispatchStatus: match.status,
                emailDispatchMode: match.mode,
                emailDispatchError: match.error_message,
              };
            }
            return alt;
          })
        );
      } catch {
        // Silently catch background sync errors
      }
    };

    void fetchDispatches();
    const interval = setInterval(fetchDispatches, 2000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [accessToken, hasPendingEmail, isMockMode]);

  // Bật/tắt tùy chọn nhận email cảnh báo
  const handleToggleEmailAlerts = useCallback(
    async (enabled: boolean) => {
      if (!accessToken) {
        setIsAuthModalOpen(true);
        return;
      }
      try {
        const updated = await updateUserPreferences(accessToken, enabled);
        setUserPreferences(updated);
      } catch (err: any) {
        console.error('Lỗi cập nhật tùy chọn email:', err);
      }
    },
    [accessToken]
  );

  // Gửi email thử nghiệm (phản ánh đúng trạng thái: đang chờ gửi, mô phỏng, SMTP chấp nhận, hoặc lỗi)
  const handleSendTestEmail = useCallback(async () => {
    if (!accessToken) {
      setIsAuthModalOpen(true);
      return;
    }
    if (testEmailTimerRef.current) {
      window.clearTimeout(testEmailTimerRef.current);
      testEmailTimerRef.current = null;
    }
    setIsSendingTestEmail(true);
    setTestEmailFeedback({
      type: 'pending',
      message: 'Đang chờ gửi...',
    });
    try {
      const res = await sendTestEmail(accessToken);
      if (res.status === 'simulated' || res.mode === 'mock') {
        setTestEmailFeedback({
          type: 'simulated',
          message: res.message || 'Đã mô phỏng gửi email',
        });
      } else {
        setTestEmailFeedback({
          type: 'accepted',
          message: res.message || 'Máy chủ email đã chấp nhận thư',
        });
      }
      setTestEmailCooldown(res.cooldown_seconds || 60);
      testEmailTimerRef.current = window.setTimeout(() => setTestEmailFeedback(null), 10000);
    } catch (err: any) {
      setTestEmailFeedback({
        type: 'error',
        message: `Lỗi: ${err.message || 'Không thể gửi email thử'}`,
      });
      testEmailTimerRef.current = window.setTimeout(() => setTestEmailFeedback(null), 12000);
    } finally {
      setIsSendingTestEmail(false);
    }
  }, [accessToken]);

  // Tăng generation_id và xóa sạch box cũ
  const resetSessionGeneration = useCallback(() => {
    abortAndResetPendingTracking();
    setAnalysisState('idle');
    setErrorMessage(null);
  }, [abortAndResetPendingTracking]);

  // Helper fetch blob từ URL nội bộ
  const fetchSampleBlob = useCallback(async (url: string): Promise<Blob> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Không thể nạp tệp mẫu từ ${url}`);
    return await res.blob();
  }, []);

  // Chuyển đổi nguồn (Ảnh, Video, Camera)
  const handleChangeSource = useCallback(
    (newSource: SourceType) => {
      if (newSource === sourceType) return;

      // Dừng video đang phát
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setIsPlaying(false);

      // Nếu đang mở webcam và chuyển sang nguồn khác -> giải phóng camera
      if (sourceType === 'camera' && newSource !== 'camera') {
        webcam.stopCamera();
      }

      resetSessionGeneration();
      setSourceType(newSource);

      if (newSource === 'image') {
        setCaption(isSampleAnalyzed ? 'Ảnh mẫu · Đã phân tích' : 'Ảnh mẫu · Chưa phân tích');
      } else if (newSource === 'video') {
        setCaption('Video mẫu · Sẵn sàng phát hiện');
      } else if (newSource === 'camera') {
        setCaption('Webcam · Chưa bật camera');
      }
    },
    [sourceType, webcam, resetSessionGeneration, isSampleAnalyzed]
  );

  // Suy luận cho ảnh tĩnh
  const handleInferImage = useCallback(
    async (targetFile: Blob | File, customCaptionSuffix?: string) => {
      resetSessionGeneration();
      const currentGen = generationIdRef.current;
      setAnalysisState('analyzing');
      setErrorMessage(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await inferImage({
          file: targetFile,
          sessionId: sessionIdRef.current,
          generationId: currentGen,
          confidenceThreshold,
          sourceType: 'image',
          useMock: isMockMode,
          token: accessToken,
          signal: controller.signal,
        });

        if (currentGen !== generationIdRef.current) return;

        setInferenceMs(res.inference_ms);
        setDetections(res.detections);

        if (res.detections.length > 0) {
          setAnalysisState('success');
        } else {
          setAnalysisState('empty');
        }

        const modelLabel = isMockMode
          ? 'Mô phỏng'
          : `Model thật: ${getShortModelName(modelStatus)}`;

        if (customCaptionSuffix) {
          setCaption(`${customCaptionSuffix} (${modelLabel})`);
        } else {
          setCaption(`Ảnh phân tích (${modelLabel})`);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (currentGen !== generationIdRef.current) return;

        setAnalysisState('error');
        setErrorMessage(err.message || 'Lỗi suy luận hình ảnh');
      } finally {
        abortControllerRef.current = null;
      }
    },
    [confidenceThreshold, isMockMode, modelStatus, resetSessionGeneration, accessToken]
  );

  // Phân tích ảnh mẫu mặc định đang xem sẵn lúc vừa mở trang
  const handleAnalyzeCurrentSample = useCallback(async () => {
    try {
      const samplePath =
        activeSample === 'neutral'
          ? '/samples/sample_neutral.jpg'
          : '/samples/sample_fire_smoke.jpg';
      const blob = await fetchSampleBlob(samplePath);
      currentBlobRef.current = blob;
      setIsSampleAnalyzed(true);
      await handleInferImage(blob, 'Ảnh mẫu · Đã phân tích');
    } catch (err: any) {
      setAnalysisState('error');
      setErrorMessage(err.message || 'Không thể đọc tệp mẫu');
    }
  }, [activeSample, fetchSampleBlob, handleInferImage]);

  // Phân tích lại bức ảnh hiện tại (với model mới hoặc ngưỡng mới)
  const handleReinferCurrentImage = useCallback(async () => {
    try {
      let fileToSend: Blob | File | null = currentBlobRef.current;
      if (!fileToSend) {
        const samplePath =
          activeSample === 'neutral'
            ? '/samples/sample_neutral.jpg'
            : '/samples/sample_fire_smoke.jpg';
        fileToSend = await fetchSampleBlob(samplePath);
        currentBlobRef.current = fileToSend;
      }
      setIsSampleAnalyzed(true);
      await handleInferImage(fileToSend, 'Ảnh đã phân tích lại');
    } catch (err: any) {
      setAnalysisState('error');
      setErrorMessage(err.message || 'Lỗi phân tích lại ảnh');
    }
  }, [activeSample, fetchSampleBlob, handleInferImage]);

  // Bấm chọn 1 trong 2 thumbnail mẫu -> đổi ảnh & chạy auto-infer
  const handleSelectSample = useCallback(
    async (type: 'fire_smoke' | 'neutral') => {
      setActiveSample(type);
      const samplePath =
        type === 'neutral' ? '/samples/sample_neutral.jpg' : '/samples/sample_fire_smoke.jpg';
      setImageSrc(samplePath);

      try {
        const blob = await fetchSampleBlob(samplePath);
        currentBlobRef.current = blob;
        setIsSampleAnalyzed(true);
        const title =
          type === 'fire_smoke'
            ? 'Ảnh mẫu: Có lửa hoặc khói · Đã phân tích'
            : 'Ảnh mẫu: Cảnh bình thường · Đã phân tích';
        await handleInferImage(blob, title);
      } catch (err: any) {
        setAnalysisState('error');
        setErrorMessage(err.message || 'Lỗi nạp ảnh mẫu');
      }
    },
    [fetchSampleBlob, handleInferImage]
  );

  // Xử lý nạp ảnh tĩnh từ file máy tính (Tự động nhận diện ngay)
  const handleSelectImageFile = useCallback(
    (file: File) => {
      setActiveSample('custom');
      resetSessionGeneration();
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }

      const url = URL.createObjectURL(file);
      currentBlobRef.current = file;
      setImageSrc(url);
      setCaption(`Ảnh tải lên: ${file.name} · Đang phân tích...`);
      void handleInferImage(file, `Ảnh tải lên: ${file.name} · Đã phân tích`);
    },
    [imageSrc, resetSessionGeneration, handleInferImage]
  );

  // Xử lý nạp video từ file máy tính
  const handleSelectVideoFile = useCallback(
    (file: File) => {
      resetSessionGeneration();
      if (videoSrc && videoSrc.startsWith('blob:')) {
        URL.revokeObjectURL(videoSrc);
      }

      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setIsPlaying(false);
      setCaption(`Video tải lên: ${file.name}`);
    },
    [videoSrc, resetSessionGeneration]
  );

  // Nạp video mẫu
  const handleLoadSampleVideo = useCallback(async () => {
    resetSessionGeneration();
    setVideoSrc('/samples/sample_fire.mp4');
    setCaption('Video mẫu khói cháy rừng');
    setIsPlaying(false);
  }, [resetSessionGeneration]);

  // Xử lý kéo thả tệp vào bất kỳ đâu trên vùng xem lớn
  const handleDropFile = useCallback(
    (file: File) => {
      if (file.type.startsWith('video/')) {
        if (sourceType !== 'video') setSourceType('video');
        handleSelectVideoFile(file);
      } else {
        if (sourceType !== 'image') setSourceType('image');
        handleSelectImageFile(file);
      }
    },
    [sourceType, handleSelectVideoFile, handleSelectImageFile]
  );

  // Bật/tắt nhận diện AI độc lập
  const handleToggleDetectionActive = useCallback(
    (active: boolean) => {
      setIsDetectionActive(active);
      if (!active) {
        abortAndResetPendingTracking();
      }
    },
    [abortAndResetPendingTracking]
  );

  // Đổi tốc độ phát video
  const handleChangePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, []);

  // Toàn màn hình
  const handleToggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch((err) => console.warn(err));
    } else {
      document.exitFullscreen?.().catch((err) => console.warn(err));
    }
  }, []);

  // Hàm chụp 1 frame từ <video> và gửi suy luận
  const captureAndInferFrame = useCallback(
    async (targetTimeMs: number) => {
      const video = videoRef.current;
      if (!video || isInferringRef.current) return;

      const videoW = video.videoWidth;
      const videoH = video.videoHeight;
      if (!videoW || !videoH) return;

      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
      }
      const canvas = offscreenCanvasRef.current;

      const maxW = 640;
      const scale = Math.min(1.0, maxW / videoW);
      const targetW = Math.round(videoW * scale);
      const targetH = Math.round(videoH * scale);

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, targetW, targetH);

      // Khóa ngay trước canvas.toBlob để tránh chồng lấp nhiều frame nếu toBlob mất thời gian
      isInferringRef.current = true;
      if (fpsWindowStartRef.current === 0) {
        fpsWindowStartRef.current = performance.now();
      }

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            isInferringRef.current = false;
            return;
          }

          const currentGen = generationIdRef.current;
          frameIdCounterRef.current += 1;
          const currentFrameId = frameIdCounterRef.current;

          const controller = new AbortController();
          abortControllerRef.current = controller;

          try {
            // Luôn gọi API với ngưỡng tối đa 0.20 để bước Confirm nhận đủ các box > 0.20
            const apiThreshold = Math.min(confidenceThreshold, 0.20);
            const res = await inferImage({
              file: blob,
              sessionId: sessionIdRef.current,
              generationId: currentGen,
              frameId: currentFrameId,
              timestampMs: targetTimeMs,
              confidenceThreshold: apiThreshold,
              sourceType: sourceType,
              useMock: isMockMode,
              token: accessToken,
              signal: controller.signal,
            });

            if (currentGen !== generationIdRef.current) return;

            if (sourceType === 'video' && videoRef.current) {
              const currentVideoMs = videoRef.current.currentTime * 1000;
              const ageDiff = Math.abs(currentVideoMs - targetTimeMs);
              if (ageDiff > timestampToleranceMs) return;
            }

            // 1. Chạy bước Confirm qua FireAlertTracker với đầy đủ các box >= 0.20
            const trackerRes = trackerRef.current.processFrame(
              res.detections,
              targetTimeMs,
              {
                isMock: isMockMode,
                isVideo: sourceType === 'video',
                modelKey: modelStatus?.model_path || '',
              }
            );

            // Đánh dấu pending cho cảnh báo mới nếu người dùng bật nhận email
            const updatedAlerts = trackerRes.allAlerts.map((alt) => {
              if (
                trackerRes.newAlerts.some((na) => na.id === alt.id) &&
                accessToken &&
                userPreferences?.email_alerts_enabled &&
                !isMockMode
              ) {
                return {
                  ...alt,
                  emailDispatchStatus: alt.emailDispatchStatus || 'pending',
                };
              }
              return alt;
            });

            setAlerts(updatedAlerts);
            setActiveAlert(
              trackerRes.activeAlerts.length > 0 ? trackerRes.activeAlerts[0] : null
            );

            // 2. Lọc box hiển thị theo thanh trượt confidenceThreshold của người dùng,
            // nhưng luôn giữ và đánh dấu nổi bật các vùng lửa đã được xác nhận cảnh báo
            const displayedDetections: DetectionItem[] = res.detections
              .map((d) => {
                const isConfirmed =
                  d.class_name.toLowerCase() === 'fire' &&
                  trackerRef.current.isBoxConfirmed(d.box);
                return isConfirmed ? { ...d, isConfirmedFire: true } : d;
              })
              .filter((d) => d.confidence >= confidenceThreshold || d.isConfirmedFire);

            setInferenceMs(res.inference_ms);
            setDetections(displayedDetections);

            if (displayedDetections.length > 0) {
              setAnalysisState('success');
            } else {
              setAnalysisState('empty');
            }

            fpsFrameCountRef.current += 1;
            const now = performance.now();
            const elapsed = (now - fpsWindowStartRef.current) / 1000;
            if (elapsed >= 1.0) {
              setMeasuredFps(Math.round((fpsFrameCountRef.current / elapsed) * 10) / 10);
              fpsFrameCountRef.current = 0;
              fpsWindowStartRef.current = now;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            if (currentGen !== generationIdRef.current) return;
            if (err instanceof ApiError && err.code === 'model_not_ready') {
              setAnalysisState('error');
              setErrorMessage(err.message);
            }
          } finally {
            if (abortControllerRef.current === controller) {
              isInferringRef.current = false;
              abortControllerRef.current = null;
            }
          }
        },
        'image/jpeg',
        0.85
      );
    },
    [
      confidenceThreshold,
      isMockMode,
      sourceType,
      timestampToleranceMs,
      accessToken,
      userPreferences,
      modelStatus?.model_path,
    ]
  );

  // Xử lý tua timeline video (đặt sau captureAndInferFrame để closure luôn mới)
  const handleSeek = useCallback(
    (newTime: number) => {
      abortAndResetPendingTracking();
      if (videoRef.current && videoRef.current.paused && isDetectionActive) {
        captureAndInferFrame(newTime * 1000);
      }
    },
    [isDetectionActive, abortAndResetPendingTracking, captureAndInferFrame]
  );

  // Vòng lặp lấy mẫu frame Video hoặc Webcam
  useEffect(() => {
    let animId: number | null = null;
    let isActive = true;

    const intervalMs = Math.round(1000 / targetFps);

    const loop = () => {
      if (!isActive) return;
      const now = performance.now();
      const isSourceActive =
        sourceType === 'video'
          ? isPlaying && isDetectionActive && videoRef.current && !videoRef.current.paused
          : sourceType === 'camera'
          ? webcam.isStreaming && isDetectionActive
          : false;

      if (isSourceActive && now - lastCaptureTimeRef.current >= intervalMs) {
        lastCaptureTimeRef.current = now;
        const currentMediaTimeMs =
          sourceType === 'video' && videoRef.current
            ? videoRef.current.currentTime * 1000
            : now;
        captureAndInferFrame(currentMediaTimeMs);
      }

      if (isActive) {
        animId = requestAnimationFrame(loop);
      }
    };

    if (sourceType === 'video' || sourceType === 'camera') {
      animId = requestAnimationFrame(loop);
    }

    return () => {
      isActive = false;
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
    };
  }, [
    sourceType,
    isPlaying,
    isDetectionActive,
    webcam.isStreaming,
    targetFps,
    captureAndInferFrame,
  ]);

  // Cập nhật caption khi webcam bật/tắt
  useEffect(() => {
    if (sourceType === 'camera') {
      if (webcam.isStreaming) {
        setCaption('Webcam trực tiếp · Đang nhận diện');
      } else {
        setCaption('Webcam · Chưa bật camera');
      }
    }
  }, [sourceType, webcam.isStreaming]);

  // Tự động nạp demo qua URL (?demo=fire)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'fire') {
      setIsMockMode(true);
      void handleSelectSample('fire_smoke');
    }
  }, [handleSelectSample]);

  return (
    <div className="editorial-app-layout">
      {/* Hidden file inputs cho nút đổi ảnh/video */}
      <input
        ref={hiddenImageFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleSelectImageFile(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />
      <input
        ref={hiddenVideoFileInputRef}
        type="file"
        accept="video/mp4,video/webm"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleSelectVideoFile(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {/* 1. Header */}
      <Header
        isConnected={isConnected}
        isChecking={isChecking}
        modelStatus={modelStatus}
        isMockMode={isMockMode}
        onToggleMockMode={(mock) => {
          setIsMockMode(mock);
          resetSessionGeneration();
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onSignOut={signOut}
      />

      {/* 2. Workspace Container */}
      <div className="editorial-container">
        {/* Tiêu đề Serif lớn và Thanh chọn Tab Nguồn */}
        <SourceTabs
          activeSource={sourceType}
          onChangeSource={handleChangeSource}
        />

        {/* 3. Bố cục 2 cột: Vùng xem lớn (trái) và Bảng thao tác & kết quả (phải) */}
        <main className="editorial-workspace-grid">
          {/* Cột trái: Vùng xem lớn + Thanh điều khiển AI & Media */}
          <section
            className="editorial-viewer-column"
            aria-label="Khu vực hiển thị hình ảnh và nhận diện"
          >
            <MediaViewer
              sourceType={sourceType}
              imageSrc={imageSrc}
              videoSrc={videoSrc}
              webcamStream={webcam.stream}
              isCameraActive={webcam.isStreaming}
              caption={caption}
              onDropFile={handleDropFile}
              videoRef={videoRef}
              imageRef={imageRef}
              containerRef={containerRef}
              detections={detections}
              showBoxes={showBoxes}
              showLabels={showLabels}
              isMockMode={isMockMode}
              highlightedIndex={highlightedIndex}
              isMirrored={isMirrored}
              isAnalyzing={analysisState === 'analyzing'}
              activeAlert={activeAlert}
              onVideoPlay={() => setIsPlaying(true)}
              onVideoPause={() => setIsPlaying(false)}
              onVideoSeeked={() => {
                if (videoRef.current) handleSeek(videoRef.current.currentTime);
              }}
              onVideoEnded={() => setIsPlaying(false)}
            />

            {/* Thanh điều khiển AI ngay dưới khung xem */}
            <Toolbar
              sourceType={sourceType}
              isDetectionActive={isDetectionActive}
              onToggleDetectionActive={handleToggleDetectionActive}
              showBoxes={showBoxes}
              onToggleShowBoxes={() => setShowBoxes((prev) => !prev)}
              confidenceThreshold={confidenceThreshold}
              onChangeConfidence={setConfidenceThreshold}
              onReinferImage={handleReinferCurrentImage}
              isAnalyzing={analysisState === 'analyzing'}
              onChangeImageFile={() => hiddenImageFileInputRef.current?.click()}
              playbackRate={playbackRate}
              onChangePlaybackRate={handleChangePlaybackRate}
              onChangeVideoFile={() => hiddenVideoFileInputRef.current?.click()}
              isCameraActive={webcam.isStreaming}
              onStartCamera={() => webcam.startCamera()}
              onStopCamera={() => {
                webcam.stopCamera();
                resetSessionGeneration();
              }}
              isMirrored={isMirrored}
              onToggleMirror={() => setIsMirrored((prev) => !prev)}
              cameraDevices={webcam.devices}
              selectedDeviceId={webcam.selectedDeviceId}
              onSelectDeviceId={(id) => {
                webcam.setSelectedDeviceId(id);
                webcam.startCamera(id);
              }}
              onToggleFullscreen={handleToggleFullscreen}
            />
          </section>

          {/* Cột phải: Nguồn -> Mẫu thử -> Kết quả */}
          <ResultPanel
            sourceType={sourceType}
            analysisState={analysisState}
            errorMessage={errorMessage}
            detections={detections}
            inferenceMs={inferenceMs}
            measuredFps={measuredFps}
            isMockMode={isMockMode}
            highlightedIndex={highlightedIndex}
            onHoverDetection={setHighlightedIndex}
            modelStatus={modelStatus}
            isDetectionActive={isDetectionActive}
            isPlaying={isPlaying}
            isCameraActive={webcam.isStreaming}
            confidenceThreshold={confidenceThreshold}
            alerts={alerts}
            onSelectImageFile={handleSelectImageFile}
            onSelectVideoFile={handleSelectVideoFile}
            onSelectSample={handleSelectSample}
            onAnalyzeCurrentSample={handleAnalyzeCurrentSample}
            activeSample={activeSample}
            isSampleAnalyzed={isSampleAnalyzed}
            onLoadSampleVideo={handleLoadSampleVideo}
            onStartCamera={() => webcam.startCamera()}
            onStopCamera={() => {
              webcam.stopCamera();
              resetSessionGeneration();
            }}
            cameraDevices={webcam.devices}
            selectedDeviceId={webcam.selectedDeviceId}
            onSelectDeviceId={(id) => {
              webcam.setSelectedDeviceId(id);
              webcam.startCamera(id);
            }}
          />
        </main>
      </div>

      {/* 4. Modal Cài đặt Nâng cao */}
      <AdvancedSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        modelStatus={modelStatus}
        health={health}
        confidenceThreshold={confidenceThreshold}
        onChangeConfidence={setConfidenceThreshold}
        targetFps={targetFps}
        onChangeTargetFps={setTargetFps}
        timestampToleranceMs={timestampToleranceMs}
        onChangeTolerance={setTimestampToleranceMs}
        showLabels={showLabels}
        onToggleShowLabels={() => setShowLabels((prev) => !prev)}
        onRefreshStatus={refreshStatus}
        onModelSwitched={abortAndResetPendingTracking}
        isMockMode={isMockMode}
        onToggleMockMode={setIsMockMode}
        user={user}
        userPreferences={userPreferences}
        onToggleEmailAlerts={handleToggleEmailAlerts}
        onSendTestEmail={handleSendTestEmail}
        onSignOut={signOut}
        onOpenAuth={() => {
          setIsSettingsOpen(false);
          setIsAuthModalOpen(true);
        }}
        testEmailCooldown={testEmailCooldown}
        isSendingTestEmail={isSendingTestEmail}
        testEmailFeedback={testEmailFeedback}
      />

      {/* 5. Modal Đăng nhập Supabase OTP */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSignInSuccess={() => setIsAuthModalOpen(false)}
        signInWithOtp={signInWithOtp}
        verifyOtp={verifyOtp}
        isMockAuth={isMockAuth}
      />
    </div>
  );
}

export default App;
