"use client";

import { NOTIFICATION_EVENT_TRANSLATION_KEYS } from "@/constants/notification";
import { cn } from "@/lib/utils";
import { Notification } from "@/types/notification";
import { useTranslations } from "next-intl";

interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead: (id: string | number) => void;
}

export default function NotificationList({ notifications, onMarkAsRead }: NotificationListProps) {
  const t = useTranslations("Notification");

  const formatContent = (item: Notification) => {
    if (item.event) {
      const translationKey =
        NOTIFICATION_EVENT_TRANSLATION_KEYS[
        item.event as keyof typeof NOTIFICATION_EVENT_TRANSLATION_KEYS
        ];
      if (translationKey) {
        return t(translationKey, {
          station: item.station_name ?? "-",
          vehicle: item.vehicle_license_plate ?? "-",
          orderNumber: item.order_number ?? "-",
          user: item.user_name ?? "-",
        });
      }
    }

    return item.message || item.title || t("unknown_event");
  };

  return (
    <div className="w-90 p-0">
      <div className="bg-gray-100 flex items-center justify-center p-4 border-b rounded-t-md border-gray-200">
        <h4 className="font-bold">{t("notification")}</h4>
      </div>

      <div className="max-h-105 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">{t("notification_empty")}</div>
        ) : (
          <div className="flex flex-col cursor-pointer">
            {notifications.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onMarkAsRead(item.id)}
                className={cn(
                  "flex flex-col gap-1 px-4 py-3 border-b last:border-0 hover:bg-accent transition-colors text-left",
                  !item.read ? "bg-blue-300/40" : "bg-transparent"
                )}
              >
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(item.visibleDate || item.createdAt).toLocaleString("vi-VN")}
                  {item.read && (
                    <span className="ml-2 text-green-600 font-medium">({t("read")})</span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm text-foreground wrap-break-word whitespace-normal",
                    !item.read ? "font-semibold" : "font-normal"
                  )}
                >
                  {formatContent(item)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
