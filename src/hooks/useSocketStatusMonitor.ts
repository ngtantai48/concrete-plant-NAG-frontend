/**
 * Hook để theo dõi trạng thái kết nối của tất cả socket managers
 * Hữu ích cho debugging, monitoring, và hiển thị status UI
 */

import { useEffect, useState, useRef } from 'react';
import { SocketManager } from '@/lib/socket';

export interface SocketStatusInfo {
  namespace: string;
  isConnected: boolean;
  lastError?: string;
  reconnectAttempts: number;
}

/**
 * Hook theo dõi trạng thái kết nối socket cho monitoring
 */
export function useSocketStatusMonitor(namespaces: string[] = ['notifications', 'updates']) {
  const [statusMap, setStatusMap] = useState<Record<string, SocketStatusInfo>>({});
  const managersRef = useRef<Map<string, SocketManager>>(new Map());

  useEffect(() => {
    const updates: Record<string, SocketStatusInfo> = {};

    namespaces.forEach((namespace) => {
      try {
        const manager = SocketManager.getInstance(namespace);
        managersRef.current.set(namespace, manager);

        updates[namespace] = {
          namespace,
          isConnected: manager.isConnected,
          reconnectAttempts: 0,
        };

        const unsubscribe = manager.onConnectionChange((connected) => {
          setStatusMap((prev) => ({
            ...prev,
            [namespace]: {
              ...prev[namespace],
              namespace,
              isConnected: connected,
              lastError: connected ? undefined : prev[namespace]?.lastError,
            },
          }));
        });

        return unsubscribe;
      } catch (error) {
        updates[namespace] = {
          namespace,
          isConnected: false,
          lastError: error instanceof Error ? error.message : 'Unknown error',
          reconnectAttempts: 0,
        };
      }
    });

    setStatusMap(updates);

    return () => {
      managersRef.current.clear();
    };
  }, [namespaces.join(',')]); // Only re-run if namespaces change

  return {
    statusMap,
    allConnected: Object.values(statusMap).every((s) => s?.isConnected),
    anyDisconnected: Object.values(statusMap).some((s) => !s?.isConnected),
  };
}

/**
 * Hook để log socket events cho debugging (chỉ dùng trong development)
 */
export function useSocketEventLogger(enabled = false) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabledRef.current || process.env.NODE_ENV !== 'development') {
      return;
    }

    const originalEmit = console.log;
    
    // Chỉ log trong development
    const logPrefix = '[Socket Debug]';
    
    // Bạn có thể thêm logic logging ở đây nếu cần
    // Ví dụ: tạo một event bus để track tất cả socket events

    return () => {
      // Cleanup nếu cần
    };
  }, []);
}
