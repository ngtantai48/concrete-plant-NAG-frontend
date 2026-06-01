"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { navigationConfig, NavItem } from "@/config/navigation";
import { ROLES } from "@/constants/roles";
import { SIDEBAR } from "@/constants/route";
import { RolePermissions } from "@/hooks/use-permissions";
import permissionApi from "@/services/permission.service";
import { SaveOutlined } from "@ant-design/icons";
import { Tabs, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const ROLE_KEYS = [ROLES.MANAGER, ROLES.DISPATCHER, ROLES.DRIVER, ROLES.USER];
const DEFAULT_EXPANDED_KEYS = [
  "category-group",
  SIDEBAR.VEHICLE_TYPES,
  SIDEBAR.DEPARTMENTS,
  SIDEBAR.SKILLS,
  SIDEBAR.USER_ASSIGNMENTS,
];

const collectPermissionKeys = (items: NavItem[]) => {
  const keys = new Set<string>();

  const walk = (navItems: NavItem[]) => {
    navItems.forEach((item) => {
      item.actions?.forEach((action) => {
        keys.add(`${item.key}__${action.key}`);
      });

      if (item.children) {
        walk(item.children);
      }
    });
  };

  walk(items);
  return keys;
};

const collectNavigationNodeKeys = (items: NavItem[]) => {
  const keys = new Set<string>();

  const walk = (navItems: NavItem[]) => {
    navItems.forEach((item) => {
      keys.add(item.key);

      if (item.children) {
        walk(item.children);
      }
    });
  };

  walk(items);
  return keys;
};

const normalizePermissionBuckets = (permissions: RolePermissions): RolePermissions => {
  const normalized: RolePermissions = { ...permissions };

  ROLE_KEYS.forEach((role) => {
    normalized[role] = Array.from(new Set(normalized[role] || []));
  });

  return normalized;
};

export default function RolePermissionsManager() {
  const t = useTranslations();
  const [localPerms, setLocalPerms] = useState<RolePermissions>({});
  const [activeTab, setActiveTab] = useState("manager");
  const [loading, setLoading] = useState(true);
  const validPermissionKeys = useMemo(() => collectPermissionKeys(navigationConfig), []);
  const navigationNodeKeys = useMemo(() => collectNavigationNodeKeys(navigationConfig), []);

  useEffect(() => {
    const fetchPerms = async () => {
      try {
        const res = await permissionApi.getPermissions();
        // @ts-ignore - Backend returns { statusCode, data, message }
        setLocalPerms(normalizePermissionBuckets(res.data.data || {}));
      } catch (error) {
        toast.error("Không thể tải danh sách quyền");
      } finally {
        setLoading(false);
      }
    };
    fetchPerms();
  }, []);

  const handleSave = async () => {
    try {
      const normalizedPerms = normalizePermissionBuckets(localPerms);
      const res = await permissionApi.updatePermissions(normalizedPerms);
      if (res.data && res.data.data) {
        setLocalPerms(normalizePermissionBuckets(res.data.data));
      }
      toast.success("Lưu quyền thành công");
    } catch (error) {
      toast.error("Không thể lưu quyền");
    }
  };

  const handleCheck = (checkedKeysValue: any) => {
    const checkedKeys: string[] = (
      Array.isArray(checkedKeysValue) ? checkedKeysValue : checkedKeysValue?.checked || []
    ).map((key: unknown) => String(key));
    const prevCheckedKeys = localPerms[activeTab] || [];
    const preservedUnknownKeys = prevCheckedKeys.filter(
      (key) => !validPermissionKeys.has(key) && !navigationNodeKeys.has(key)
    );

    // Tìm các key mới được check và các key vừa bị bỏ check
    const added = checkedKeys.filter((k) => !prevCheckedKeys.includes(k));
    const removed = prevCheckedKeys.filter((k) => !checkedKeys.includes(k));

    let finalCheckedKeys = checkedKeys.filter((key) => validPermissionKeys.has(key));

    // Trường hợp 1: Nếu check một hành động (Add, Edit, Delete...) mà chưa check "Xem"
    added.forEach((key) => {
      if (key.includes("__") && !key.endsWith("__view")) {
        const pageKey = key.split("__")[0];
        const viewKey = `${pageKey}__view`;
        if (!finalCheckedKeys.includes(viewKey)) {
          finalCheckedKeys.push(viewKey);
        }
      }
    });

    // Trường hợp 2: Nếu bỏ check "Xem", thì tự động bỏ check tất cả các hành động khác của trang đó
    removed.forEach((key) => {
      if (key.endsWith("__view")) {
        const pageKey = key.split("__view")[0];
        finalCheckedKeys = finalCheckedKeys.filter((k) => !k.startsWith(`${pageKey}__`));
      }
    });

    setLocalPerms({
      ...localPerms,
      [activeTab]: Array.from(new Set([...preservedUnknownKeys, ...finalCheckedKeys])),
    });
  };

  const roles = [
    { key: ROLES.MANAGER, label: t("Sidebar.role.manager") },
    { key: ROLES.DISPATCHER, label: t("Sidebar.role.dispatcher") },
    { key: ROLES.DRIVER, label: t("Sidebar.role.driver") },
    { key: ROLES.USER, label: t("Sidebar.role.user") },
  ];

  const treeData = useMemo(() => {
    const buildTree = (items: NavItem[]): DataNode[] => {
      return items
        .filter((item) => {
          // Only show items that this role is allowed to see/have
          if (item.roles && !item.roles.includes(activeTab)) {
            return false;
          }
          return true;
        })
        .map((item) => {
          const hasActions = item.actions && item.actions.length > 0;
          const hasChildren = item.children && item.children.length > 0;

          return {
            title: t(`Sidebar.${item.label}`),
            key: item.key,
            children: [
              ...(hasActions
                ? item.actions!.map((action) => ({
                    title: action.label,
                    key: `${item.key}__${action.key}`,
                  }))
                : []),
              ...(hasChildren ? buildTree(item.children!) : []),
            ],
          };
        });
    };
    return buildTree(navigationConfig);
  }, [t, activeTab]);

  return (
    <div className="flex flex-col gap-4 p-10 h-full w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Phân quyền vai trò
          </h1>
          <p className="text-muted-foreground mt-1">
            Quản lý quyền truy cập các chức năng dựa trên vai trò người dùng
          </p>
        </div>
        <Button onClick={handleSave} className="gap-2" disabled={loading}>
          <SaveOutlined />
          Lưu thay đổi
        </Button>
      </div>

      <Card className="flex-1 shadow-sm border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/20">
          <CardTitle className="text-lg font-medium">Chi tiết quyền hạn</CardTitle>
          <CardDescription>Chọn một vai trò để chỉnh sửa quyền truy cập của họ.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex">
          <Tabs
            type="card"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={roles.map((role) => ({
              key: role.key,
              label: role.label,
              children: (
                <div
                  className="p-4 border border-gray-200 dark:border-gray-800 rounded-md 
                  bg-white dark:bg-gray-950 max-h-[480px] 
                  overflow-y-auto"
                >
                  {loading ? (
                    <div className="flex items-center justify-center h-full">Đang tải...</div>
                  ) : (
                    <Tree
                      checkable
                      defaultExpandedKeys={DEFAULT_EXPANDED_KEYS}
                      treeData={treeData}
                      checkedKeys={localPerms[role.key] || []}
                      onCheck={handleCheck}
                    />
                  )}
                </div>
              ),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
