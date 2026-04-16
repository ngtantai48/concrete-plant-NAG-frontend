import { SocketManager } from "@/lib/socket";
import { isStationHeartbeat, validateDevicePayload } from "@/lib/socket/schema";
import type { DeviceStationStatus as DeviceStationStatusType, DeviceUpdatePayload } from "@/lib/socket/types";
import { useEffect, useMemo, useRef, useState } from "react";

// Re-export để backward compatible
export type { DeviceStationStatusType as DeviceStationStatus, DeviceUpdatePayload };

interface DeviceHeartbeatState {
  isSocketConnected: boolean;
  isLedConnected: boolean;
  stationStatusMap: Record<string, DeviceStationStatusType>;
}

export function useDeviceHeartbeat(): DeviceHeartbeatState {
  const managerRef = useRef<SocketManager | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [stationStatusMap, setStationStatusMap] = useState<Record<string, DeviceStationStatusType>>({});

  const bufferRef = useRef<Record<string, Partial<DeviceStationStatusType>>>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize socket manager (singleton - shares /updates namespace with useRealtimeUpdates)
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!socketUrl) return;

    // Sử dụng cùng instance 'updates' với useRealtimeUpdates
    // SocketManager đảm bảo chỉ 1 connection per namespace
    const manager = SocketManager.getInstance('updates', {
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
    });

    managerRef.current = manager;

    // Connection state listener
    const unsubscribeConnection = manager.onConnectionChange((connected) => {
      setIsSocketConnected(connected);
    });

    // Connect
    manager.connect();

    return () => {
      unsubscribeConnection();
    };
  }, []);

  // Setup event listeners
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !isSocketConnected) return;

    const unsubscribes: Array<() => void> = [];

    // Trigger update batching
    const scheduleUpdate = () => {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          setStationStatusMap((prev) => {
            const flushed = { ...bufferRef.current };
            bufferRef.current = {}; // clear buffer ngay lập tức để nhận event mới

            if (Object.keys(flushed).length === 0) return prev;

            const nextMap = { ...prev };
            Object.keys(flushed).forEach((stationId) => {
              const existing = nextMap[stationId] || {
                stationId,
                deviceStatus: "disconnected",
                cameraStatus: "disconnected",
                ledStatus: "disconnected",
              };

              nextMap[stationId] = { ...existing, ...flushed[stationId] };
            });

            return nextMap;
          });

          timeoutRef.current = null;
        }, 800); // Batch các thay đổi trong 800ms
      }
    };

    // Handle heartbeat payloads
    const handleHeartbeat = (rawPayload: unknown) => {
      const payload = validateDevicePayload(rawPayload);

      if (!isStationHeartbeat(payload)) {
        return;
      }

      const stationId = String(payload!.station_id);
      const deviceStatus = payload!.device_status === "connected" ? "connected" : "disconnected";

      // Lưu partial update vào bufferRef thay vì setState
      bufferRef.current[stationId] = {
        ...(bufferRef.current[stationId] || {}),
        deviceStatus: deviceStatus,
        lastPayload: payload!,
      };

      scheduleUpdate();
    };

    // Handle camera-status events
    const handleCameraStatus = (rawPayload: unknown) => {
      let payload = rawPayload;
      if (typeof rawPayload === 'string') {
        try {
          payload = JSON.parse(rawPayload);
        } catch (e) {
          console.error("[DeviceHeartbeat] Failed to parse camera-status payload:", e);
          return;
        }
      }

      // Chuẩn hóa payload về một mảng chứa dữ liệu các trạm
      let itemsToProcess: any[] = [];

      if (Array.isArray(payload)) {
        // Nếu payload bị bọc thêm 1 lớp mảng (ví dụ: `[[{station_id: 1}]]`)
        itemsToProcess = Array.isArray(payload[0]) ? payload[0] : payload;
      } else if (payload && typeof payload === 'object') {
        // Nếu chỉ là một object duy nhất (khi server thay đổi trạng thái 1 trạm)
        if ('station_id' in payload || 'id' in payload) {
          itemsToProcess = [payload];
        } else {
          // Fallback (cố gắng tìm mảng bên trong object)
          const dataArr = Object.values(payload).find(val => Array.isArray(val));
          if (dataArr) {
            itemsToProcess = dataArr as any[];
          }
        }
      }

      if (itemsToProcess.length > 0) {
        let updated = false;

        itemsToProcess.forEach((item: any) => {
          if (!item || typeof item !== 'object') return;
          const stationId = String(item.station_id || item.id || "");
          if (!stationId) return;

          const statusStr = String(item.status || item.device_status || "").trim().toLowerCase();
          const status = statusStr === "connected" ? "connected" : "disconnected";

          bufferRef.current[stationId] = {
            ...(bufferRef.current[stationId] || {}),
            deviceStatus: status, // Giữ tương thích với cấu trúc hiện tại
            cameraStatus: status,
            lastPayload: item,
          };
          updated = true;
        });

        if (updated) {
          scheduleUpdate();
        }
      }
    };

    // Register 'camera-status' listener
    unsubscribes.push(
      manager.on('camera-status', (payload: unknown) => {
        handleCameraStatus(payload);
      })
    );

    // Catch-all for heartbeat events
    unsubscribes.push(
      manager.onAny((eventName, payload) => {
        if (eventName === 'camera-status') {
          return; // Already handled above
        }

        handleHeartbeat(payload);
      })
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isSocketConnected]);

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
    [isSocketConnected, isLedConnected, stationStatusMap]
  );
}
