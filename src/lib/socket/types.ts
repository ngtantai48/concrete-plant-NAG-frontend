/**
 * Socket event type definitions và contracts
 * Tất cả events phải được định nghĩa rõ ràng ở đây để đảm bảo type safety
 */

// ============================================================
// Notification Events (namespace: /notifications)
// ============================================================

export interface NotificationPayload {
  id: string | number;
  user_id?: string | number;
  userId?: string | number;
  read: boolean;
  event: string;
  type?: string;
  title?: string;
  message?: string;
  created_at?: string;
  createdAt?: string;
  visible_date?: string;
  visibleDate?: string;
  reader_list?: (string | number)[];
  order_id?: string | number;
  vehicle_id?: string | number;
  station_id?: string | number;
  [key: string]: unknown;
}

export interface NotificationMarkReadPayload {
  user_id: string;
  noti_id: string | number;
}

export interface NotificationEvents {
  // Server -> Client
  'notification:list': NotificationPayload[];
  'notification:new': NotificationPayload;
  'notification:updated': NotificationPayload;
  'notification:removed': NotificationPayload | string | number;
  'notification:cleared': void;
  'notification:refresh': NotificationPayload | NotificationPayload[] | void;

  // Client -> Server
  'notification:get_all': void;
  'notification:mark_read': NotificationMarkReadPayload;

  // Connection events
  'connect': void;
  'disconnect': string;
  'connect_error': Error;
}

// ============================================================
// Update Events (namespace: /updates)
// ============================================================

export interface UpdateSignal {
  update_type: string | null;
  update_id?: number;
}

export interface UpdateEvents {
  // Server -> Client
  'update': UpdateSignal;
  'ping': UpdateSignal | void;
  'camera-status': unknown;

  // Connection events
  'connect': void;
  'disconnect': string;
  'connect_error': Error;
}

// ============================================================
// Device Heartbeat Events (namespace: /updates)
// ============================================================

export interface DeviceUpdatePayload {
  update_type?: string | null;
  device_status?: string | null;
  station_id?: string | number | null;
}

export interface CameraStatusPayload {
  station_id?: string | number;
  id?: string | number;
  status?: string;
  device_status?: string;
  [key: string]: unknown;
}

export interface DeviceStationStatus {
  stationId: string;
  deviceStatus: "connected" | "disconnected";
  cameraStatus?: "connected" | "disconnected";
  ledStatus?: "connected" | "disconnected";
  lastPayload: DeviceUpdatePayload | null;
}

// ============================================================
// Event Handler Types
// ============================================================

export type SocketEventHandler<EventName extends string, Payload = unknown> = 
  Payload extends void 
    ? () => void 
    : (payload: Payload) => void;

export type EventName = keyof NotificationEvents | keyof UpdateEvents;
