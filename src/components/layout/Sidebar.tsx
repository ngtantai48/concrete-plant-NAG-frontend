"use client";

import Logo from "@/assets/images/logo.png";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { navigationConfig, NavItem } from "@/config/navigation";
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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const UserProfile = ({ collapsed, userName, userRole, isLoading }: {
  collapsed: boolean;
  userName?: string;
  userRole?: string;
  isLoading?: boolean;
}) => {
  const t = useTranslations("Sidebar");

  const roleMap: Record<string, string> = {
    admin: t("role.admin"),
    manager: t("role.manager"),
    dispatcher: t("role.dispatcher"),
    driver: t("role.driver"),
    user: t("role.user"),
  };

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
                <p className="text-gray-400 text-xs truncate m-0">
                  {userRole ? roleMap[userRole] || userRole : t("role.user")}
                </p>
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
  const searchParams = useSearchParams();
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
      fullName: auth.user?.fullName,
      authLoading: auth.loading,
    })
  );

  const { role, fullName, authLoading } = useAppSelector(selectAuth);

  const fullPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const baseMenuItems = useMemo(() => {
    const translateItems = (items: NavItem[]): any[] => {
      return items.map((item) => ({
        ...item,
        label: t(item.label),
        children: item.children ? translateItems(item.children) : undefined,
      }));
    };
    return translateItems(navigationConfig);
  }, [t]);

  const menuItems = useMemo(() => {
    const filterItems = (items: any[]): any[] => {
      return items
        .map(item => ({ ...item }))
        .filter((item) => {
          // 1. Check if item is restricted to specific roles
          if (item.roles && !item.roles.includes(role || "")) {
            return false;
          }

          if (item.children) {
            item.children = filterItems(item.children);
            // Folder is visible if it has visible children
            return item.children.length > 0;
          }
          // All items now rely on RBAC check
          return hasPageAccess(item.key);
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
    (items: any[]): MenuProps["items"] => {
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

  const selectedKey = useMemo(() => {
    const findMatchedKey = (items: any[]): string | null => {
      for (const item of items) {
        if (item.children) {
          const childMatch = findMatchedKey(item.children);
          if (childMatch) return childMatch;
        }
        if (fullPath === item.key || fullPath.startsWith(item.key)) {
          return item.key;
        }
      }
      return null;
    };
    return findMatchedKey(menuItems) || fullPath;
  }, [fullPath, menuItems]);

  const openKeys = useMemo(() => {
    for (const item of menuItems) {
      if (item.children) {
        for (const child of item.children) {
          if (fullPath === child.key || fullPath.startsWith(child.key)) {
            return [item.key];
          }
        }
      }
    }
    return [];
  }, [fullPath, menuItems]);

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
      <Layout.Sider width={270} collapsedWidth={80} collapsed={collapsed}
        className="bg-gray-900! text-white! p-0!"
        style={{ position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100, overflow: "hidden" }}
        trigger={null}
      >
        <div className="flex flex-col h-full">
          <div className="shrink-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
              {!collapsed && (
                <div className="flex items-center justify-center m-3" style={{ width: 140, height: 40 }}>
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
              userRole={role}
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
