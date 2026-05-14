/**
 * Hook để theo dõi trạng thái kết nối của tất cả socket managers
 * Hữu ích cho debugging, monitoring, và hiển thị status UI
 */

import { useEffect, useState, useRef } from 'react';
import { SocketManager } from '@/lib/socket';

import { useSocket } from '@/context/socket-context';

/**
 * Hook theo dõi trạng thái kết nối socket cho monitoring
 */
export function useSocketStatusMonitor() {
  const { statusMap } = useSocket();

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
