"use client";

import { RolePermissions, usePermissions } from "@/hooks/use-permissions";
import { useTranslations } from "next-intl";
import { Tree, Tabs } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useState, useMemo } from "react";
import { navigationConfig, NavItem } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { toast } from "sonner";

export default function RolePermissionsManager() {
  const t = useTranslations();
  const { permissions, savePermissions } = usePermissions();
  const [localPerms, setLocalPerms] = useState<RolePermissions>(permissions);
  const [activeTab, setActiveTab] = useState("manager");

  const handleSave = () => {
    savePermissions(localPerms);
    toast.success("Lưu quyền thành công");
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
    { key: "manager", label: t("Sidebar.role.manager") },
    { key: "dispatcher", label: t("Sidebar.role.dispatcher") },
    { key: "driver", label: t("Sidebar.role.driver") },
    { key: "user", label: t("Sidebar.role.user") },
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
        <Button onClick={handleSave} className="gap-2">
          <SaveOutlined />
          Lưu thay đổi
        </Button>
      </div>

      <Alert className="bg-blue-50/50 text-blue-900 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/50">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertTitle className="font-semibold text-blue-800 dark:text-blue-300">Hướng dẫn tích hợp Backend (Dành cho Developer)</AlertTitle>
        <AlertDescription className="text-blue-700/80 dark:text-blue-300/80 mt-1">
          Hiện tại phân quyền đang lưu tạm ở localStorage. Khi backend sẵn sàng, cập nhật hook <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded text-xs font-mono">usePermissions</code> gọi API GET /api/permissions và thêm hàm lưu gọi PUT /api/permissions.
        </AlertDescription>
      </Alert>

      <Card className="flex-1 shadow-sm border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/20">
          <CardTitle className="text-lg font-medium">Chi tiết quyền hạn</CardTitle>
          <CardDescription>Chọn một vai trò để chỉnh sửa quyền truy cập của họ.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex">
          <Tabs type="card"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={roles.map(role => ({
              key: role.key,
              label: role.label,
              children: (
                <div
                  className="p-4 border border-gray-200 dark:border-gray-800 rounded-md 
                  bg-white dark:bg-gray-950 max-h-[380px] 
                  overflow-y-auto">
                  <Tree
                    checkable
                    treeData={treeData}
                    checkedKeys={localPerms[role.key] || []}
                    onCheck={handleCheck}
                  />
                </div>
              )
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
