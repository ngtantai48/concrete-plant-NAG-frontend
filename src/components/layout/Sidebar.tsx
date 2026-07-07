"use client";

import Logo from "@/assets/images/logo.png";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { navigationConfig, NavItem } from "@/config/navigation";
import { findBestMenuRouteMatch } from "@/components/layout/sidebar-route-match";
import { useAppSelector } from "@/hooks/use-app-selector";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { usePermissions } from "@/hooks/use-permissions";
import { DoubleLeftOutlined, DoubleRightOutlined } from "@ant-design/icons";
import { createSelector } from "@reduxjs/toolkit";
import { Avatar, Button, Layout, Menu, MenuProps } from "antd";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import reportApi from "@/services/report.service";

const UserProfile = ({
  collapsed,
  userName,
  roleLabel,
  isLoading,
}: {
  collapsed: boolean;
  userName?: string;
  roleLabel?: string;
  isLoading?: boolean;
}) => {
  return (
    <div className="flex items-center border-t border-gray-700 p-3 bg-gray-900 min-h-17.5">
      <div className="flex items-center gap-4 w-full px-3">
        {isLoading ? (
          <>
            <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
            {!collapsed && (
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3.5 bg-gray-700 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-700 rounded animate-pulse w-1/2" />
              </div>
            )}
          </>
        ) : (
          <>
            <Avatar
              className="shrink-0"
              icon={<User size={20} />}
              style={{ backgroundColor: "#722ed1" }}
            />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate m-0">
                  {userName || "User"}
                </p>
                <p className="text-gray-400 text-xs truncate m-0">{roleLabel}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default function Sidebar() {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string>("");
  const { hasPageAccess } = usePermissions();
  const { isDirty, setDirty } = useNavigationStore();

  const selectAuth = createSelector(
    (state: any) => state.auth,
    (auth) => ({
      role: auth.user?.role,
      roleLabel: auth.user?.role_label,
      fullName: auth.user?.fullName,
      authLoading: auth.loading,
    })
  );

  const { role, roleLabel, fullName, authLoading } = useAppSelector(selectAuth);

  const baseMenuItems = useMemo(() => {
    const translateItems = (items: NavItem[]): NavItem[] => {
      return items.map((item) => ({
        ...item,
        label: t(item.label),
        children: item.children ? translateItems(item.children) : undefined,
      }));
    };
    return translateItems(navigationConfig);
  }, [t]);

  const menuItems = useMemo(() => {
    const filterItems = (items: NavItem[]): NavItem[] => {
      return items
        .map((item) => ({ ...item }))
        .filter((item) => {
          if (item.hideInSidebar) {
            return false;
          }

          if (item.roles && !item.roles.includes(role || "")) {
            return false;
          }

          if (item.children) {
            item.children = filterItems(item.children);
            return item.children.length > 0;
          }

          return (
            hasPageAccess(item.key) ||
            (item.extraAccessKeys?.some((key) => hasPageAccess(key)) ?? false)
          );
        });
    };
    return filterItems(baseMenuItems);
  }, [baseMenuItems, role, hasPageAccess]);

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    if (isDirty) {
      e.preventDefault();
      setPendingUrl(url);
      setShowUnsavedDialog(true);
    }
  };

  const confirmNavigation = () => {
    if (pendingUrl) {
      setDirty(false);
      setShowUnsavedDialog(false);
      router.push(pendingUrl);
      setPendingUrl("");
    }
  };

  const buildMenuItems = useCallback(
    (items: NavItem[]): MenuProps["items"] => {
      return items.map((item) => {
        if (item.children) {
          return {
            key: item.key,
            icon: item.icon,
            label: item.label,
            children: buildMenuItems(item.children),
          };
        }

        return {
          key: item.key,
          icon: item.icon,
          label: (
            <Link href={item.key} onClick={(e) => handleLinkClick(e, item.key)}>
              {item.label}
            </Link>
          ),
        };
      });
    },
    [isDirty]
  );

  const menuRouteMatch = useMemo(
    () => findBestMenuRouteMatch(menuItems, pathname),
    [pathname, menuItems]
  );

  const selectedKey = menuRouteMatch?.key || pathname;
  const openKeys = menuRouteMatch?.parentKeys ?? [];

  const toggleCollapsed = useCallback(() => setCollapsed(!collapsed), [collapsed]);

  useEffect(() => {
    setMounted(true);
    const mainLayout = document.getElementById("main-content-layout");
    if (mainLayout) {
      mainLayout.style.marginLeft = collapsed ? "80px" : "270px";
      mainLayout.style.transition = "margin-left 0.5s ease";
    }
  }, [collapsed]);

  return (
    <>
      <Layout.Sider
        width={270}
        collapsedWidth={80}
        collapsed={collapsed}
        className="bg-gray-900! text-white! p-0!"
        style={{ position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100, overflow: "hidden" }}
        trigger={null}
      >
        <div className="flex flex-col h-full">
          <div className="shrink-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
              {!collapsed && (
                <div
                  className="flex items-center justify-center m-3"
                  style={{ width: 140, height: 40 }}
                >
                  <Image className="object-contain" src={Logo} alt="SAVINA Logo" priority />
                </div>
              )}
              <Button
                id="sidebar-toggle-btn"
                data-collapsed={collapsed}
                type="text"
                icon={collapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
                onClick={toggleCollapsed}
                className={`text-gray-300! hover:text-white! hover:bg-gray-700! border-0! transition-colors ${collapsed ? "w-full!" : ""}`}
                style={{ fontSize: "16px", height: "32px" }}
              />
            </div>

            <div className="transition-opacity duration-200" style={{ opacity: mounted ? 1 : 0 }}>
              <Menu
                className="bg-gray-900! border-0! overflow-y-auto"
                theme="dark"
                mode="inline"
                selectedKeys={[selectedKey]}
                defaultOpenKeys={openKeys}
                inlineCollapsed={collapsed}
                items={buildMenuItems(menuItems)}
                style={{
                  maxHeight: "calc(100vh - 64px - 70px)",
                  scrollbarWidth: "thin",
                }}
              />
            </div>
          </div>

          <div className="flex-1"></div>

          <div className="shrink-0">
            <UserProfile
              collapsed={collapsed}
              userName={fullName}
              roleLabel={roleLabel}
              isLoading={authLoading && !fullName}
            />
          </div>
        </div>
      </Layout.Sider>
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn chưa lưu thay đổi</AlertDialogTitle>
            <AlertDialogDescription>
              Có thay đổi chưa được lưu. Rời khỏi trang này, các thay đổi sẽ bị mất.
              <br />
              Bạn có muốn tiếp tục không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowUnsavedDialog(false);
                setPendingUrl("");
              }}
            >
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmNavigation}>Tiếp tục</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
