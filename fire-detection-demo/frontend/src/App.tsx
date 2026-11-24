import { useState, useRef, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SourceTabs } from './components/SourceTabs';
import { MediaViewer } from './components/MediaViewer';
import { Toolbar } from './components/Toolbar';
import { ResultPanel } from './components/ResultPanel';
import { AdvancedSettingsModal } from './components/AdvancedSettingsModal';
import { useBackendStatus } from './hooks/useBackendStatus';
import { useWebcam } from './hooks/useWebcam';
import { inferImage, ApiError } from './services/api';
import { FireAlertTracker } from './utils/fireAlertTracker';
import type {
  SourceType,
  DetectionItem,
  AnalysisState,
  FireAlertEvent,
} from './types';

export function App() {
  // 1. Trạng thái Backend & Mô hình
  const { health, modelStatus, isConnected, isChecking, refreshStatus } = useBackendStatus();
  const [isMockMode, setIsMockMode] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // 2. Trạng thái Nguồn Media
  const [sourceType, setSourceType] = useState<SourceType>('image');
  const [imageSrc, setImageSrc] = useState<string>('/samples/sample_fire_smoke.jpg');
  const [caption, setCaption] = useState<string>('Ảnh mẫu · Chưa phân tích');
  const [activeSample, setActiveSample] = useState<'fire_smoke' | 'neutral' | 'custom'>('fire_smoke');
  const [isSampleAnalyzed, setIsSampleAnalyzed] = useState<boolean>(false);
  const currentBlobRef = useRef<Blob | File | null>(null);

  const [, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>('/samples/sample_fire.mp4');

  // Webcam Hook
  const webcam = useWebcam();
  const [isMirrored, setIsMirrored] = useState<boolean>(false);

  // 3. Trạng thái Trình phát Video
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [, setCurrentTime] = useState<number>(0);
  const [, setDuration] = useState<number>(0);
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
  const sessionIdRef = useRef<string>('session-demo');
  const generationIdRef = useRef<number>(1);
  const frameIdCounterRef = useRef<number>(0);
  const isInferringRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCaptureTimeRef = useRef<number>(0);

  // Bộ tính FPS thực tế
  const fpsFrameCountRef = useRef<number>(0);
  const fpsWindowStartRef = useRef<number>(0);

  const getShortModelName = useCallback(
    (status: typeof modelStatus) => {
      if (!status?.is_ready) return 'Chưa nạp';
      const name = status.model_name || status.model_path || '';
      if (name.includes('26n') || name.toLowerCase().includes('best')) return 'YOLO26n';
      if (name.includes('P2+SRC')) return 'YOLO-SRC';
      if (name.includes('v10') || name.includes('V10')) return 'YOLOv10';
      if (name.includes('v8') || name.includes('V8')) return 'YOLOv8';
      if (name.includes('v11') || name.includes('V11')) return 'YOLOv11';
      return name.split(' ')[0] || 'YOLO';
    },
    []
  );

  // Tăng generation_id và xóa sạch box cũ
  const resetSessionGeneration = useCallback(() => {
    generationIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isInferringRef.current = false;
    trackerRef.current.resetPending();
    setActiveAlert(null);
    setDetections([]);
    setAnalysisState('idle');
    setErrorMessage(null);
  }, []);

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
          useMock: isMockMode,
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
    [confidenceThreshold, isMockMode, modelStatus, getShortModelName, resetSessionGeneration]
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
      setVideoFile(file);
      setVideoSrc(url);
      setCurrentTime(0);
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
    setCurrentTime(0);
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
  const handleToggleDetectionActive = useCallback((active: boolean) => {
    setIsDetectionActive(active);
    if (!active) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isInferringRef.current = false;
      trackerRef.current.resetPending();
      setActiveAlert(null);
      setDetections([]);
    }
  }, []);

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

  // Xử lý tua timeline video
  const handleSeek = useCallback(
    (newTime: number) => {
      generationIdRef.current += 1;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isInferringRef.current = false;
      trackerRef.current.resetPending();
      setActiveAlert(null);
      setDetections([]);

      if (videoRef.current && videoRef.current.paused && isDetectionActive) {
        captureAndInferFrame(newTime * 1000);
      }
    },
    [isDetectionActive]
  );

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

      canvas.toBlob(
        async (blob) => {
          if (!blob) return;

          const currentGen = generationIdRef.current;
          isInferringRef.current = true;
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
              useMock: isMockMode,
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
              { isMock: isMockMode, isVideo: sourceType === 'video' }
            );

            setAlerts(trackerRes.allAlerts);
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
            isInferringRef.current = false;
            abortControllerRef.current = null;
          }
        },
        'image/jpeg',
        0.85
      );
    },
    [confidenceThreshold, isMockMode, sourceType, timestampToleranceMs]
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
              onVideoTimeUpdate={() => {
                if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
              }}
              onVideoLoadedMetadata={() => {
                if (videoRef.current) setDuration(videoRef.current.duration);
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
        isMockMode={isMockMode}
        onToggleMockMode={setIsMockMode}
      />
    </div>
  );
}

export default App;
