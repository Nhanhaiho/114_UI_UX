import { useState, useEffect, useCallback } from 'react';
import { checkHealth, getModelStatus } from '../services/api';
import type { BackendHealth, ModelStatus } from '../types';

export function useBackendStatus() {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [lastCheckError, setLastCheckError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [hRes, mRes] = await Promise.all([
        checkHealth(),
        getModelStatus(),
      ]);
      setHealth(hRes);
      setModelStatus(mRes);
      setIsConnected(true);
      setLastCheckError(null);
    } catch (err: any) {
      setIsConnected(false);
      setHealth(null);
      setModelStatus(null);
      setLastCheckError(err.message || 'Không thể kết nối đến backend');
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    health,
    modelStatus,
    isConnected,
    isChecking,
    lastCheckError,
    refreshStatus: fetchStatus,
  };
}
