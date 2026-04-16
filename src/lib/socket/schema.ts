/**
 * Schema validation cho socket payloads
 * Đảm bảo dữ liệu nhận được từ server đúng định dạng trước khi xử lý
 */

import type { NotificationPayload, UpdateSignal, DeviceUpdatePayload } from './types';

/**
 * Validate và normalize notification payload
 */
export function validateNotificationPayload(raw: unknown): NotificationPayload | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // ID validation - bắt buộc
  const id = obj.id;
  if (id === undefined || id === null) {
    // Fallback: tạo ID từ event + timestamp
    const event = typeof obj.event === 'string' ? obj.event : 'notification';
    obj.id = `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  } else if (typeof id !== 'string' && typeof id !== 'number') {
    return null; // ID không hợp lệ
  }

  // Event validation - bắt buộc
  if (typeof obj.event !== 'string') {
    obj.event = 'notification';
  }

  // Date validation
  const emittedAt = obj.emitted_at ?? obj.emittedAt;
  if (typeof emittedAt === 'string') {
    obj.emittedAt = emittedAt;
  }

  const createdAt = obj.created_at ?? obj.createdAt ?? emittedAt;
  obj.createdAt = typeof createdAt === 'string' ? createdAt : new Date().toISOString();

  const visibleDate = obj.visible_date ?? obj.visibleDate ?? emittedAt ?? createdAt;
  if (typeof visibleDate === 'string') {
    obj.visibleDate = visibleDate;
  }

  // reader_list validation
  if (obj.reader_list !== undefined) {
    if (!Array.isArray(obj.reader_list)) {
      obj.reader_list = [];
    } else {
      obj.reader_list = obj.reader_list.filter(
        (item): item is string | number => typeof item === 'string' || typeof item === 'number'
      );
    }
  }

  // read validation
  if (typeof obj.read !== 'boolean') {
    obj.read = false;
  }

  return obj as unknown as NotificationPayload;
}

/**
 * Validate update signal payload
 */
export function validateUpdateSignal(eventName: string, payload: unknown): UpdateSignal | null {
  // Explicit 'update' event
  if (eventName === 'update' && payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    return {
      update_type: typeof obj.update_type === 'string' ? obj.update_type : null,
      update_id: typeof obj.update_id === 'number' ? obj.update_id : undefined,
    };
  }

  // 'ping' event
  if (eventName === 'ping') {
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      return {
        update_type: typeof obj.update_type === 'string' ? obj.update_type : 'ping',
        update_id: typeof obj.update_id === 'number' ? obj.update_id : undefined,
      };
    }
    return { update_type: 'ping' };
  }

  // Fallback: cố gắng normalize từ event name
  const lowerName = eventName.toLowerCase();
  if (lowerName.includes('update') || lowerName.includes('refresh') || lowerName.includes('ping')) {
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      return {
        update_type: typeof obj.update_type === 'string' ? obj.update_type : eventName,
        update_id: typeof obj.update_id === 'number' ? obj.update_id : undefined,
      };
    }
    return { update_type: eventName };
  }

  return null;
}

/**
 * Validate device update payload
 */
export function validateDevicePayload(payload: unknown): DeviceUpdatePayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const obj = payload as Record<string, unknown>;

  // Hỗ trợ nested update object (backend có thể bọc trong { update: {...} })
  const source = obj.update && typeof obj.update === 'object' 
    ? (obj.update as Record<string, unknown>) 
    : obj;

  return {
    update_type: typeof source.update_type === 'string' ? source.update_type : null,
    device_status: typeof source.device_status === 'string' ? source.device_status : null,
    station_id: (source.station_id as string | number | null | undefined) ?? null,
  };
}

/**
 * Check xem payload có phải là station heartbeat hợp lệ không
 */
export function isStationHeartbeat(payload: DeviceUpdatePayload | null): boolean {
  if (!payload) return false;

  const validTypes = ['camera_checks', 'led_checks', 'led', 'led_status'];
  const isValidType = validTypes.includes(payload.update_type || '');
  const hasStationId = String(payload.station_id ?? '') !== '';

  return isValidType && hasStationId;
}
