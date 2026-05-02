import { navigationConfig, NavItem } from "@/config/navigation";
import { ROLES } from "@/constants/roles";
import { useAppSelector } from "@/hooks/use-app-selector";
import { useEffect, useState } from "react";

export type RolePermissions = Record<string, string[]>;

export const DEFAULT_PERMISSIONS: RolePermissions = {
  manager: [
    "/dashboard", "/dashboard__view", "/dashboard__manual_sort", "/dashboard__sync_slots",
    "/user-manage", "/user-manage__view", "/user-manage__add", "/user-manage__edit", "/user-manage__delete",
    "/vehicles", "/vehicles__view", "/vehicles__add", "/vehicles__edit", "/vehicles__delete",
    "/vehicle-maintenances", "/vehicle-maintenances__view", "/vehicle-maintenances__add", "/vehicle-maintenances__edit", "/vehicle-maintenances__delete",
    "/vehicle-types", "/vehicle-types__view", "/vehicle-types__add", "/vehicle-types__edit", "/vehicle-types__delete",
    "/stations", "/stations__view", "/stations__add", "/stations__edit", "/stations__delete",
    "/system-settings", "/system-settings__view", "/system-settings__edit",
    "tools-group",
    "/meal-check", "/meal-check__view", "/meal-check__add", "/meal-check__edit", "/meal-check__delete",
    "/attendance", "/attendance__view", "/attendance__add", "/attendance__edit", "/attendance__delete",
  ],
  dispatcher: [
    "/dashboard", "/dashboard__view", "/dashboard__manual_sort", "/dashboard__sync_slots",
    "/stations", "/stations__view",
    "tools-group",
    "/meal-check", "/meal-check__view", "/meal-check__add", "/meal-check__edit", "/meal-check__delete",
    "/attendance", "/attendance__view", "/attendance__add", "/attendance__edit", "/attendance__delete",
  ],
  driver: [
    "/dashboard", "/dashboard__view",
  ],
  user: [
    "/dashboard", "/dashboard__view",
  ]
};

const STORAGE_KEY = "RBAC_PERMISSIONS";

export const getStoredPermissions = (): RolePermissions => {
  if (typeof window === "undefined") return DEFAULT_PERMISSIONS;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse permissions", e);
    }
  }
  return DEFAULT_PERMISSIONS;
};

export const savePermissions = (perms: RolePermissions) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(perms));
    window.dispatchEvent(new Event("permissions_updated"));
  }
};

export const usePermissions = () => {
  const user = useAppSelector((state: any) => state.auth.user);
  const role = user?.role || "user";
  const userPermissions = user?.permissions || [];
  const [permissions, setPermissions] = useState<RolePermissions>(getStoredPermissions());

  useEffect(() => {
    const handleUpdate = () => {
      setPermissions(getStoredPermissions());
    };
    window.addEventListener("permissions_updated", handleUpdate);
    return () => window.removeEventListener("permissions_updated", handleUpdate);
  }, []);

  const isAdmin = role === ROLES.ADMIN;
  const rolePerms = permissions[role] || [];

  /**
   * Check if user has access to a specific page.
   * Admin always has access.
   * Other roles need either the specific page key or a __view action for that page.
   */
  const hasPageAccess = (pageKey: string) => {
    if (isAdmin) return true;
    return userPermissions.includes(`${pageKey}__view`) || userPermissions.includes(pageKey) || rolePerms.includes(`${pageKey}__view`) || rolePerms.includes(pageKey);
  };

  /**
   * Check if user has access to a granular action within a page.
   * Admin always has access.
   */
  const hasActionAccess = (pageKey: string, actionKey: string) => {
    if (isAdmin) return true;
    const fullKey = `${pageKey}__${actionKey}`;
    return userPermissions.includes(fullKey) || rolePerms.includes(fullKey);
  };

  /**
   * Scan navigation config to find the first accessible route for redirection.
   */
  const getDefaultRoute = () => {
    if (isAdmin) return "/dashboard";

    const findFirst = (items: NavItem[]): string | null => {
      for (const item of items) {
        if (item.children) {
          const found = findFirst(item.children);
          if (found) return found;
        }
        // Check if it's a real route (starts with /) and user has access
        if (item.key.startsWith("/") && hasPageAccess(item.key)) {
          return item.key;
        }
      }
      return null;
    };

    return findFirst(navigationConfig) || "/login";
  };

  return { role, userPermissions, isAdmin, hasPageAccess, hasActionAccess, getDefaultRoute, permissions, rolePerms, savePermissions };
};
