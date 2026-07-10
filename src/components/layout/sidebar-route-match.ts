export interface MenuRouteItem {
  key: string;
  children?: MenuRouteItem[];
}

export interface MenuRouteMatch {
  key: string;
  parentKeys: string[];
}

export const normalizeMenuPath = (path: string) => {
  const rawPath = String(path || "").split(/[?#]/)[0];
  return rawPath.replace(/\/+$/, "") || "/";
};

export const isMenuRouteMatch = (currentPath: string, itemKey: string) => {
  if (!itemKey.startsWith("/")) return false;

  const normalizedPath = normalizeMenuPath(currentPath);
  const normalizedKey = normalizeMenuPath(itemKey);

  return normalizedPath === normalizedKey || normalizedPath.startsWith(`${normalizedKey}/`);
};

export const findBestMenuRouteMatch = (
  items: MenuRouteItem[],
  currentPath: string,
  parentKeys: string[] = []
): MenuRouteMatch | null => {
  let bestMatch: MenuRouteMatch | null = null;

  for (const item of items) {
    if (isMenuRouteMatch(currentPath, item.key)) {
      if (!bestMatch || item.key.length > bestMatch.key.length) {
        bestMatch = { key: item.key, parentKeys };
      }
    }

    if (item.children) {
      const childMatch = findBestMenuRouteMatch(item.children, currentPath, [
        ...parentKeys,
        item.key,
      ]);
      if (childMatch && (!bestMatch || childMatch.key.length > bestMatch.key.length)) {
        bestMatch = childMatch;
      }
    }
  }

  return bestMatch;
};
