"use client";

import UserSearch, { type UserSearchField } from "@/components/features/user-manage/UserSearch";
import UserCreateModal from "@/components/form/UserCreateModal";
import UserEditModal from "@/components/form/UserEditModal";
import { Button } from "@/components/ui/button";
import {
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Pagination as ShadcnPagination,
} from "@/components/ui/pagination";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-selector";
import { usePermissions } from "@/hooks/use-permissions";
import { userApi } from "@/services/user.service";
import { clearUsers, deleteUser, fetchUsers, setPagination } from "@/store/slices/userSlice";
import type { User } from "@/types/user";
import { Popconfirm, Space, Table, Tooltip } from "antd";
import type { ColumnType } from "antd/es/table";
import { CalendarDays, Loader, PencilLine, RefreshCw, Trash, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const normalizeDate = (date?: string | null) => {
  if (!date) return "-";
  return date.split("T")[0];
};

export default function TableUsers() {
  const t = useTranslations("UserManage");
  const tCommon = useTranslations("Common");
  const tRoles = useTranslations("Sidebar.role");
  const { hasActionAccess } = usePermissions();
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();

  const { pages, loading, total, page, limit } = useAppSelector((state) => state.users);

  const [openCreate, setOpenCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [searchUsers, setSearchUsers] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);

  const searchField = (searchParams.get("searchField") || "user_full_name") as UserSearchField;
  const query = searchParams.get("query") || "";

  useEffect(() => {
    dispatch(setPagination({ page: 1, limit }));
  }, [dispatch, limit, query, searchField]);

  const searchFieldLabels: Record<UserSearchField, string> = useMemo(
    () => ({
      user_full_name: t("full_name"),
      username: t("username"),
      user_phone_number: t("phone_number"),
      user_email: t("email"),
    }),
    [t]
  );

  const fetchData = useCallback(
    async (force = false) => {
      if (query.trim()) {
        try {
          setSearchLoading(true);
          const res = await userApi.list({
            page,
            limit,
            [searchField]: query.trim(),
          });
          setSearchUsers(res.data);
          setSearchTotal(res.total);
        } catch (error) {
          const message =
            (error as any)?.response?.data?.message ||
            (error as Error)?.message ||
            tCommon("messages.commonError");
          toast.error(t("loadFailed"), { description: message });
        } finally {
          setSearchLoading(false);
        }
        return;
      }

      if (!pages[page] || force) {
        dispatch(fetchUsers({ page, limit, force }));
      }
    },
    [dispatch, limit, page, pages, query, searchField, t, tCommon]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;

    if (query.trim()) {
      fetchData(true);
    } else {
      dispatch(clearUsers());
      dispatch(fetchUsers({ page: 1, limit, force: true }));
    }

    setRefreshDisabled(15);
    const interval = window.setInterval(() => {
      setRefreshDisabled((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleDeleteUser = async (user: User) => {
    try {
      await userApi.delete(user.user_id);
      dispatch(deleteUser(user.user_id));
      toast.success(
        <>
          {t("deleteSuccessPrefix")} <b>{user.user_full_name}</b> {t("deleteSuccessSuffix")}
        </>
      );
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        t("deleteFailed");
      toast.error(t("failed"), { description: message });
    }
  };

  const getRoleDisplay = (role: string) => {
    const roleLabels: Record<string, string> = {
      admin: tRoles("admin"),
      manager: tRoles("manager"),
      dispatcher: tRoles("dispatcher"),
      driver: tRoles("driver"),
      user: tRoles("user"),
    };
    return roleLabels[role] || role || "-";
  };

  const currentData = query.trim() ? searchUsers : pages[page] || [];
  const currentTotal = query.trim() ? searchTotal : total;
  const currentLoading = query.trim() ? searchLoading : loading;
  const totalPages = Math.ceil(currentTotal / limit);

  const columns: ColumnType<User>[] = [
    {
      title: "#",
      key: "index",
      width: 56,
      align: "center",
      render: (_value, _record, index) => (page - 1) * limit + index + 1,
    },
    {
      title: t("full_name"),
      dataIndex: "user_full_name",
      key: "user_full_name",
      render: (value: string) => <span className="font-semibold text-slate-800">{value}</span>,
    },
    {
      title: t("username"),
      dataIndex: "username",
      key: "username",
      render: (value: string) => value || "-",
    },
    {
      title: t("email"),
      dataIndex: "user_email",
      key: "user_email",
      render: (value: string | null) => value || "-",
    },
    {
      title: t("phone_number"),
      dataIndex: "user_phone_number",
      key: "user_phone_number",
      align: "center",
      render: (value: string | null) => value || "-",
    },
    {
      title: t("address"),
      dataIndex: "user_address",
      key: "user_address",
      render: (value: string | null) => value || <span className="text-slate-400">-</span>,
    },
    {
      title: t("role"),
      dataIndex: "role",
      key: "role",
      align: "center",
      render: (value: string) => (
        <span className="inline-flex items-center rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {getRoleDisplay(value)}
        </span>
      ),
    },
    {
      title: t("join_date"),
      dataIndex: "user_join_date",
      key: "user_join_date",
      align: "center",
      render: (value: string | null) => (
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <CalendarDays className="size-3.5" />
          {normalizeDate(value)}
        </span>
      ),
    },
    {
      title: t("work_shift"),
      dataIndex: "user_work_shift",
      key: "user_work_shift",
      render: (value: string | null) => value || <span className="text-slate-400">-</span>,
    },
    {
      title: t("actions"),
      key: "actions",
      align: "center",
      fixed: "right",
      render: (_value, record) => (
        <Space size="middle">
          {record.role !== "admin" && hasActionAccess(SIDEBAR.USER_MANAGE, PERMISSIONS.USER_MANAGE.UPDATE) && (
            <Tooltip title={tCommon("edit")}>
              <Button variant="outline" size="iconSquare" onClick={() => setEditingUser(record)}>
                <PencilLine className="text-blue-600" />
              </Button>
            </Tooltip>
          )}
          {record.role !== "admin" && hasActionAccess(SIDEBAR.USER_MANAGE, PERMISSIONS.USER_MANAGE.DELETE) && (
            <Popconfirm
              title={tCommon("confirm")}
              description={
                <span>
                  {t("confirmDelete")} <b>{record.user_full_name}</b>?
                </span>
              }
              okText={tCommon("delete")}
              cancelText={tCommon("cancel")}
              placement="leftBottom"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDeleteUser(record)}
            >
              <Tooltip title={tCommon("delete")}>
                <Button variant="outline" size="iconSquare">
                  <Trash className="text-red-600" />
                </Button>
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="m-10 bg-white rounded-lg shadow-sm border border-slate-200 animate-fade-in overflow-hidden">
        <div className="p-6 md:p-8 border-b-2 border-slate-100 flex flex-col items-start gap-6 bg-slate-50/50">
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              {t("list")}
            </h1>
            <p className="text-slate-500 mt-2 text-lg">{t("manage_all")}</p>
          </div>

          <div className="flex gap-3 mt-2 sm:mt-0 flex-wrap">
            {hasActionAccess(SIDEBAR.USER_MANAGE, PERMISSIONS.USER_MANAGE.CREATE) && (
              <Tooltip title={t("add_new")}>
                <Button variant="primary" onClick={() => setOpenCreate(true)}>
                  <UserPlus className="w-4 h-4" />
                  {t("add")}
                </Button>
              </Tooltip>
            )}

            <Tooltip title={tCommon("refreshData")}>
              <Button variant="outline" disabled={refreshDisabled > 0}
                className="hover:bg-slate-100 transition-smooth"
                onClick={handleRefresh}
              >
                <div className="flex items-center gap-2">
                  <Loader className={`${refreshDisabled > 0 ? "animate-spin" : ""}`} />
                  <span>
                    {refreshDisabled > 0 ? `${tCommon("refresh")} (${refreshDisabled}s)` : tCommon("refresh")}
                  </span>
                </div>
              </Button>
            </Tooltip>
          </div>
        </div>

        <div className="px-6 md:px-8 py-6">
          <div className="flex flex-row gap-6 items-center flex-wrap">
            <UserSearch />
            {query.trim() && (
              <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm text-blue-700">
                <span className="font-semibold">{tCommon("search")}:</span>
                <span className="truncate">&quot;{query}&quot;</span>
                <span className="text-blue-500">{t("inField")}</span>
                <span className="font-semibold">{searchFieldLabels[searchField]}</span>
              </div>
            )}
          </div>
        </div>

        <div
          className="animate-slide-up border-t border-slate-200 overflow-hidden"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={currentData}
            rowKey="user_id"
            loading={currentLoading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="border-t border-slate-200 bg-slate-50 p-4 pb-6 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              {currentData.length > 0 ? (
                <>
                  <i>{t("total")}</i>: <b>{currentTotal}</b>
                </>
              ) : null}
            </div>

            {totalPages > 1 && (
              <ShadcnPagination className="justify-end m-0">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page > 1) dispatch(setPagination({ page: page - 1, limit }));
                      }}
                      className={page === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>

                  {Array.from({ length: totalPages }).map((_, index) => {
                    const pageNumber = index + 1;
                    if (
                      pageNumber === 1 ||
                      pageNumber === totalPages ||
                      Math.abs(pageNumber - page) <= 1
                    ) {
                      return (
                        <PaginationItem key={pageNumber}>
                          <PaginationLink
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              dispatch(setPagination({ page: pageNumber, limit }));
                            }}
                            isActive={page === pageNumber}
                          >
                            {pageNumber}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }

                    if (Math.abs(pageNumber - page) === 2) {
                      return <span key={`ellipsis-${pageNumber}`} className="px-2">...</span>;
                    }

                    return null;
                  })}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page < totalPages) dispatch(setPagination({ page: page + 1, limit }));
                      }}
                      className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </ShadcnPagination>
            )}
          </div>
        </div>

        {!currentLoading && currentData.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">{t("emptyTitle")}</p>
            <p className="text-sm mt-2">{t("emptyHint")}</p>
          </div>
        )}
      </div>

      <UserCreateModal open={openCreate} onClose={() => setOpenCreate(false)} />
      <UserEditModal open={!!editingUser} user={editingUser} onClose={() => setEditingUser(null)} />
    </>
  );
}
