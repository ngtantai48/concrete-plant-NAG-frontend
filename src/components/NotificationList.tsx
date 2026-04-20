"use client";

import { getNotificationText, getNotificationTimestamp } from "@/lib/notification";
import { cn } from "@/lib/utils";
import { Notification } from "@/types/notification";
import { Bell, CheckCheck, Circle, Clock, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead: (id: string | number) => void;
  onMarkAllAsRead?: () => void;
}

export default function NotificationList({ notifications, onMarkAsRead, onMarkAllAsRead }: NotificationListProps) {
  const t = useTranslations("Notification");
  const locale = useLocale();
  const dateLocale = locale.startsWith("en") ? "en-US" : "vi-VN";
  const unreadCount = notifications.filter((item) => !item.read).length;
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) return notifications;
    const query = searchQuery.trim().toLowerCase();
    return notifications.filter((item) => {
      const text = getNotificationText(item, locale).toLowerCase();
      return text.includes(query);
    });
  }, [notifications, searchQuery, locale]);

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
    <div className="w-full p-0 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
            <Bell className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-row gap-4 justify-between items-center">
            <h4 className="text-sm font-bold text-white">{t("notification")}</h4>
            <span className="text-xs text-slate-300">
              {unreadCount > 0
                ? `${unreadCount} ${locale === 'vi' ? 'chưa đọc' : 'unread'}`
                : (locale === 'vi' ? 'Đã đọc hết' : 'All read')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <span className="text-[11px] font-bold text-white bg-red-500 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={locale === 'vi' ? 'Tìm kiếm thông báo...' : 'Search notifications...'}
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400 placeholder:text-slate-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center transition-colors"
            >
              <X className="h-2.5 w-2.5 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      {/* Mark all as read button */}
      {unreadCount > 0 && onMarkAllAsRead && (
        <button
          onClick={onMarkAllAsRead}
          className="w-full px-4 py-2 flex items-center justify-center gap-2 bg-sky-50 hover:bg-sky-100 border-b border-slate-200 transition-colors text-sky-700 text-xs font-bold uppercase tracking-wide"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          {locale === 'vi' ? 'Đánh dấu tất cả đã đọc' : 'Mark all as read'}
        </button>
      )}

      {/* Notification items */}
      <div className="max-h-[420px] overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
              {searchQuery ? (
                <Search className="h-5 w-5 text-slate-300" />
              ) : (
                <Bell className="h-5 w-5 text-slate-300" />
              )}
            </div>
            <span className="text-sm text-slate-400 font-medium">
              {searchQuery
                ? (locale === 'vi' ? 'Không tìm thấy thông báo' : 'No notifications found')
                : t("notification_empty")}
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredNotifications.map((item) => (
              <div
                key={item.id}
                onClick={() => onMarkAsRead(item.id)}
                className={cn(
                  "group flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-all cursor-pointer",
                  !item.read
                    ? "bg-sky-50/70 hover:bg-sky-100/70 border-l-[3px] border-l-sky-500"
                    : "bg-white hover:bg-slate-50 border-l-[3px] border-l-transparent"
                )}
              >
                {/* Unread dot */}
                <div className="pt-1 shrink-0">
                  {!item.read ? (
                    <Circle className="h-2.5 w-2.5 fill-sky-500 text-sky-500" />
                  ) : (
                    <Circle className="h-2.5 w-2.5 text-slate-200" />
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span
                    className={cn(
                      "text-sm leading-snug",
                      !item.read ? "font-semibold text-slate-800" : "font-normal text-slate-600"
                    )}
                  >
                    {formatContent(item)}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <span className="text-[11px] text-slate-400 font-medium">
                      {formatTimestamp(item)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-center">
          <span className="text-[11px] text-slate-400 font-medium">
            {searchQuery
              ? (locale === 'vi'
                ? `Tìm thấy ${filteredNotifications.length}/${notifications.length} thông báo`
                : `Found ${filteredNotifications.length}/${notifications.length} notifications`)
              : (locale === 'vi'
                ? `Tổng ${notifications.length} thông báo`
                : `${notifications.length} notifications total`)}
          </span>
        </div>
      )}
    </div>
  );
}
