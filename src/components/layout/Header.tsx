"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import NotificationList from "@/components/NotificationList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSocket } from "@/context/socket-context";
import { useAppSelector } from "@/hooks/use-app-selector";
import { UserOutlined } from "@ant-design/icons";
import { Avatar, Dropdown, Layout, MenuProps, Space } from "antd";
import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

const { Header } = Layout;

type AppHeaderProps = {
  statusColor?: string;
  userName?: string;
  onProfileClick?: () => void;
  onLogout?: () => void;
};

const AppHeader: React.FC<AppHeaderProps> = ({
  statusColor = "#52c41a",
  userName,
  onProfileClick,
  onLogout,
}) => {
  const t = useTranslations("Header");

  const reduxUserName = useAppSelector((state: any) => state.auth.user?.fullName);
  const authLoading = useAppSelector((state: any) => state.auth.loading);
  const [localUserName, setLocalUserName] = useState<string | undefined>(userName);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useSocket();

  useEffect(() => {
    if (userName) {
      setLocalUserName(userName);
      return;
    }
    if (reduxUserName) {
      setLocalUserName(reduxUserName);
      return;
    }

    if (typeof document !== "undefined") {
      const raw = document.cookie.split("; ").find((c) => c.startsWith("user_name="));
      if (raw) {
        setLocalUserName(decodeURIComponent(raw.split("=")[1]));
      }
    }
  }, [userName, reduxUserName]);

  const isLoading = authLoading && !localUserName;

  const menuItems: MenuProps["items"] = [
    { key: "profile", label: t("profile"), onClick: onProfileClick },
    { key: "settings", label: t("settings"), onClick: onProfileClick },
    { type: "divider" },
    { key: "logout", label: t("logout"), danger: true, onClick: onLogout },
  ];

  return (
    <Header
      className="sticky top-0 z-10 flex items-center justify-between flex-wrap gap-y-3 min-h-16 w-full border-b border-gray-200 shadow-md"
      style={{ background: "#fff", padding: "0 16px" }}
    >
      <div className="px-5 flex flex-wrap items-center gap-4 text-sm text-gray-600 w-full sm:w-auto">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          {authLoading ? (
            <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
          ) : (
            <span className="font-medium text-gray-700">{t("statusText")}</span>
          )}
        </div>
      </div>

      <div className="px-5 flex flex-wrap items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
        {isLoading ? (
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
            <div className="flex flex-col">
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative hover:bg-gray-300">
                  <BellRing />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 rounded-full bg-red-500 text-[10px] ring-2 ring-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="z-1000 p-0 w-[360px] shadow-lg border-none"
                sideOffset={5}
              >
                <NotificationList notifications={notifications} onMarkAsRead={markAsRead} onMarkAllAsRead={markAllAsRead} />
              </PopoverContent>
            </Popover>

            <LanguageSwitcher />

            <Dropdown menu={{ items: menuItems }} placement="bottomRight" arrow>
              <Space style={{ cursor: "pointer" }} size="small">
                <Avatar size="small" icon={<UserOutlined />} />
                <span className="font-medium">{localUserName || "User"}</span>
                <span
                  className="inline-block w-2 h-2 rounded-full bg-green-500"
                  title="Online"
                ></span>
              </Space>
            </Dropdown>
          </>
        )}
      </div>
    </Header>
  );
};

export default AppHeader;
