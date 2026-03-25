import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAppSelector } from "@/hooks/use-app-selector";

export interface UpdateSignal {
  update_type: string | null;
  update_id?: number;
}

export function useRealtimeUpdates(onUpdate: () => void) {
  const socketRef = useRef<Socket | null>(null);
  const onUpdateRef = useRef(onUpdate);
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

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[RealtimeUpdates] Đã kết nối tới /updates");
      setIsConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.warn("[RealtimeUpdates] Bị ngắt kết nối:", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("[RealtimeUpdates] Lỗi kết nối:", error.message);
    });

    socket.on("update", (signal: UpdateSignal) => {
      console.log("[RealtimeUpdates] Đã nhận tín hiệu:", signal);
      setLastSignal(signal);
      setLastSignalTime(new Date());
      onUpdateRef.current();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tokenState]);

  return { isConnected, lastSignal, lastSignalTime };
}
