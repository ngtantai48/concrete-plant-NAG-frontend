export type NotificationCategory = "maintenance" | "lotTagRequest" | "general";

type NotificationCategoryInput = {
  type?: unknown;
  lot_tag_request_id?: unknown;
};

export function getNotificationCategory(
  notification: NotificationCategoryInput
): NotificationCategory {
  if (notification.type === "vehicle_maintenance") return "maintenance";
  if (notification.type === "lot_tag_request") return "lotTagRequest";
  return "general";
}

export function getLotTagRequestId(notification: NotificationCategoryInput): number | null {
  const requestId = Number(notification.lot_tag_request_id);
  return Number.isInteger(requestId) && requestId > 0 ? requestId : null;
}

export function isLotTagRequestInvalidTransition(message: unknown): boolean {
  return typeof message === "string" && message.includes("INVALID_TRANSITION");
}
