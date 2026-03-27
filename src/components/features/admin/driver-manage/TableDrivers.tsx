"use client";

import { Button } from "@/components/ui/button";
import driverApi from "@/services/driver.service";
import type { Driver } from "@/types/driver";
import { Modal, Pagination, Popconfirm, Space, Table, Tag, Tooltip, Form, Input, Select } from "antd";
import { PencilLine, Plus, Save, Trash, Truck, X, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";

const TableDrivers: React.FC = () => {
  const t = useTranslations("DriverPage");
  const tCommon = useTranslations("Common");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [form] = Form.useForm();

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await driverApi.getAll();
      setDrivers(res.data?.data || res.data || []);
    } catch {
      toast.error("Tải dữ liệu thất bại", { position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const filteredDrivers = useMemo(() => {
    return drivers
      .filter((d) => d.role === "driver")
      .filter((d) => {
        const matchStatus = statusFilter === "all" || d.user_status === statusFilter;
        const matchSearch =
          !searchText ||
          d.user_full_name.toLowerCase().includes(searchText.toLowerCase()) ||
          d.user_phone_number?.includes(searchText) ||
          d.username?.toLowerCase().includes(searchText.toLowerCase());
        return matchStatus && matchSearch;
      });
  }, [drivers, statusFilter, searchText]);

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
    fetchDrivers();
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
      fetchDrivers();
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
      fetchDrivers();
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
    {
      title: t("status"),
      dataIndex: "user_status",
      key: "user_status",
      align: "center" as const,
      render: (status: string) => getStatusDisplay(status),
    },
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

  return (
    <>
      <div className="m-4 md:m-8 max-w-7xl lg:mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 animate-fade-in overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-100 flex items-start justify-between gap-6 flex-wrap bg-slate-50/50">
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

        <div className="px-6 md:px-8 py-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <Input
            placeholder={`${t("name")}, ${t("phone")}, Username...`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="max-w-xs"
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="min-w-[160px]"
            options={[
              { value: "all", label: t("all") },
              { value: "online", label: t("active") },
              { value: "offline", label: t("inactive") },
            ]}
          />
        </div>

        <div
          className="animate-slide-up border-t border-slate-200 overflow-hidden"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={filteredDrivers}
            rowKey="user_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <Pagination
              total={filteredDrivers.length}
              align="end"
              showTotal={(total) => (
                <>
                  <i>Tổng</i>: <b>{total}</b>
                </>
              )}
            />
          </div>
        </div>

        {!loading && filteredDrivers.length === 0 && (
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
