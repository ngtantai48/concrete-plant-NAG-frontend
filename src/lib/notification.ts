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
};

const NOTIFICATION_TEXT_TEMPLATES: Record<NotificationLocale, Record<string, string>> = {
  vi: {
    [NOTIFICATION_EVENTS.STATION_CHECK_IN]: "Xe {vehicle} đã vào {station}",
    [NOTIFICATION_EVENTS.STATION_CHECK_OUT]: "Xe {vehicle} đã rời {station}",
    [NOTIFICATION_EVENTS.VEHICLE_CHECK_IN]: "Xe {vehicle} đã vào bãi",
    [NOTIFICATION_EVENTS.VEHICLE_CHECK_OUT]: "Xe {vehicle} đã rời bãi",
  },
  en: {
    [NOTIFICATION_EVENTS.STATION_CHECK_IN]: "Vehicle {vehicle} checked in at {station}",
    [NOTIFICATION_EVENTS.STATION_CHECK_OUT]: "Vehicle {vehicle} checked out from {station}",
    [NOTIFICATION_EVENTS.VEHICLE_CHECK_IN]: "Vehicle {vehicle} checked in to the yard",
    [NOTIFICATION_EVENTS.VEHICLE_CHECK_OUT]: "Vehicle {vehicle} checked out from the yard",
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
  const template = event ? NOTIFICATION_TEXT_TEMPLATES[resolvedLocale][event] : undefined;

  if (template) {
    return fillTemplate(template, {
      station: getStringValue(notification.station_name, "-"),
      vehicle: getStringValue(
        notification.vehicle_name,
        getStringValue(notification.vehicle_license_plate, "-")
      ),
      orderNumber: getStringValue(notification.order_number, "-"),
      user: getStringValue(notification.user_name, "-"),
    });
  }

  const message = getStringValue(notification.message);
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
