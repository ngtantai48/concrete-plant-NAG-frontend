import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface DeviceUpdatePayload {
  update_type?: string | null;
  device_status?: string | null;
  station_id?: string | number | null;
}

export interface DeviceStationStatus {
  stationId: string;
  deviceStatus: "connected" | "disconnected";
  rfidStatus?: "connected" | "disconnected";
  ledStatus?: "connected" | "disconnected";
  lastPayload: DeviceUpdatePayload;
}

interface DeviceHeartbeatState {
  isSocketConnected: boolean;
  isLedConnected: boolean;
  stationStatusMap: Record<string, DeviceStationStatus>;
}

const normalizePayload = (payload: unknown): DeviceUpdatePayload | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = "update" in payload && payload.update && typeof payload.update === "object"
    ? payload.update
    : payload;

  if (!source || typeof source !== "object") {
    return null;
  }

  const candidate = source as DeviceUpdatePayload;

  return {
    update_type: candidate.update_type ?? null,
    device_status: candidate.device_status ?? null,
    station_id: candidate.station_id ?? null,
  };
};

const isStationHeartbeat = (payload: DeviceUpdatePayload | null) => {
  if (!payload) {
    return false;
  }

  const validTypes = ["rfid_checks", "led_checks", "led", "led_status"];
  return validTypes.includes(payload.update_type || "") && String(payload.station_id ?? "") !== "";
};

export function useDeviceHeartbeat(): DeviceHeartbeatState {
  const socketRef = useRef<Socket | null>(null);

  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [stationStatusMap, setStationStatusMap] = useState<Record<string, DeviceStationStatus>>({});

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_DEVICE_SOCKET_URL;
    if (!socketUrl) {
      return;
    }

    const handleHeartbeat = (rawPayload: unknown) => {
      const payload = normalizePayload(rawPayload);
      if (!isStationHeartbeat(payload)) {
        return;
      }

      if (!payload) {
        return;
      }

      const stationId = String(payload.station_id);
      const updateType = payload.update_type;
      const deviceStatus = payload.device_status === "connected" ? "connected" : "disconnected";

      setStationStatusMap((prev) => {
        const existing = prev[stationId] || {
          stationId,
          deviceStatus: "disconnected",
          rfidStatus: "disconnected",
          ledStatus: "disconnected",
          lastPayload: payload
        };

        return {
          ...prev,
          [stationId]: {
            ...existing,
            deviceStatus: deviceStatus,
            lastPayload: payload,
          },
        };
      });
    };

    const socket = io(socketUrl, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsSocketConnected(true);
    });

    socket.on("disconnect", () => {
      setIsSocketConnected(false);
    });

    socket.on("update", handleHeartbeat);
    socket.onAny((eventName, payload) => {
      if (eventName === "update") {
        console.log("update", payload);
        return;
      }

      handleHeartbeat(payload);
    });

    return () => {
      socket.offAny();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const isLedConnected = useMemo(() => {
    // Theo backend, station_id = 4 là tín hiệu của LED
    return stationStatusMap["4"]?.deviceStatus === "connected";
  }, [stationStatusMap]);

  return useMemo(
    () => ({
      isSocketConnected,
      isLedConnected,
      stationStatusMap,
    }),
    [isSocketConnected, isLedConnected, stationStatusMap],
  );
}
