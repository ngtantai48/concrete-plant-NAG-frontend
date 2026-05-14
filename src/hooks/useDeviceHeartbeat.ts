import { SocketManager } from "@/lib/socket";
import { isStationHeartbeat, validateDevicePayload } from "@/lib/socket/schema";
import type { DeviceStationStatus as DeviceStationStatusType, DeviceUpdatePayload } from "@/lib/socket/types";
import { useEffect, useMemo, useRef, useState } from "react";

export type { DeviceStationStatusType as DeviceStationStatus, DeviceUpdatePayload };

interface DeviceHeartbeatState {
  isSocketConnected: boolean;
  isLedConnected: boolean;
  stationStatusMap: Record<string, DeviceStationStatusType>;
}

let globalStationStatusMap: Record<string, DeviceStationStatusType> = {};

type DeviceConnectionStatus = "connected" | "disconnected";

const CONNECTED_VALUES = new Set(["connected", "online", "up", "true", "1"]);
const DISCONNECTED_VALUES = new Set(["disconnected", "offline", "down", "false", "0"]);

function normalizeConnectionStatus(value: unknown): DeviceConnectionStatus | null {
  const status = String(value ?? "").trim().toLowerCase();
  if (CONNECTED_VALUES.has(status)) return "connected";
  if (DISCONNECTED_VALUES.has(status)) return "disconnected";
  return null;
}

export function useDeviceHeartbeat(): DeviceHeartbeatState {
  const managerRef = useRef<SocketManager | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [stationStatusMap, setStationStatusMap] = useState<Record<string, DeviceStationStatusType>>(globalStationStatusMap);

  const bufferRef = useRef<Record<string, Partial<DeviceStationStatusType>>>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!socketUrl) return;

    const manager = SocketManager.getInstance('updates', {
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
    });

    managerRef.current = manager;

    const unsubscribeConnection = manager.onConnectionChange((connected) => {
      setIsSocketConnected(connected);
    });

    const unsubscribes: Array<() => void> = [];

    const scheduleUpdate = () => {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          setStationStatusMap((prev) => {
            const flushed = { ...bufferRef.current };
            bufferRef.current = {};

            if (Object.keys(flushed).length === 0) return prev;

            const nextMap = { ...prev };
            Object.keys(flushed).forEach((stationId) => {
              const existing = nextMap[stationId] || {
                stationId,
                deviceStatus: "disconnected",
                lastPayload: null,
              };

              nextMap[stationId] = { ...existing, ...flushed[stationId] };
            });

            globalStationStatusMap = nextMap;
            return nextMap;
          });

          timeoutRef.current = null;
        }, 800);
      }
    };

    const handleHeartbeat = (rawPayload: unknown) => {
      const payload = validateDevicePayload(rawPayload);

      if (!isStationHeartbeat(payload)) {
        return;
      }

      const stationId = String(payload!.station_id);
      const deviceStatus = normalizeConnectionStatus(payload!.device_status);
      if (!deviceStatus) return;

      const updateType = payload!.update_type;
      const nextStatus: Partial<DeviceStationStatusType> = {
        deviceStatus,
        lastPayload: payload!,
      };

      if (updateType === "camera_checks") {
        nextStatus.cameraStatus = deviceStatus;
      }

      if (updateType === "led_checks" || updateType === "led" || updateType === "led_status") {
        nextStatus.ledStatus = deviceStatus;
      }

      bufferRef.current[stationId] = {
        ...(bufferRef.current[stationId] || {}),
        ...nextStatus,
      };

      scheduleUpdate();
    };

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

      let itemsToProcess: any[] = [];

      if (Array.isArray(payload)) {
        itemsToProcess = Array.isArray(payload[0]) ? payload[0] : payload;
      } else if (payload && typeof payload === 'object') {
        if ('station_id' in payload || 'id' in payload) {
          itemsToProcess = [payload];
        } else {
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

          const status = normalizeConnectionStatus(item.status ?? item.device_status);
          if (!status) return;

          bufferRef.current[stationId] = {
            ...(bufferRef.current[stationId] || {}),
            deviceStatus: status,
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

    unsubscribes.push(
      manager.on('camera-status', (payload: unknown) => {
        handleCameraStatus(payload);
      })
    );

    unsubscribes.push(
      manager.onAny((eventName, payload) => {
        if (eventName === 'camera-status') {
          return;
        }

        handleHeartbeat(payload);
      })
    );

    manager.connect();

    return () => {
      unsubscribeConnection();
      unsubscribes.forEach((unsub) => unsub());
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const isLedConnected = useMemo(() => {
    return stationStatusMap["4"]?.ledStatus === "connected";
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
