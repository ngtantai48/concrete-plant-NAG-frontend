import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAppSelector } from "@/hooks/use-app-selector";

export interface UpdateSignal {
  update_type: string | null;
  update_id?: number;
}

const REFRESH_COOLDOWN_MS = 800;

export function useRealtimeUpdates(onUpdate: () => void) {
  const socketRef = useRef<Socket | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const lastRefreshRef = useRef(0);
  const pendingRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onUpdateRef.current = onUpdate;

  const [isConnected, setIsConnected] = useState(false);
  const [lastSignal, setLastSignal] = useState<UpdateSignal | null>(null);
  const [lastSignalTime, setLastSignalTime] = useState<Date | null>(null);

  const tokenState = useAppSelector((state: any) => state.auth.token);

  useEffect(() => {
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!SOCKET_URL || !tokenState) return;

    const connectionUrl = `${SOCKET_URL}/updates`;

    const socket = io(connectionUrl, {
      transports: ["websocket"],
      autoConnect: true,
      auth: { token: `Bearer ${tokenState}` },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    const triggerRefresh = (signal: UpdateSignal) => {
      setLastSignal(signal);
      setLastSignalTime(new Date());

      const now = Date.now();
      const elapsed = now - lastRefreshRef.current;

      if (elapsed >= REFRESH_COOLDOWN_MS) {
        lastRefreshRef.current = now;
        onUpdateRef.current();
        return;
      }

      if (pendingRefreshRef.current) {
        clearTimeout(pendingRefreshRef.current);
      }

      pendingRefreshRef.current = setTimeout(() => {
        lastRefreshRef.current = Date.now();
        onUpdateRef.current();
        pendingRefreshRef.current = null;
      }, REFRESH_COOLDOWN_MS - elapsed);
    };

    const normalizeSignal = (eventName: string, payload?: unknown): UpdateSignal | null => {
      if (eventName === "update" && payload && typeof payload === "object") {
        return payload as UpdateSignal;
      }

      if (eventName === "ping") {
        if (payload && typeof payload === "object") {
          return payload as UpdateSignal;
        }

        return { update_type: "ping" };
      }

      const lowerName = eventName.toLowerCase();
      if (lowerName.includes("update") || lowerName.includes("refresh") || lowerName.includes("ping")) {
        if (payload && typeof payload === "object") {
          return payload as UpdateSignal;
        }

        return { update_type: eventName };
      }

      return null;
    };

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[RealtimeUpdates] Da ket noi toi /updates");
      setIsConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.warn("[RealtimeUpdates] Bi ngat ket noi:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("[RealtimeUpdates] Loi ket noi:", error.message);
    });

    socket.on("update", (signal: UpdateSignal) => {
      console.log("[RealtimeUpdates] Nhan su kien update:", signal);
      triggerRefresh(signal);
    });

    socket.on("ping", (signal?: UpdateSignal) => {
      console.log("[RealtimeUpdates] Nhan su kien ping:", signal);
      triggerRefresh(signal ?? { update_type: "ping" });
    });

    socket.onAny((eventName, payload) => {
      if (eventName === "update" || eventName === "ping") {
        return;
      }

      const signal = normalizeSignal(eventName, payload);
      if (!signal) return;

      console.log(`[RealtimeUpdates] Nhan su kien ${eventName}:`, payload);
      triggerRefresh(signal);
    });

    return () => {
      if (pendingRefreshRef.current) {
        clearTimeout(pendingRefreshRef.current);
        pendingRefreshRef.current = null;
      }

      socket.offAny();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tokenState]);

  return { isConnected, lastSignal, lastSignalTime };
}
