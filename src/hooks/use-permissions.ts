import { useAppSelector } from "@/hooks/use-app-selector";
import { useEffect, useState } from "react";
import { navigationConfig, NavItem } from "@/config/navigation";

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

  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PERMISSIONS));
  return DEFAULT_PERMISSIONS;
};

export const savePermissions = (perms: RolePermissions) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(perms));
    // Dispatch a custom event so other tabs/components can re-render if needed
    window.dispatchEvent(new Event("permissions_updated"));
  }
};

export const usePermissions = () => {
  const role = useAppSelector((state: any) => state.auth.user?.role) || "user";
  const [permissions, setPermissions] = useState<RolePermissions>(getStoredPermissions());

  useEffect(() => {
    const handleUpdate = () => {
      setPermissions(getStoredPermissions());
    };
    window.addEventListener("permissions_updated", handleUpdate);
    return () => window.removeEventListener("permissions_updated", handleUpdate);
  }, []);

  const isAdmin = role === "admin";
  const rolePerms = permissions[role] || [];

  const hasPageAccess = (pageKey: string) => {
    if (isAdmin) return true;
    // Strictly require __view if it's meant to be controlled by it, or the page key itself
    return rolePerms.includes(`${pageKey}__view`) || rolePerms.includes(pageKey);
  };

  const hasActionAccess = (pageKey: string, actionKey: string) => {
    if (isAdmin) return true;
    const fullKey = `${pageKey}__${actionKey}`;
    return rolePerms.includes(fullKey);
  };

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

  return {
    permissions,
    rolePerms,
    isAdmin,
    hasPageAccess,
    hasActionAccess,
    getDefaultRoute,
    savePermissions
  };
};
