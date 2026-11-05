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
import { createSampleImageBlob } from './utils/sampleMedia';
import type {
  SourceType,
  DetectionItem,
  AnalysisState,
} from './types';

export function App() {
  // 1. Trạng thái Backend & Mô hình
  const { health, modelStatus, isConnected, isChecking } = useBackendStatus();
  const [isMockMode, setIsMockMode] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // 2. Trạng thái Nguồn Media
  const [sourceType, setSourceType] = useState<SourceType>('image');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  // Webcam Hook
  const webcam = useWebcam();
  const [isMirrored, setIsMirrored] = useState<boolean>(false);

  // 3. Trạng thái Trình phát Video
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
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

  // Refs điều khiển vòng lặp và đồng bộ
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Tự động nạp mẫu khi có tham số URL ?demo=fire (hữu ích cho kiểm thử & chụp màn hình nghiệm thu)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'fire') {
      setIsMockMode(true);
      void createSampleImageBlob(true).then((blob) => {
        const sampleFile = new File([blob], 'sample_fire.jpg', { type: 'image/jpeg' });
        const url = URL.createObjectURL(sampleFile);
        setImageFile(sampleFile);
        setImageSrc(url);
        setAnalysisState('analyzing');
        void inferImage({
          file: sampleFile,
          sessionId: 'session-demo',
          generationId: 1,
          confidenceThreshold: 0.25,
          useMock: true,
        })
          .then((res) => {
            setInferenceMs(res.inference_ms);
            setDetections(res.detections);
            setAnalysisState(res.detections.length > 0 ? 'success' : 'empty');
          })
          .catch((err) => {
            setAnalysisState('error');
            setErrorMessage(err.message);
          });
      });
    }
  }, []);

  // Tăng generation_id và xóa sạch box cũ
  const resetSessionGeneration = useCallback(() => {
    generationIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isInferringRef.current = false;
    setDetections([]);
    setAnalysisState('idle');
    setErrorMessage(null);
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
    },
    [sourceType, webcam, resetSessionGeneration]
  );

  // Xử lý nạp ảnh tĩnh từ file
  const handleSelectImageFile = useCallback(
    (file: File) => {
      resetSessionGeneration();
      if (imageSrc) URL.revokeObjectURL(imageSrc);

      const url = URL.createObjectURL(file);
      setImageFile(file);
      setImageSrc(url);
    },
    [imageSrc, resetSessionGeneration]
  );

  // Xử lý nạp ảnh mẫu nhanh
  const handleLoadSample = useCallback(
    async (hasFire: boolean) => {
      resetSessionGeneration();
      if (imageSrc) URL.revokeObjectURL(imageSrc);

      const blob = await createSampleImageBlob(hasFire);
      const sampleFile = new File([blob], hasFire ? 'sample_fire.jpg' : 'sample_safe.jpg', {
        type: 'image/jpeg',
      });
      const url = URL.createObjectURL(sampleFile);
      setImageFile(sampleFile);
      setImageSrc(url);
    },
    [imageSrc, resetSessionGeneration]
  );

  // Xử lý nạp video từ file
  const handleSelectVideoFile = useCallback(
    (file: File) => {
      resetSessionGeneration();
      if (videoSrc) URL.revokeObjectURL(videoSrc);

      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoSrc(url);
      setCurrentTime(0);
      setIsPlaying(false);
    },
    [videoSrc, resetSessionGeneration]
  );

  // Suy luận cho ảnh tĩnh
  const handleInferImage = useCallback(async () => {
    if (!imageFile) return;

    resetSessionGeneration();
    const currentGen = generationIdRef.current;
    setAnalysisState('analyzing');
    setErrorMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await inferImage({
        file: imageFile,
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
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (currentGen !== generationIdRef.current) return;

      setAnalysisState('error');
      setErrorMessage(err.message || 'Lỗi suy luận hình ảnh');
    } finally {
      abortControllerRef.current = null;
    }
  }, [imageFile, confidenceThreshold, isMockMode, resetSessionGeneration]);

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

      // Giới hạn chiều rộng tối đa 640px cho suy luận hiệu năng cao
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
            const res = await inferImage({
              file: blob,
              sessionId: sessionIdRef.current,
              generationId: currentGen,
              frameId: currentFrameId,
              timestampMs: targetTimeMs,
              confidenceThreshold,
              useMock: isMockMode,
              signal: controller.signal,
            });

            // Nếu người dùng đã tua hoặc đổi video trong lúc chờ response -> bỏ qua
            if (currentGen !== generationIdRef.current) {
              return;
            }

            // Kiểm tra dung sai thời gian nếu là video
            if (sourceType === 'video' && videoRef.current) {
              const currentVideoMs = videoRef.current.currentTime * 1000;
              const ageDiff = Math.abs(currentVideoMs - targetTimeMs);
              if (ageDiff > timestampToleranceMs) {
                // Quá hạn dung sai -> bỏ kết quả để không vẽ box lệch thời điểm
                return;
              }
            }

            setInferenceMs(res.inference_ms);
            setDetections(res.detections);

            if (res.detections.length > 0) {
              setAnalysisState('success');
            } else {
              setAnalysisState('empty');
            }

            // Đo FPS thực tế
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
  }, [sourceType, isPlaying, isDetectionActive, webcam.isStreaming, targetFps, captureAndInferFrame]);

  // Điều khiển Video: Play/Pause
  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch((err) => console.warn(err));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  // Điều khiển Video: Tua timeline
  const handleSeek = useCallback(
    (newTime: number) => {
      const video = videoRef.current;
      if (!video) return;

      // 1. Tăng generation_id để hủy kết quả cũ
      generationIdRef.current += 1;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isInferringRef.current = false;

      // 2. Xóa sạch box cũ ngay lập tức
      setDetections([]);

      // 3. Cập nhật vị trí phát video
      video.currentTime = newTime;
      setCurrentTime(newTime);

      // 4. Nếu video đang dừng và nhận diện đang bật, phân tích frame tại vị trí mới này
      if (video.paused && isDetectionActive) {
        captureAndInferFrame(newTime * 1000);
      }
    },
    [isDetectionActive, captureAndInferFrame]
  );


  // Điều khiển Tốc độ phát
  const handleChangePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, []);

  // Điều khiển Âm lượng
  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol);
    setIsMuted(vol === 0);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
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

  // Phím tắt bàn phím: Phím cách để Play/Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.code === 'Space' && sourceType === 'video') {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sourceType, handleTogglePlay]);

  const hasMedia =
    (sourceType === 'image' && !!imageSrc) ||
    (sourceType === 'video' && !!videoSrc) ||
    (sourceType === 'camera' && webcam.isStreaming);

  const canInferImage =
    !!imageFile && (isMockMode || (isConnected && (modelStatus?.is_ready ?? false)));

  return (
    <div className="app-layout">
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

      {/* 2. Nội dung chính: 2 cột (Khung Media 70% | Panel Kết quả 30%) */}
      <main className="app-main-workspace">
        <div className="media-workspace-left">
          {/* Tab chọn nguồn: Ảnh / Video / Camera */}
          <SourceTabs
            activeSource={sourceType}
            onChangeSource={handleChangeSource}
          />

          {/* Khung xem Media trung tâm */}
          <MediaViewer
            sourceType={sourceType}
            imageSrc={imageSrc}
            videoSrc={videoSrc}
            webcamStream={webcam.stream}
            hasMedia={hasMedia}
            onFileSelect={(file) => {
              if (sourceType === 'video') handleSelectVideoFile(file);
              else handleSelectImageFile(file);
            }}
            onLoadSample={handleLoadSample}
            onStartCamera={() => webcam.startCamera()}
            cameraError={webcam.error}
            cameraDevices={webcam.devices}
            selectedDeviceId={webcam.selectedDeviceId}
            onSelectDeviceId={(id) => {
              webcam.setSelectedDeviceId(id);
              webcam.startCamera(id);
            }}
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
            onVideoTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onVideoLoadedMetadata={() => {
              if (videoRef.current) setDuration(videoRef.current.duration);
            }}
            onVideoEnded={() => setIsPlaying(false)}
          />

          {/* Thanh công cụ Toolbar dưới Media */}
          {hasMedia && (
            <Toolbar
              sourceType={sourceType}
              onInferImage={handleInferImage}
              isAnalyzing={analysisState === 'analyzing'}
              canInferImage={canInferImage}
              onChangeFile={() => {
                if (sourceType === 'image') {
                  setImageFile(null);
                  setImageSrc(null);
                } else if (sourceType === 'video') {
                  setVideoFile(null);
                  setVideoSrc(null);
                }
                resetSessionGeneration();
              }}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              playbackRate={playbackRate}
              onChangePlaybackRate={handleChangePlaybackRate}
              volume={volume}
              isMuted={isMuted}
              onVolumeChange={handleVolumeChange}
              onToggleMute={handleToggleMute}
              onStopCamera={() => {
                webcam.stopCamera();
                resetSessionGeneration();
              }}
              isMirrored={isMirrored}
              onToggleMirror={() => setIsMirrored((prev) => !prev)}
              isDetectionActive={isDetectionActive}
              onToggleDetectionActive={setIsDetectionActive}
              showBoxes={showBoxes}
              onToggleShowBoxes={() => setShowBoxes((prev) => !prev)}
              confidenceThreshold={confidenceThreshold}
              onChangeConfidence={setConfidenceThreshold}
              onToggleFullscreen={handleToggleFullscreen}
            />
          )}
        </div>

        {/* Cột phải: Panel kết quả phân tích nguồn hiện tại */}
        <ResultPanel
          analysisState={analysisState}
          errorMessage={errorMessage}
          detections={detections}
          inferenceMs={inferenceMs}
          measuredFps={measuredFps}
          isMockMode={isMockMode}
          highlightedIndex={highlightedIndex}
          onHoverDetection={setHighlightedIndex}
          isVideoOrCamera={sourceType === 'video' || sourceType === 'camera'}
        />
      </main>

      {/* 3. Modal Cài đặt Nâng cao */}
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
      />
    </div>
  );
}

export default App;
