export type NotificationCategory = "maintenance" | "lotTagRequest" | "general";

type NotificationCategoryInput = {
  type?: unknown;
};

export function getNotificationCategory(
  notification: NotificationCategoryInput
): NotificationCategory {
  if (notification.type === "vehicle_maintenance") return "maintenance";
  if (notification.type === "lot_tag_request") return "lotTagRequest";
  return "general";
}
