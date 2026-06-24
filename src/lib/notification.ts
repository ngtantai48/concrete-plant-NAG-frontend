import { NOTIFICATION_EVENTS } from "@/constants/notification";

type NotificationLocale = "vi" | "en";
type NotificationLike = {
  event?: unknown;
  type?: unknown;
  title?: unknown;
  message?: unknown;
  station_name?: unknown;
  vehicle_name?: unknown;
  vehicle_license_plate?: unknown;
  order_number?: unknown;
  user_name?: unknown;
  visibleDate?: unknown;
  visible_date?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  emittedAt?: unknown;
  emitted_at?: unknown;
  warning_threshold_minutes?: unknown;
  timeout_threshold_minutes?: unknown;
  elapsed_minutes?: unknown;
  license_plate?: unknown;
  vehicle_maintenance_id?: unknown;
};

const NOTIFICATION_TEXT_TEMPLATES: Record<NotificationLocale, Record<string, string>> = {
  vi: {
    [NOTIFICATION_EVENTS.STATION_CHECK_IN]: "Xe {vehicle} đã vào {station}",
    [NOTIFICATION_EVENTS.STATION_CHECK_OUT]: "Xe {vehicle} đã rời {station}",
    [NOTIFICATION_EVENTS.VEHICLE_CHECK_IN]: "Xe {vehicle} đã rời bãi",
    [NOTIFICATION_EVENTS.VEHICLE_CHECK_OUT]: "Xe {vehicle} đã vào bãi",
    [NOTIFICATION_EVENTS.STATION_CHECKOUT_VEHICLE_CHECKIN_WARNING]:
      "Cảnh báo xe {vehicle} đã ở bãi {elapsed_minutes} phút kể từ khi lấy hàng thành công,  làm mới lốt xe sau {remaining_minutes} phút nữa",
    [NOTIFICATION_EVENTS.STATION_CHECKOUT_VEHICLE_CHECKIN_TIMEOUT_RESET]:
      "Đã làm mới lốt xe của xe {vehicle}",
    [NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING]:
      "Cảnh báo xe {vehicle} nổ máy trong bãi đã {elapsed_minutes} phút",
    [NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING_RESOLVED]: "Xe {vehicle} đã tắt máy trong bãi",
    [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_SUBMITTED]:
      "Phiếu bảo trì xe {vehicle} đã được gửi, cần kiểm tra.",
    [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_CONFIRMED]:
      "Phiếu bảo trì xe {vehicle} đã được xác nhận, chờ duyệt.",
    [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_REJECTED]:
      "Phiếu bảo trì xe {vehicle} đã bị từ chối, cần kiểm tra lại.",
    [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_APPROVED]: "Phiếu bảo trì xe {vehicle} đã được duyệt.",
    [NOTIFICATION_EVENTS.TANKER_LOT_SYNC]: "Đã chụp và đồng bộ lốt xe bồn",
  },
  en: {
    [NOTIFICATION_EVENTS.STATION_CHECK_IN]: "Vehicle {vehicle} checked in at {station}",
    [NOTIFICATION_EVENTS.STATION_CHECK_OUT]: "Vehicle {vehicle} checked out from {station}",
    [NOTIFICATION_EVENTS.VEHICLE_CHECK_IN]: "Vehicle {vehicle} checked in to the yard",
    [NOTIFICATION_EVENTS.VEHICLE_CHECK_OUT]: "Vehicle {vehicle} checked out from the yard",
    [NOTIFICATION_EVENTS.STATION_CHECKOUT_VEHICLE_CHECKIN_WARNING]:
      "Warning: Vehicle {vehicle} has been at the yard for {elapsed_minutes} minutes since successful pickup",
    [NOTIFICATION_EVENTS.STATION_CHECKOUT_VEHICLE_CHECKIN_TIMEOUT_RESET]:
      "Vehicle {vehicle} slot has been reset",
    [NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING]:
      "Warning: Vehicle {vehicle} has been idling in the yard for {elapsed_minutes} minutes",
    [NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING_RESOLVED]:
      "Vehicle {vehicle} engine has been turned off in the yard",
    [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_SUBMITTED]:
      "Vehicle maintenance ticket for {vehicle} was submitted and needs review.",
    [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_CONFIRMED]:
      "Vehicle maintenance ticket for {vehicle} was confirmed and is waiting for approval.",
    [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_REJECTED]:
      "Vehicle maintenance ticket for {vehicle} was rejected and needs review.",
    [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_APPROVED]:
      "Vehicle maintenance ticket for {vehicle} was approved.",
    [NOTIFICATION_EVENTS.TANKER_LOT_SYNC]: "Tanker lot snapshot was captured and synced",
  },
};

const UNKNOWN_NOTIFICATION_TEXT: Record<NotificationLocale, string> = {
  vi: "Bạn có một thông báo mới",
  en: "You have a new notification",
};

const SPEAKABLE_EVENTS = new Set<string>(Object.values(NOTIFICATION_EVENTS));

function getStringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return fallback;
}

function getVehicleDisplayValue(notification: NotificationLike): string {
  const licensePlate =
    getStringValue(notification.vehicle_license_plate) ||
    getStringValue(notification.license_plate);
  const type = getStringValue(notification.type);
  const name = getStringValue(notification.vehicle_name);

  if (type === "vehicle_maintenance") {
    if (licensePlate && name) return `${licensePlate} | ${name}`;
    if (licensePlate) return licensePlate;
    if (name) return name;
  }

  if (licensePlate) {
    return licensePlate.slice(-3);
  }

  if (name) {
    return name.slice(-3);
  }

  return "-";
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "-");
}

function getDateString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function getNotificationLocale(locale?: string | null): NotificationLocale {
  return locale?.toLowerCase().startsWith("en") ? "en" : "vi";
}

export function getRuntimeNotificationLocale(): NotificationLocale {
  if (typeof document !== "undefined") {
    const documentLocale = document.documentElement.lang;
    if (documentLocale) {
      return getNotificationLocale(documentLocale);
    }
  }

  if (typeof navigator !== "undefined") {
    return getNotificationLocale(navigator.language);
  }

  return "vi";
}

export function shouldSpeakNotification(notification: NotificationLike): boolean {
  return typeof notification.event === "string" && SPEAKABLE_EVENTS.has(notification.event);
}

export function getNotificationText(
  notification: NotificationLike,
  locale?: string | null
): string {
  const resolvedLocale = getNotificationLocale(locale);
  const event =
    typeof notification.event === "string" ? notification.event : undefined;
  const message = getStringValue(notification.message);
  if (event === NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_DELETED && message) {
    return message;
  }

  const template = event ? NOTIFICATION_TEXT_TEMPLATES[resolvedLocale][event] : undefined;

  if (template) {
    return fillTemplate(template, {
      station: getStringValue(notification.station_name, "-"),
      vehicle: getVehicleDisplayValue(notification),
      orderNumber: getStringValue(notification.order_number, "-"),
      user: getStringValue(notification.user_name, "-"),
      warning_threshold_minutes: getStringValue(notification.warning_threshold_minutes, "0"),
      timeout_threshold_minutes: getStringValue(notification.timeout_threshold_minutes, "0"),
      elapsed_minutes: Math.round(Number(notification.elapsed_minutes || 0)).toString(),
      remaining_minutes: Math.max(
        0,
        Math.round(
          Number(notification.timeout_threshold_minutes || 0) -
            Number(notification.elapsed_minutes || 0)
        )
      ).toString(),
    });
  }

  if (message) {
    return message;
  }

  const title = getStringValue(notification.title);
  if (title) {
    return title;
  }

  return UNKNOWN_NOTIFICATION_TEXT[resolvedLocale];
}

export function getNotificationTimestamp(notification: NotificationLike): string | null {
  return (
    getDateString(notification.visibleDate) ??
    getDateString(notification.visible_date) ??
    getDateString(notification.emittedAt) ??
    getDateString(notification.emitted_at) ??
    getDateString(notification.createdAt) ??
    getDateString(notification.created_at)
  );
}

export function getNotificationTimestampValue(notification: NotificationLike): number {
  const timestamp = getNotificationTimestamp(notification);
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}
