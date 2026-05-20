"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { navigationConfig, NavItem } from "@/config/navigation";
import { ROLES } from "@/constants/roles";
import { RolePermissions } from "@/hooks/use-permissions";
import permissionApi from "@/services/permission.service";
import { SaveOutlined } from "@ant-design/icons";
import { Tabs, Tree } from "antd";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function RolePermissionsManager() {
  const t = useTranslations();
  const [localPerms, setLocalPerms] = useState<RolePermissions>({});
  const [activeTab, setActiveTab] = useState("manager");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPerms = async () => {
      try {
        const res = await permissionApi.getPermissions();
        // @ts-ignore - Backend returns { statusCode, data, message }
        setLocalPerms(res.data.data || {});
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
      const res = await permissionApi.updatePermissions(localPerms);
      if (res.data && res.data.data) {
        setLocalPerms(res.data.data);
      }
      toast.success("Lưu quyền thành công");
    } catch (error) {
      toast.error("Không thể lưu quyền");
    }
  };

  const handleCheck = (checkedKeysValue: any) => {
    const checkedKeys = checkedKeysValue as string[];
    const prevCheckedKeys = localPerms[activeTab] || [];

    // Tìm các key mới được check và các key vừa bị bỏ check
    const added = checkedKeys.filter((k) => !prevCheckedKeys.includes(k));
    const removed = prevCheckedKeys.filter((k) => !checkedKeys.includes(k));

    let finalCheckedKeys = [...checkedKeys];

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
      [activeTab]: Array.from(new Set(finalCheckedKeys)),
    });
  };

  const roles = [
    { key: ROLES.MANAGER, label: t("Sidebar.role.manager") },
    { key: ROLES.DISPATCHER, label: t("Sidebar.role.dispatcher") },
    { key: ROLES.DRIVER, label: t("Sidebar.role.driver") },
    { key: ROLES.USER, label: t("Sidebar.role.user") },
  ];

  const treeData = useMemo(() => {
    const buildTree = (items: NavItem[]): any[] => {
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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Phân quyền vai trò</h1>
          <p className="text-muted-foreground mt-1">
            Quản lý quyền truy cập các chức năng dựa trên vai trò người dùng
          </p>
        </div>
        <Button onClick={handleSave} className="gap-2" disabled={loading}>
          <SaveOutlined />Lưu thay đổi
        </Button>
      </div>

      <Card className="flex-1 shadow-sm border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/20">
          <CardTitle className="text-lg font-medium">Chi tiết quyền hạn</CardTitle>
          <CardDescription>Chọn một vai trò để chỉnh sửa quyền truy cập của họ.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex">
          <Tabs type="card" activeKey={activeTab} onChange={setActiveTab}
            items={roles.map(role => ({
              key: role.key, label: role.label,
              children: (
                <div
                  className="p-4 border border-gray-200 dark:border-gray-800 rounded-md 
                  bg-white dark:bg-gray-950 max-h-[480px] 
                  overflow-y-auto"
                >
                  {loading ? (
                    <div className="flex items-center justify-center h-full">Đang tải...</div>
                  ) : (
                    <Tree checkable
                      treeData={treeData}
                      checkedKeys={localPerms[role.key] || []}
                      onCheck={handleCheck}
                    />
                  )}
                </div>
              )
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
