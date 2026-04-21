import { useAppSelector } from "@/hooks/use-app-selector";
import { SocketManager } from "@/lib/socket";
import { validateUpdateSignal } from "@/lib/socket/schema";
import type { UpdateSignal } from "@/lib/socket/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/context/socket-context";

const REFRESH_COOLDOWN_MS = 800;

export function useRealtimeUpdates(onUpdate: (signal?: UpdateSignal) => void) {
  const managerRef = useRef<SocketManager | null>(null);
  const prevTokenRef = useRef<string | undefined>(undefined);
  const onUpdateRef = useRef(onUpdate);
  const lastRefreshRef = useRef(0);
  const pendingRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSignalTimeRef = useRef<Date | null>(null);
  onUpdateRef.current = onUpdate;

  const { statusMap, lastBackgroundTick, appVisibility } = useSocket();
  const isConnected = statusMap['updates']?.isConnected ?? false;
  const [lastSignal, setLastSignal] = useState<UpdateSignal | null>(null);
  const [lastSignalTime, setLastSignalTime] = useState<Date | null>(null);

  const tokenState = useAppSelector((state: any) => state.auth.token);
  const hookId = useMemo(() => Math.random().toString(36).substr(2, 4), []);

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

    // Token đổi (refresh) thì force reconnect để handshake với token mới.
    // Lần đầu chỉ connect bình thường.
    const prevToken = prevTokenRef.current;
    prevTokenRef.current = tokenState;

    if (prevToken && prevToken !== tokenState) {
      manager.reconnect();
    } else {
      manager.connect();
    }

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

        console.log(`[RealtimeUpdates][${hookId}] Received update event:`, signal);
        triggerRefresh(signal);
      })
    );

    // 'ping' event
    unsubscribes.push(
      manager.on('ping', (payload: unknown) => {
        const signal = validateUpdateSignal('ping', payload);
        if (!signal) return;

        console.log(`[RealtimeUpdates][${hookId}] Received ping event:`, signal);
        triggerRefresh(signal);
      })
    );

    // Catch-all for other events (excluding update/ping)
    unsubscribes.push(
      manager.onAny((eventName, payload) => {
        if (eventName === 'update' || eventName === 'ping') {
          return; // Already handled above
        }

        const signal = validateUpdateSignal(eventName, payload);
        if (!signal) return;

        console.log(`[RealtimeUpdates][${hookId}] Received event ${eventName}:`, payload);
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

  // Centralized Visibility Wake
  useEffect(() => {
    if (appVisibility === 'visible') {
      console.log("[RealtimeUpdates] Visibility wake trigger");
      onUpdateRef.current({ update_type: 'visibility_wake' });
    }
  }, [appVisibility]);

  // Centralized Background Polling (Tick every 15s from provider)
  useEffect(() => {
    const now = Date.now();
    const last = lastSignalTimeRef.current ? lastSignalTimeRef.current.getTime() : 0;
    // Nếu socket im lặng > 30s → trigger data refresh
    if (now - last > 30_000) {
      console.log("[RealtimeUpdates] Background polling trigger (silent > 30s)");
      onUpdateRef.current({ update_type: 'background_polling' });
    }
  }, [lastBackgroundTick]);

  return { isConnected, lastSignal, lastSignalTime };
}
