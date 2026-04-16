"use client";

import { BellDot, Clock3, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNotificationText, getNotificationTimestamp } from "@/lib/notification";
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
    <div className="w-[380px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-sky-50 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-slate-900">{t("notification")}</h4>
            <p className="mt-1 text-xs text-slate-500">{notifications.length}</p>
          </div>
          <div
            className={cn(
              "flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold text-white shadow-sm",
              unreadCount > 0 ? "bg-red-500" : "bg-slate-400"
            )}
          >
            {unreadCount}
          </div>
        </div>
      </div>

      <div className="max-h-[28rem] overflow-y-auto bg-slate-50/80 p-3">
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
            {t("notification_empty")}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onMarkAsRead(item.id)}
                className={cn(
                  "group relative overflow-hidden rounded-xl border px-4 py-3 text-left transition-all",
                  !item.read
                    ? "border-emerald-200 bg-emerald-50/90 text-slate-950 shadow-sm shadow-emerald-100/80 hover:border-emerald-300 hover:bg-emerald-100/80"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-colors",
                    item.read ? "bg-slate-200" : "bg-emerald-500"
                  )}
                />

                <div className="flex items-start justify-between gap-3 pl-2">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-medium">{formatTimestamp(item)}</span>
                  </div>

                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      item.read
                        ? "bg-slate-100 text-slate-600"
                        : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    )}
                  >
                    {item.read ? (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        {t("read")}
                      </>
                    ) : (
                      <BellDot className="h-4 w-4 text-emerald-600" />
                    )}
                  </span>
                </div>

                <div className="mt-3 pl-2">
                  <span
                    className={cn(
                      "block truncate whitespace-nowrap text-[15px]",
                      !item.read ? "font-semibold text-slate-900" : "font-medium text-slate-700"
                    )}
                    title={formatContent(item)}
                  >
                    {formatContent(item)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
