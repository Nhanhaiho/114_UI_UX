import { useState, useEffect, useCallback, useRef } from 'react';

export function useWebcam() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Lấy danh sách thiết bị camera
  const updateDeviceList = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return;
      }
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoDevs);
      if (videoDevs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevs[0].deviceId);
      }
    } catch (e) {
      console.warn('Không thể liệt kê danh sách camera:', e);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    updateDeviceList();
  }, [updateDeviceList]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    setStream(null);
    setIsStreaming(false);
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      stopCamera();
      setError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Trình duyệt của bạn không hỗ trợ API getUserMedia hoặc kết nối không phải HTTPS/localhost.');
        return;
      }

      const targetDeviceId = deviceId || selectedDeviceId;
      const constraints: MediaStreamConstraints = {
        video: targetDeviceId
          ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      try {
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = newStream;
        setStream(newStream);
        setIsStreaming(true);
        updateDeviceList();
      } catch (err: any) {
        let msg = 'Không thể mở webcam.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = 'Quyền truy cập camera bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = 'Không tìm thấy thiết bị camera nào được kết nối với máy tính.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          msg = 'Camera đang bị ứng dụng khác sử dụng hoặc bị lỗi phần cứng.';
        }
        setError(msg);
        setIsStreaming(false);
      }
    },
    [selectedDeviceId, stopCamera, updateDeviceList]
  );

  // Giải phóng khi unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    stream,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    isStreaming,
    error,
    startCamera,
    stopCamera,
  };
}

