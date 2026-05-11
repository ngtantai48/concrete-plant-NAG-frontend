"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input as ShadcnInput } from "@/components/ui/input";
import {
  PaginationContent,
  PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
  Pagination as ShadcnPagination,
} from "@/components/ui/pagination";
import { SelectContent, SelectItem, SelectTrigger, SelectValue, Select as ShadcnSelect, } from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-selector";
import { clearDrivers, fetchDrivers, setPagination } from "@/store/slices/driverSlice";
import driverApi from "@/services/driver.service";
import type { Driver } from "@/types/driver";
import { Modal, Popconfirm, Space, Table, Tag, Tooltip, Form, Input, Select } from "antd";
import { PencilLine, Plus, Save, Trash, Truck, X, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const TableDrivers: React.FC = () => {
  const t = useTranslations("DriverPage");
  const tCommon = useTranslations("Common");
  const dispatch = useAppDispatch();
  const { pages, page, limit, total, loading } = useAppSelector((state) => state.drivers);
  const drivers = pages[page] || [];

  const [searchCategory, setSearchCategory] = useState<"user_full_name" | "username" | "user_phone_number" | "user_email">("user_full_name");
  const [searchInput, setSearchInput] = useState("");
  const [currentNameFilter, setCurrentNameFilter] = useState<string | undefined>(undefined);
  const [currentUsernameFilter, setCurrentUsernameFilter] = useState<string | undefined>(undefined);
  const [currentPhoneFilter, setCurrentPhoneFilter] = useState<string | undefined>(undefined);
  const [currentEmailFilter, setCurrentEmailFilter] = useState<string | undefined>(undefined);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [form] = Form.useForm();

  const handleSearchCommit = useCallback(() => {
    dispatch(clearDrivers());

    let nextNameFilter;
    let nextUsernameFilter;
    let nextPhoneFilter;
    let nextEmailFilter;

    if (searchInput.trim()) {
      if (searchCategory === "user_full_name") nextNameFilter = searchInput.trim();
      else if (searchCategory === "username") nextUsernameFilter = searchInput.trim();
      else if (searchCategory === "user_phone_number") nextPhoneFilter = searchInput.trim();
      else if (searchCategory === "user_email") nextEmailFilter = searchInput.trim();
    }

    setCurrentNameFilter(nextNameFilter);
    setCurrentUsernameFilter(nextUsernameFilter);
    setCurrentPhoneFilter(nextPhoneFilter);
    setCurrentEmailFilter(nextEmailFilter);
  }, [searchCategory, searchInput, dispatch]);

  const loadDriversData = useCallback((force = false) => {
    dispatch(fetchDrivers({
      page,
      limit,
      user_full_name: currentNameFilter,
      username: currentUsernameFilter,
      user_phone_number: currentPhoneFilter,
      user_email: currentEmailFilter,
      force
    }));
  }, [dispatch, page, limit, currentNameFilter, currentUsernameFilter, currentPhoneFilter, currentEmailFilter]);

  useEffect(() => {
    loadDriversData();
  }, [loadDriversData]);

  const openAddModal = () => {
    setEditingDriver(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (driver: Driver) => {
    setEditingDriver(driver);
    form.setFieldsValue({
      ...driver,
      user_status: driver.user_status,
      user_join_date: driver.user_join_date ? driver.user_join_date.split("T")[0] : undefined,
      user_leave_date: driver.user_leave_date ? driver.user_leave_date.split("T")[0] : undefined,
    });
    setModalOpen(true);
  };

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    dispatch(clearDrivers());
    loadDriversData(true);
    setRefreshDisabled(15);
    const interval = setInterval(() => {
      setRefreshDisabled((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const { user_status, ...rest } = values;
      const optionalFields = [
        "user_email",
        "user_address",
        "user_join_date",
        "user_leave_date",
      ];
      const payload = { ...rest };
      optionalFields.forEach((key) => {
        if (!payload[key]) payload[key] = null;
      });
      if (!payload["user_work_shift"]) payload["user_work_shift"] = "";
      if (editingDriver) {
        await driverApi.update(editingDriver.user_id, payload);
      } else {
        await driverApi.create({ ...payload, role: "driver" });
      }
      setModalOpen(false);
      form.resetFields();
      toast.success(t("saveSuccess"), { position: "top-right" });
      dispatch(clearDrivers());
      loadDriversData(true);
    } catch {
      //
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (driver: Driver) => {
    try {
      await driverApi.delete(driver.user_id);
      toast.success(
        <>
          Tài xế <b>{driver.user_full_name}</b> đã bị xoá
        </>
      );
      dispatch(clearDrivers());
      loadDriversData(true);
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        "Không thể xoá tài xế";
      toast.error("Thất bại", { description: message });
    }
  };

  const getStatusDisplay = (status: string) => {
    if (status === "online")
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          Hoạt động
        </span>
      );
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        Nghỉ
      </span>
    );
  };

  const columns = [
    {
      title: "#",
      key: "index",
      width: 50,
      align: "center" as const,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: t("name"),
      dataIndex: "user_full_name",
      key: "user_full_name",
      sorter: (a: Driver, b: Driver) => a.user_full_name.localeCompare(b.user_full_name),
    },
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
    },
    {
      title: t("phone"),
      dataIndex: "user_phone_number",
      key: "user_phone_number",
      align: "center" as const,
    },
    {
      title: "Email",
      dataIndex: "user_email",
      key: "user_email",
      render: (val: string | null) => val || "-",
    },
    /* {
      title: t("status"),
      dataIndex: "user_status",
      key: "user_status",
      align: "center" as const,
      render: (status: string) => getStatusDisplay(status),
    }, */
    {
      title: t("actions"),
      key: "actions",
      align: "center" as const,
      fixed: "right" as const,
      render: (_: unknown, record: Driver) => (
        <Space size="middle">
          <Tooltip title="Chỉnh sửa">
            <Button variant="outline" size="iconSquare" onClick={() => openEditModal(record)}>
              <PencilLine color="#1677ff" />
            </Button>
          </Tooltip>
          <Popconfirm
            title="Xác nhận"
            description={
              <span>
                {t("confirmDelete")} <b>{record.user_full_name}</b>?
              </span>
            }
            okText="Xoá"
            cancelText="Huỷ"
            placement="leftBottom"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Tooltip title="Xoá">
              <Button variant="outline" size="iconSquare">
                <Trash color="red" />
              </Button>
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const getSearchPlaceholder = () => {
    switch (searchCategory) {
      case "user_full_name":
        return t("searchByName");
      case "username":
        return t("searchByUsername");
      case "user_phone_number":
        return t("searchByPhone");
      case "user_email":
        return t("searchByEmail");
      default:
        return t("searchFallback");
    }
  };

  return (
    <>
      <div className="m-10 bg-white rounded-lg shadow-sm border border-slate-200 animate-fade-in overflow-hidden">
        <div className="p-6 md:p-8 border-b-2 border-slate-100 flex flex-col items-start gap-6 bg-slate-50/50">
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              {t("title")}
            </h1>
            <p className="text-slate-500 mt-2 text-lg">Quản lý danh sách tài xế trong hệ thống</p>
          </div>

          <div className="flex gap-3 mt-2 sm:mt-0 flex-wrap">
            <Tooltip title="Thêm tài xế mới">
              <Button variant="primary" onClick={openAddModal}>
                <Plus className="w-4 h-4" />
                {t("addDriver")}
              </Button>
            </Tooltip>

            <Tooltip title={tCommon("refreshData")}>
              <Button
                className="hover:bg-slate-100 transition-smooth min-w-[120px]"
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshDisabled > 0}
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 ${refreshDisabled > 0 ? "animate-spin" : ""}`} />
                  <span>
                    {refreshDisabled > 0
                      ? `${tCommon("refresh")} (${refreshDisabled}s)`
                      : tCommon("refresh")}
                  </span>
                </div>
              </Button>
            </Tooltip>
          </div>
        </div>

        <div className="px-6 md:px-8 py-6">
          <ButtonGroup className="w-full max-w-3xl flex-col sm:flex-row">
            <ShadcnSelect
              value={searchCategory}
              onValueChange={(val: "user_full_name" | "username" | "user_phone_number" | "user_email") => setSearchCategory(val)}
            >
              <SelectTrigger className="sm:w-[180px] bg-white">
                <SelectValue placeholder="Chọn bộ lọc" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user_full_name">{t("name")}</SelectItem>
                {/* <SelectItem value="username">Username</SelectItem> */}
                <SelectItem value="user_phone_number">{t("phone")}</SelectItem>
                <SelectItem value="user_email">Email</SelectItem>
              </SelectContent>
            </ShadcnSelect>

            <ShadcnInput
              placeholder={getSearchPlaceholder()}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchCommit();
              }}
              className="flex-1"
            />

            <Button type="button" onClick={handleSearchCommit} className="sm:w-auto w-full">
              Tìm kiếm
            </Button>
          </ButtonGroup>
        </div>

        <div
          className="animate-slide-up border-t border-slate-200 overflow-hidden"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={drivers}
            rowKey="user_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="border-t border-slate-200 bg-slate-50 p-4 pb-6 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              {drivers.length > 0 ? (
                <>
                  <i>Tổng</i>:{" "}<b>{total}</b>
                </>
              ) : null}
            </div>

            {total > limit && (
              <ShadcnPagination className="justify-end m-0">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (page > 1) dispatch(setPagination({ page: page - 1, limit }));
                      }}
                      className={page === 1 ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>

                  {Array.from({ length: Math.ceil(total / limit) }).map((_, i) => {
                    const p = i + 1;
                    if (p === 1 || p === Math.ceil(total / limit) || Math.abs(p - page) <= 1) {
                      return (
                        <PaginationItem key={p}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              dispatch(setPagination({ page: p, limit }));
                            }}
                            isActive={page === p}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }
                    if (Math.abs(p - page) === 2) {
                      return <span key={`ellipsis-${p}`} className="px-2">...</span>;
                    }
                    return null;
                  })}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (page < Math.ceil(total / limit)) {
                          dispatch(setPagination({ page: page + 1, limit }));
                        }
                      }}
                      className={page >= Math.ceil(total / limit) ? "pointer-events-none opacity-50" : ""}
                    />
                  </PaginationItem>
                </PaginationContent>
              </ShadcnPagination>
            )}
          </div>
        </div>

        {!loading && drivers.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg">Chưa có tài xế nào trong hệ thống</p>
            <p className="text-sm mt-2">Nhấn &quot;Thêm tài xế&quot; để tạo tài xế mới</p>
          </div>
        )}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full ${editingDriver ? "bg-amber-100" : "bg-blue-100"}`}
            >
              <Truck className={`w-5 h-5 ${editingDriver ? "text-amber-600" : "text-blue-600"}`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingDriver ? t("editDriver") : t("addDriver")}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editingDriver ? "Cập nhật thông tin tài xế" : "Điền thông tin để thêm tài xế mới"}
              </p>
            </div>
          </div>
        }
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        width={700}
        styles={{
          body: {
            maxHeight: "75vh",
            overflowY: "auto",
            padding: "24px",
          },
        }}
        closeIcon={<X className="w-5 h-5 text-slate-400 hover:text-slate-600" />}
        footer={
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={() => {
                setModalOpen(false);
                form.resetFields();
              }}
              disabled={saving}
              className="min-w-[100px]"
            >
              <X className="w-4 h-4" />
              Huỷ
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`min-w-[140px] text-white ${editingDriver ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {editingDriver ? (
                <>
                  <Save className="w-4 h-4" />
                  Lưu thay đổi
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  {t("addDriver")}
                </>
              )}
            </Button>
          </div>
        }
        destroyOnClose
      >
        <div className="p-2">
          <Form
            form={form}
            name="driver-form"
            layout="vertical"
            autoComplete="off"
            className="space-y-1"
          >
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Thông tin cá nhân
              </h3>

              <Form.Item
                label={<span className="font-medium text-slate-700">{t("name")}</span>}
                name="user_full_name"
                rules={[
                  { required: true, message: t("required") },
                  { min: 1, max: 500 },
                ]}
              >
                <Input placeholder="Nhập họ và tên" size="large" className="rounded-lg" />
              </Form.Item>

              <div className="grid grid-cols-2 gap-4">
                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("phone")}</span>}
                  name="user_phone_number"
                  rules={[
                    { required: true, message: t("required") },
                    { min: 1, max: 20 },
                  ]}
                >
                  <Input placeholder="Nhập số điện thoại" size="large" className="rounded-lg" />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">Email</span>}
                  name="user_email"
                  rules={[{ type: "email", message: "Email không hợp lệ" }]}
                >
                  <Input placeholder="Nhập email" size="large" className="rounded-lg" />
                </Form.Item>
              </div>

              <Form.Item
                label={<span className="font-medium text-slate-700">Địa chỉ</span>}
                name="user_address"
              >
                <Input.TextArea placeholder="Nhập địa chỉ" rows={2} className="rounded-lg" />
              </Form.Item>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Thông tin tài khoản
              </h3>

              <Form.Item
                label={<span className="font-medium text-slate-700">Username</span>}
                name="username"
                rules={[
                  { required: true, message: t("required") },
                  { min: 3, max: 100 },
                  {
                    pattern: /^[a-zA-Z0-9._-]+$/,
                    message: "Username chỉ chứa chữ, số, dấu chấm, gạch dưới, gạch ngang",
                  },
                ]}
              >
                <Input
                  placeholder="Nhập username"
                  size="large"
                  className={`rounded-lg ${editingDriver ? "bg-slate-100" : ""}`}
                  disabled={!!editingDriver}
                />
              </Form.Item>

              {!editingDriver && (
                <Form.Item
                  label={<span className="font-medium text-slate-700">Mật khẩu</span>}
                  name="password"
                  rules={[
                    { required: true, message: t("required") },
                    { min: 6, max: 100 },
                  ]}
                >
                  <Input.Password placeholder="Nhập mật khẩu" size="large" className="rounded-lg" />
                </Form.Item>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                Thông tin công việc
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <Form.Item
                  label={<span className="font-medium text-slate-700">Ca làm việc</span>}
                  name="user_work_shift"
                >
                  <Input placeholder="Nhập ca làm việc" size="large" className="rounded-lg" />
                </Form.Item>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Form.Item
                  label={<span className="font-medium text-slate-700">Ngày vào làm</span>}
                  name="user_join_date"
                >
                  <Input type="date" size="large" className="rounded-lg" />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">Ngày nghỉ việc</span>}
                  name="user_leave_date"
                >
                  <Input type="date" size="large" className="rounded-lg" />
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      </Modal>
    </>
  );
};

export default TableDrivers;
