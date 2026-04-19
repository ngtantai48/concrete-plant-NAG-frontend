import { useAppSelector } from "@/hooks/use-app-selector";
import { SocketManager } from "@/lib/socket";
import { validateUpdateSignal } from "@/lib/socket/schema";
import type { UpdateSignal } from "@/lib/socket/types";
import { useEffect, useRef, useState } from "react";

const REFRESH_COOLDOWN_MS = 800;

export function useRealtimeUpdates(onUpdate: (signal?: UpdateSignal) => void) {
  const managerRef = useRef<SocketManager | null>(null);
  const prevTokenRef = useRef<string | undefined>(undefined);
  const onUpdateRef = useRef(onUpdate);
  const lastRefreshRef = useRef(0);
  const pendingRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onUpdateRef.current = onUpdate;

  const [isConnected, setIsConnected] = useState(false);
  const [lastSignal, setLastSignal] = useState<UpdateSignal | null>(null);
  const [lastSignalTime, setLastSignalTime] = useState<Date | null>(null);
  const lastSignalTimeRef = useRef<Date | null>(null);

  const tokenState = useAppSelector((state: any) => state.auth.token);

  // Initialize socket manager (singleton)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SOCKET_URL || !tokenState) return;

    const manager = SocketManager.getInstance('updates', {
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
    });

    // Set auth provider cho token refresh
    manager.setAuthProvider(() => tokenState);

    managerRef.current = manager;

    // Connection state listener
    const unsubscribeConnection = manager.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (connected) {
        console.log("[RealtimeUpdates] Da ket noi toi /updates");
      } else {
        console.warn("[RealtimeUpdates] Bi ngat ket noi");
      }
    });

    // Token đổi (refresh) thì force reconnect để handshake với token mới.
    // Lần đầu chỉ connect bình thường.
    const prevToken = prevTokenRef.current;
    prevTokenRef.current = tokenState;

    if (prevToken && prevToken !== tokenState) {
      manager.reconnect();
    } else {
      manager.connect();
    }

    return () => {
      unsubscribeConnection();
    };
  }, [tokenState]);

  // Setup event listeners
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !isConnected) return;

    const unsubscribes: Array<() => void> = [];

    // Throttled refresh function
    const triggerRefresh = (signal: UpdateSignal) => {
      setLastSignal(signal);
      const nowDt = new Date();
      setLastSignalTime(nowDt);
      lastSignalTimeRef.current = nowDt;

      const now = Date.now();
      const elapsed = now - lastRefreshRef.current;

      if (elapsed >= REFRESH_COOLDOWN_MS) {
        lastRefreshRef.current = now;
        onUpdateRef.current(signal);
        return;
      }

      if (pendingRefreshRef.current) {
        clearTimeout(pendingRefreshRef.current);
      }

      pendingRefreshRef.current = setTimeout(() => {
        lastRefreshRef.current = Date.now();
        onUpdateRef.current(signal);
        pendingRefreshRef.current = null;
      }, REFRESH_COOLDOWN_MS - elapsed);
    };

    // 'update' event
    unsubscribes.push(
      manager.on('update', (payload: unknown) => {
        const signal = validateUpdateSignal('update', payload);
        if (!signal) return;

        console.log("[RealtimeUpdates] Received update event:", signal);
        triggerRefresh(signal);
      })
    );

    // 'ping' event
    unsubscribes.push(
      manager.on('ping', (payload: unknown) => {
        const signal = validateUpdateSignal('ping', payload);
        if (!signal) return;

        console.log("[RealtimeUpdates] Received ping event:", signal);
        triggerRefresh(signal);
      })
    );

    // Catch-all for other events (excluding update/ping)
    unsubscribes.push(
      manager.onAny((eventName, payload) => {
        // DIAGNOSTIC: log raw event name for every event on /updates
        console.log('[updates raw]', eventName, payload);

        if (eventName === 'update' || eventName === 'ping') {
          return; // Already handled above
        }

        const signal = validateUpdateSignal(eventName, payload);
        if (!signal) {
          console.warn(`[RealtimeUpdates] Event "${eventName}" filtered by validateUpdateSignal`);
          return;
        }

        console.log(`[RealtimeUpdates] Received event ${eventName}:`, payload);
        triggerRefresh(signal);
      })
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());

      if (pendingRefreshRef.current) {
        clearTimeout(pendingRefreshRef.current);
        pendingRefreshRef.current = null;
      }
    };
  }, [isConnected]);

  // Tab visibility / focus listeners to handle tab sleep/wake
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onUpdateRef.current({ update_type: 'visibility_wake' });
        if (managerRef.current && !isConnected) {
          managerRef.current.reconnect();
        }
      }
    };

    const handleFocus = () => {
      onUpdateRef.current({ update_type: 'window_focus' });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isConnected]);

  // Fallback polling using Web Worker to bypass tab suspension
  // Browsers don't throttle Web Workers, so setInterval here runs at full speed even when minimized.
  useEffect(() => {
    const workerCode = `
      let intervalId = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          intervalId = setInterval(() => {
            self.postMessage('tick');
          }, 15000);
        } else if (e.data === 'stop') {
          clearInterval(intervalId);
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onmessage = () => {
      const now = Date.now();
      const last = lastSignalTimeRef.current ? lastSignalTimeRef.current.getTime() : 0;
      // If silent for > 30s or offline, force fetch again
      if (!isConnected || now - last > 30000) {
        onUpdateRef.current({ update_type: 'background_polling' });
        
        // Try to reconnect socket if disconnected
        if (managerRef.current && !managerRef.current.isConnected) {
          managerRef.current.reconnect();
        }
      }
    };

    worker.postMessage('start');

    return () => {
      worker.postMessage('stop');
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, [isConnected]);

  return { isConnected, lastSignal, lastSignalTime };
}
