"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { navigationConfig, NavItem } from "@/config/navigation";
import { ROLES } from "@/constants/roles";
import { useRoles } from "@/hooks/use-roles";
import { RolePermissions } from "@/hooks/use-permissions";
import { getUniqueSlug } from "@/lib/role-utils";
import permissionApi from "@/services/permission.service";
import roleApi, { type Role } from "@/services/role.service";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Tabs, Tree } from "antd";
import type { TabsProps } from "antd";
import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const ROLE_TAB_ORDER_STORAGE_KEY = "nag-role-permissions-tab-order";

const loadStoredRoleOrder = () => {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(ROLE_TAB_ORDER_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch (error) {
    return [];
  }
};

const saveStoredRoleOrder = (order: string[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROLE_TAB_ORDER_STORAGE_KEY, JSON.stringify(order));
};

function RoleTabAddIcon() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex size-4 items-center justify-center text-slate-600 transition hover:text-blue-600">
          <Plus className="size-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Thêm vai trò</p>
      </TooltipContent>
    </Tooltip>
  );
}

function RoleTabDeleteIcon({ roleLabel }: { roleLabel: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex size-4 items-center justify-center text-slate-500 transition hover:text-red-600"
          aria-label={`Xóa vai trò ${roleLabel}`}
        >
          <Trash2 className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Xóa vai trò</p>
      </TooltipContent>
    </Tooltip>
  );
}

function RoleDeleteDialog({
  role,
  submitting,
  onOpenChange,
  onConfirm,
}: {
  role: Role | null;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!role} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* <div className="mb-1 flex size-11 items-center justify-center rounded-md bg-red-50 text-red-600">
            <Trash2 className="size-5" />
          </div> */}
          <DialogTitle>Xóa vai trò?</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xóa vai trò {role ? `"${role.role_label}"` : "này"} không?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Hủy
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Xóa vai trò
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableRoleTabLabel({
  role,
  active,
  onEdit,
}: {
  role: Role;
  active: boolean;
  onEdit: (role: Role) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: role.role,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex max-w-[240px] items-center gap-2 ${
        active ? "font-semibold text-blue-700" : "text-slate-700"
      }`}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Kéo để sắp xếp vai trò ${role.role_label}`}
            className="inline-flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Kéo để sắp xếp</p>
        </TooltipContent>
      </Tooltip>
      <span className="truncate" title={role.role_label}>
        {role.role_label}
      </span>
      {role.role !== ROLES.ADMIN && active && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Chỉnh sửa vai trò ${role.role_label}`}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-blue-500 transition hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onEdit(role);
              }}
            >
              <Pencil className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Chỉnh sửa vai trò</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default function RolePermissionsManager() {
  const t = useTranslations();
  const { roles, loading: rolesLoading, refetch: refetchRoles } = useRoles();
  const [localPerms, setLocalPerms] = useState<RolePermissions>({});
  const [activeTab, setActiveTab] = useState("");
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleLabel, setRoleLabel] = useState("");
  const [roleLabelError, setRoleLabelError] = useState("");
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [roleDeleting, setRoleDeleting] = useState(false);
  const [roleOrder, setRoleOrder] = useState<string[]>([]);
  const visibleRoles = useMemo(() => roles.filter((role) => role.role !== ROLES.ADMIN), [roles]);
  const orderedRoles = useMemo(() => {
    const roleMap = new Map(visibleRoles.map((role) => [role.role, role]));
    const ordered = roleOrder
      .map((roleKey) => roleMap.get(roleKey))
      .filter((role): role is Role => Boolean(role));
    const missing = visibleRoles.filter((role) => !roleOrder.includes(role.role));

    return [...ordered, ...missing];
  }, [roleOrder, visibleRoles]);
  const selectedRoleKey =
    activeTab && orderedRoles.some((role) => role.role === activeTab)
      ? activeTab
      : orderedRoles[0]?.role || "";
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    let mounted = true;

    const fetchPerms = async () => {
      try {
        const res = await permissionApi.getPermissions();
        if (!mounted) return;
        // @ts-ignore - Backend returns { statusCode, data, message }
        setLocalPerms(res.data.data || {});
      } catch (error) {
        toast.error("Không thể tải danh sách quyền");
      } finally {
        if (mounted) setPermissionsLoading(false);
      }
    };

    fetchPerms();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const roleKeys = visibleRoles.map((role) => role.role);

    if (roleKeys.length === 0) {
      setRoleOrder([]);
      if (!rolesLoading) saveStoredRoleOrder([]);
      return;
    }

    setRoleOrder((currentOrder) => {
      const baseOrder = currentOrder.length > 0 ? currentOrder : loadStoredRoleOrder();
      const nextOrder = [
        ...baseOrder.filter((roleKey) => roleKeys.includes(roleKey)),
        ...roleKeys.filter((roleKey) => !baseOrder.includes(roleKey)),
      ];

      saveStoredRoleOrder(nextOrder);
      return nextOrder;
    });
  }, [rolesLoading, visibleRoles]);

  const loading = permissionsLoading || rolesLoading;

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
    if (!selectedRoleKey) return;

    const checkedKeys = checkedKeysValue as string[];
    const prevCheckedKeys = localPerms[selectedRoleKey] || [];

    const added = checkedKeys.filter((key) => !prevCheckedKeys.includes(key));
    const removed = prevCheckedKeys.filter((key) => !checkedKeys.includes(key));

    let finalCheckedKeys = [...checkedKeys];

    added.forEach((key) => {
      if (key.includes("__") && !key.endsWith("__view")) {
        const pageKey = key.split("__")[0];
        const viewKey = `${pageKey}__view`;
        if (!finalCheckedKeys.includes(viewKey)) {
          finalCheckedKeys.push(viewKey);
        }
      }
    });

    removed.forEach((key) => {
      if (key.endsWith("__view")) {
        const pageKey = key.split("__view")[0];
        finalCheckedKeys = finalCheckedKeys.filter(
          (itemKey) => !itemKey.startsWith(`${pageKey}__`)
        );
      }
    });

    const getLeafKeys = (nodes: any[]): string[] => {
      let leaves: string[] = [];
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          leaves = leaves.concat(getLeafKeys(node.children));
        } else {
          leaves.push(node.key);
        }
      }
      return leaves;
    };

    const leafKeys = getLeafKeys(treeData);
    finalCheckedKeys = finalCheckedKeys.filter((key) => leafKeys.includes(key));

    setLocalPerms((prev) => ({
      ...prev,
      [selectedRoleKey]: Array.from(new Set(finalCheckedKeys)),
    }));
  };

  const openCreateRoleModal = () => {
    setEditingRole(null);
    setRoleLabel("");
    setRoleLabelError("");
    setRoleModalOpen(true);
  };

  const openEditRoleModal = (role: Role) => {
    setEditingRole(role);
    setRoleLabel(role.role_label);
    setRoleLabelError("");
    setRoleModalOpen(true);
  };

  const closeRoleModal = (force = false) => {
    if (roleSubmitting && !force) return;

    setRoleModalOpen(false);
    setRoleLabelError("");
  };

  const handleSubmitRole = async () => {
    if (roleSubmitting) return;

    const trimmedName = roleLabel.trim();

    if (!trimmedName) {
      setRoleLabelError("Vui lòng nhập tên vai trò");
      return;
    }

    if (trimmedName.length > 100) {
      setRoleLabelError("Tên vai trò quá dài");
      return;
    }

    const duplicateRole = roles.some(
      (role) =>
        role.role_label.trim().toLowerCase() === trimmedName.toLowerCase() &&
        role.id !== editingRole?.id
    );

    if (duplicateRole) {
      setRoleLabelError(t("Common.duplicateRoleError"));
      return;
    }

    setRoleLabelError("");
    setRoleSubmitting(true);

    try {
      if (editingRole) {
        const updatedRole = await roleApi.update(editingRole.id, { role_label: trimmedName });
        await refetchRoles();
        toast.success(`Đã cập nhật vai trò ${updatedRole.role_label}`);
      } else {
        const roleSlug = getUniqueSlug(
          trimmedName,
          roles.map((role) => role.role)
        );
        if (!roleSlug) {
          setRoleLabelError("Tên vai trò không hợp lệ");
          return;
        }

        const createdRole = await roleApi.create({ role: roleSlug, role_label: trimmedName });
        await refetchRoles();
        setLocalPerms((prev) => ({ ...prev, [createdRole.role]: [] }));
        setActiveTab(createdRole.role);
        toast.success(`Đã tạo vai trò ${createdRole.role_label}`);
      }

      closeRoleModal(true);
    } catch (error) {
      const message = (error as any)?.response?.data?.message || (error as Error)?.message;
      toast.error("Không thể lưu vai trò", { description: message });
    } finally {
      setRoleSubmitting(false);
    }
  };

  const closeDeleteRoleDialog = (force = false) => {
    if (roleDeleting && !force) return;
    setDeletingRole(null);
  };

  const handleConfirmDeleteRole = async () => {
    if (!deletingRole || roleDeleting) return;

    const role = deletingRole;
    setRoleDeleting(true);

    try {
      await roleApi.delete(role.id);
      const nextRoles = await refetchRoles();
      setLocalPerms((prev) => {
        const nextPerms = { ...prev };
        delete nextPerms[role.role];
        return nextPerms;
      });
      setRoleOrder((currentOrder) => {
        const nextOrder = currentOrder.filter((roleKey) => roleKey !== role.role);
        saveStoredRoleOrder(nextOrder);
        return nextOrder;
      });
      setActiveTab((current) => {
        if (current !== role.role) return current;
        return (
          orderedRoles.find((item) => item.role !== role.role)?.role ||
          nextRoles.find((item) => item.role !== ROLES.ADMIN)?.role ||
          ""
        );
      });
      toast.success(`Đã xóa vai trò ${role.role_label}`);
      closeDeleteRoleDialog(true);
    } catch (error) {
      const message = (error as any)?.response?.data?.message || (error as Error)?.message;
      if (message === "ERR_ROLES::ROLE_IN_USE") {
        toast.error("Không thể xóa vai trò", {
          description: "Tồn tại tài khoản sử dụng vai trò này!",
        });
        return;
      }
      toast.error("Không thể xóa vai trò", { description: message });
    } finally {
      setRoleDeleting(false);
    }
  };

  const handleTabsEdit: TabsProps["onEdit"] = (targetKey, action) => {
    if (action === "add") {
      openCreateRoleModal();
      return;
    }

    const roleKey = String(targetKey);
    const role = roles.find((item) => item.role === roleKey);
    if (!role || role.role === ROLES.ADMIN || role.role !== selectedRoleKey) return;

    setDeletingRole(role);
  };

  const handleRoleTabDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const currentOrder = orderedRoles.map((role) => role.role);
    const oldIndex = currentOrder.indexOf(String(active.id));
    const newIndex = currentOrder.indexOf(String(over.id));

    if (oldIndex < 0 || newIndex < 0) return;

    const nextOrder = arrayMove(currentOrder, oldIndex, newIndex);
    setRoleOrder(nextOrder);
    saveStoredRoleOrder(nextOrder);
  };

  const treeData = useMemo(() => {
    const buildTree = (items: NavItem[]): any[] => {
      return items.reduce<any[]>((nodes, item) => {
        if (item.roles && !item.roles.includes(selectedRoleKey)) {
          return nodes;
        }

        const hasActions = item.actions && item.actions.length > 0;
        const hasChildren = item.children && item.children.length > 0;

        nodes.push({
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
        });

        return nodes;
      }, []);
    };

    return buildTree(navigationConfig);
  }, [t, selectedRoleKey]);

  const renderRoleLabel = (role: Role) => (
    <SortableRoleTabLabel
      role={role}
      active={role.role === selectedRoleKey}
      onEdit={openEditRoleModal}
    />
  );

  return (
    <TooltipProvider>
      <div className="flex h-full w-full flex-col gap-4 p-10">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Phân quyền vai trò
            </h1>
            <p className="mt-1 text-muted-foreground">
              Quản lý quyền truy cập các chức năng dựa trên vai trò người dùng
            </p>
          </div>
          <Button
            onClick={handleSave}
            className="gap-2"
            disabled={loading || visibleRoles.length === 0}
          >
            <Save className="size-4" />
            Lưu thay đổi
          </Button>
        </div>

        <Card className="flex flex-1 flex-col overflow-hidden border-gray-200 shadow-sm dark:border-gray-800">
          <CardHeader className="border-b border-gray-100 bg-gray-50/50 pb-3 dark:border-gray-800/60 dark:bg-gray-900/20">
            <CardTitle className="text-lg font-medium">Chi tiết quyền hạn</CardTitle>
            <CardDescription>Chọn một vai trò để chỉnh sửa quyền truy cập của họ.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRoleTabDragEnd}
            >
              <SortableContext
                items={orderedRoles.map((role) => role.role)}
                strategy={horizontalListSortingStrategy}
              >
                <Tabs
                  type="editable-card"
                  activeKey={selectedRoleKey}
                  onChange={setActiveTab}
                  onEdit={handleTabsEdit}
                  addIcon={<RoleTabAddIcon />}
                  locale={{ addAriaLabel: "Thêm vai trò", removeAriaLabel: "Xóa vai trò" }}
                  className="w-full [&_.ant-tabs-tab-active]:!border-blue-300 [&_.ant-tabs-tab-active]:!bg-blue-50 [&_.ant-tabs-tab-active]:shadow-sm [&_.ant-tabs-tab-active]:ring-1 [&_.ant-tabs-tab-active]:ring-blue-100 [&_.ant-tabs-tab-active_.ant-tabs-tab-btn]:!text-blue-700"
                  items={orderedRoles.map((role) => ({
                    key: role.role,
                    label: renderRoleLabel(role),
                    closable: role.role === selectedRoleKey,
                    closeIcon:
                      role.role === selectedRoleKey ? (
                        <RoleTabDeleteIcon roleLabel={role.role_label} />
                      ) : null,
                    children: (
                      <div
                        className="max-h-[480px] overflow-y-auto rounded-md border border-gray-200 bg-white p-4 
                  dark:border-gray-800 dark:bg-gray-950"
                      >
                        {loading ? (
                          <div className="flex h-full items-center justify-center">Đang tải…</div>
                        ) : (
                          <Tree
                            checkable
                            treeData={treeData}
                            checkedKeys={localPerms[role.role] || []}
                            onCheck={handleCheck}
                          />
                        )}
                      </div>
                    ),
                  }))}
                />
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>

        <Dialog
          open={roleModalOpen}
          onOpenChange={(open) => {
            if (!open) closeRoleModal();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{editingRole ? "Sửa tên vai trò" : "Tạo vai trò mới"}</DialogTitle>
                <DialogDescription>
                  {editingRole
                    ? "Cập nhật tên hiển thị của vai trò đang chọn."
                    : "Nhập tên vai trò để tạo tab phân quyền mới."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="role-label">Tên vai trò</Label>
                <Input
                  id="role-label"
                  value={roleLabel}
                  maxLength={100}
                  placeholder="VD: Giám sát viên"
                  aria-invalid={!!roleLabelError}
                  onChange={(event) => {
                    setRoleLabel(event.target.value);
                    if (roleLabelError) setRoleLabelError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSubmitRole();
                  }}
                />
                <p
                  className={`min-h-4 text-xs font-medium ${roleLabelError ? "text-red-500" : "text-transparent"}`}
                >
                  {roleLabelError || " "}
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => closeRoleModal()}
                  disabled={roleSubmitting}
                >
                  Hủy
                </Button>
                <Button type="button" onClick={handleSubmitRole} disabled={roleSubmitting}>
                  {roleSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {editingRole ? "Lưu" : "Tạo"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
        <RoleDeleteDialog
          role={deletingRole}
          submitting={roleDeleting}
          onOpenChange={(open) => {
            if (!open) closeDeleteRoleDialog();
          }}
          onConfirm={handleConfirmDeleteRole}
        />
      </div>
    </TooltipProvider>
  );
}
