"use client";

import { RolePermissions, usePermissions } from "@/hooks/use-permissions";
import { useTranslations } from "next-intl";
import { Button, Card, Tabs, Tree, message, Alert } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { useState, useMemo } from "react";
import { navigationConfig, NavItem } from "@/config/navigation";

export default function RolePermissionsManager() {
  const t = useTranslations();
  const { permissions, savePermissions } = usePermissions();
  const [localPerms, setLocalPerms] = useState<RolePermissions>(permissions);
  const [activeTab, setActiveTab] = useState("manager");

  const handleSave = () => {
    savePermissions(localPerms);
    message.success("Lưu quyền thành công");
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
    <div className="flex flex-col gap-4 p-4 md:p-6 h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Phân quyền vai trò</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Quản lý quyền truy cập các chức năng dựa trên vai trò người dùng
          </p>
        </div>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          size="large"
        >
          Lưu thay đổi
        </Button>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <Alert
          message="Hướng dẫn tích hợp Backend (Dành cho Developer)"
          description="Hiện tại phân quyền đang lưu tạm ở localStorage. Khi backend sẵn sàng, cập nhật hook `usePermissions` gọi API GET /api/permissions và thêm hàm lưu gọi PUT /api/permissions."
          type="info"
          showIcon
          className="mb-4"
        />

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={roles.map(role => ({
            key: role.key,
            label: role.label,
            children: (
              <div className="p-4 border border-gray-200 rounded-md bg-gray-50 max-h-[500px] overflow-y-auto">
                <Tree
                  checkable
                  // defaultExpandAll
                  treeData={treeData}
                  checkedKeys={localPerms[role.key] || []}
                  onCheck={handleCheck}
                />
              </div>
            )
          }))}
        />
      </Card>
    </div>
  );
}
