import { navigationConfig, NavItem } from "@/config/navigation";
import { ROLES } from "@/constants/roles";
import { SIDEBAR } from "@/constants/route";
import { useAppSelector } from "@/hooks/use-app-selector";

export type RolePermissions = Record<string, string[]>;

const getNavigationRouteKeys = (items: NavItem[]): string[] =>
  items.flatMap((item) => {
    const childKeys = item.children ? getNavigationRouteKeys(item.children) : [];
    return item.key.startsWith("/") ? [item.key, ...childKeys] : childKeys;
  });

const PAGE_ROUTE_KEYS = getNavigationRouteKeys(navigationConfig).sort(
  (left, right) => right.length - left.length
);

export const normalizePermissionPageKey = (pageKey: string) => {
  const rawPath = String(pageKey || "").split(/[?#]/)[0];
  const normalizedPath = rawPath.replace(/\/+$/, "") || "/";
  const matchedRoute = PAGE_ROUTE_KEYS.find(
    (route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`)
  );
  return matchedRoute || normalizedPath;
};

export const usePermissions = () => {
  const user = useAppSelector((state: any) => state.auth.user);
  const role = user?.role || "user";
  const userPermissions = user?.permissions || [];

  const isAdmin = role === ROLES.ADMIN;

  /**
   * Check if user has access to a specific page.
   * Admin always has access.
   * Other roles need either the specific page key or a __view action for that page.
   */
  const hasPageAccess = (pageKey: string) => {
    if (isAdmin) return true;
    const permissionPageKey = normalizePermissionPageKey(pageKey);
    return (
      userPermissions.includes(`${permissionPageKey}__view`) ||
      userPermissions.includes(permissionPageKey)
    );
  };

  /**
   * Check if user has access to a granular action within a page.
   * Admin always has access.
   */
  const hasActionAccess = (pageKey: string, actionKey: string) => {
    if (isAdmin) return true;
    const fullKey = `${normalizePermissionPageKey(pageKey)}__${actionKey}`;
    return userPermissions.includes(fullKey);
  };

  /**
   * Scan navigation config to find the first accessible route for redirection.
   */
  const getDefaultRoute = () => {
    if (isAdmin) return SIDEBAR.DASHBOARD;

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

  return { role, userPermissions, isAdmin, hasPageAccess, hasActionAccess, getDefaultRoute };
};
