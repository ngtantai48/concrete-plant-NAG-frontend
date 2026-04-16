"use client";

import { getNotificationText, getNotificationTimestamp } from "@/lib/notification";
import { cn } from "@/lib/utils";
import { Notification } from "@/types/notification";
import { useLocale, useTranslations } from "next-intl";

interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead: (id: string | number) => void;
}

export default function NotificationList({ notifications, onMarkAsRead }: NotificationListProps) {
  const t = useTranslations("Notification");
  const locale = useLocale();
  const dateLocale = locale.startsWith("en") ? "en-US" : "vi-VN";
  const unreadCount = notifications.filter((item) => !item.read).length;

  const formatContent = (item: Notification) => {
    return getNotificationText(item, locale);
  };

  const formatTimestamp = (item: Notification) => {
    const timestamp = getNotificationTimestamp(item);
    if (!timestamp) {
      return "--:--:--";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return timestamp;
    }

    return new Intl.DateTimeFormat(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  return (
    <div className="w-90 p-0">
      <div className="bg-gray-300 flex items-center justify-center p-4 border-b rounded-t-md border-gray-200">
        <h4 className="font-bold">{t("notification")} ({notifications.length})</h4>
      </div>

      <div className="max-h-105 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">{t("notification_empty")}</div>
        ) : (
          <div className="flex flex-col cursor-pointer">
            {notifications.map((item, index) => (
              <div
                key={item.id}
                onClick={() => onMarkAsRead(item.id)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-accent transition-colors text-left",
                  !item.read ? "bg-blue-300/50" : "bg-transparent"
                )}
              >
                <div className={cn(
                  "text-sm shrink-0 py-2",
                  !item.read ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                )}>
                  #{index + 1}
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(item)}
                    {item.read && <span className="ml-2 text-green-600 font-medium">({t("read")})</span>}
                  </span>
                  <span
                    className={cn(
                      "text-sm text-foreground wrap-break-word whitespace-normal",
                      !item.read ? "font-semibold" : "font-normal"
                    )}
                  >
                    {formatContent(item)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
