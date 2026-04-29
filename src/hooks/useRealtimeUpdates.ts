import { useSocket } from "@/context/socket-context";
import { useAppSelector } from "@/hooks/use-app-selector";
import { SocketManager } from "@/lib/socket";
import { validateUpdateSignal } from "@/lib/socket/schema";
import type { UpdateSignal } from "@/lib/socket/types";
import { useEffect, useRef, useState } from "react";

const REFRESH_COOLDOWN_MS = 800;

export function useRealtimeUpdates(onUpdate: (signal?: UpdateSignal) => void) {
  const managerRef = useRef<SocketManager | null>(null);
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

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SOCKET_URL || !tokenState) return;

    const manager = SocketManager.getInstance('updates', {
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
    });

    manager.setAuthProvider(() => tokenState);
    managerRef.current = manager;

    // SocketProvider owns reconnect on token refresh; hooks only ensure the shared socket exists.
    manager.connect();
  }, [tokenState]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !isConnected) return;

    const unsubscribes: Array<() => void> = [];

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

    unsubscribes.push(
      manager.on('update', (payload: unknown) => {
        const signal = validateUpdateSignal('update', payload);
        if (!signal) return;
        triggerRefresh(signal);
      })
    );

    unsubscribes.push(
      manager.on('ping', (payload: unknown) => {
        const signal = validateUpdateSignal('ping', payload);
        if (!signal) return;
        triggerRefresh(signal);
      })
    );

    unsubscribes.push(
      manager.onAny((eventName, payload) => {
        if (eventName === 'update' || eventName === 'ping') {
          return;
        }

        const signal = validateUpdateSignal(eventName, payload);
        if (!signal) return;
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

  useEffect(() => {
    if (appVisibility === 'visible') {
      onUpdateRef.current({ update_type: 'visibility_wake' });
    }
  }, [appVisibility]);

  useEffect(() => {
    const now = Date.now();
    const last = lastSignalTimeRef.current ? lastSignalTimeRef.current.getTime() : 0;
    if (now - last > 30_000) {
      onUpdateRef.current({ update_type: 'background_polling' });
    }
  }, [lastBackgroundTick]);

  return { isConnected, lastSignal, lastSignalTime };
}
