"use client";

import { Button } from "@/components/ui/button";
import userVehicleApi from "@/services/user-vehicle.service";
import type { UserVehicle } from "@/services/user-vehicle.service";
import driverApi from "@/services/driver.service";
import type { Driver } from "@/services/driver.service";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/services/vehicle.service";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { Form, Modal, Pagination, Select, Space, Table, Tooltip, Popconfirm } from "antd";
import { Plus, RefreshCw, Link2, Unlink, PenSquare, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function TableUserVehicles() {
  const t = useTranslations("UserVehiclePage");
  const tCommon = useTranslations("Common");
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm();
  const [assignments, setAssignments] = useState<UserVehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<UserVehicle | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userVehicleApi.getAll();
      setAssignments(res.data?.data || res.data || []);
    } catch {
      toast.error(t("loadFailed"), { position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await driverApi.getAll();
      const all = res.data?.data || res.data || [];
      setDrivers(all.filter((d: Driver) => d.role === "driver"));
    } catch {
      //
    }
  }, []);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await vehicleApi.getAll();
      setVehicles(res.data?.data || res.data || []);
    } catch {
      //
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
    fetchDrivers();
    fetchVehicles();
  }, [fetchAssignments, fetchDrivers, fetchVehicles]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    fetchAssignments();
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

  const getDriverName = (userId: number) => {
    const driver = drivers.find((d) => d.user_id === userId);
    return driver?.user_full_name || `#${userId}`;
  };

  const getVehiclePlate = (vehicleId: number) => {
    const vehicle = vehicles.find((v) => v.vehicle_id === vehicleId);
    return vehicle?.vehicle_license_plate || `#${vehicleId}`;
  };

  const formatDateTime = (val: string | null) => {
    if (!val) return <span className="text-slate-400 italic">-</span>;
    return dayjs(val).format("DD/MM/YYYY HH:mm");
  };

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const openEditModal = (record: UserVehicle) => {
    setEditingRecord(record);
    form.setFieldsValue({
      user_id: record.user_id,
      vehicle_id: record.vehicle_id,
    });
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
    setDirty(false);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingRecord) {
        await userVehicleApi.update(editingRecord.user_vehicle_id, values);
      } else {
        await userVehicleApi.create(values);
      }
      setIsModalVisible(false);
      form.resetFields();
      toast.success(editingRecord ? t("updateSuccess") : t("createSuccess"), {
        position: "top-right",
      });
      fetchAssignments();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("saveFailed");
      toast.error(t("failed"), { description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: UserVehicle) => {
    try {
      await userVehicleApi.delete(record.user_vehicle_id);
      toast.success(
        <>
          {t("assignmentOf")} <b>{getDriverName(record.user_id)}</b> {t("deleteSuccess")}
        </>
      );
      fetchAssignments();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("deleteFailed");
      toast.error(t("failed"), { description: message });
    }
  };

  const onValuesChange = () => {
    if (!useNavigationStore.getState().isDirty) {
      setDirty(true);
    }
  };

  const columns = [
    {
      title: "#",
      key: "index",
      width: 60,
      align: "center" as const,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: t("driver"),
      dataIndex: "user_id",
      key: "user_id",
      render: (val: number) => (
        <span className="font-medium text-slate-800">{getDriverName(val)}</span>
      ),
    },
    {
      title: t("vehicle"),
      dataIndex: "vehicle_id",
      key: "vehicle_id",
      render: (val: number) => (
        <div className="font-semibold text-slate-800 bg-slate-100 uppercase tracking-wider px-3 py-1 rounded inline-block border-2 border-slate-300">
          {getVehiclePlate(val)}
        </div>
      ),
    },
    {
      title: t("checkInTime"),
      dataIndex: "check_in_datetime",
      key: "check_in_datetime",
      align: "center" as const,
      render: (val: string | null) => formatDateTime(val),
    },
    {
      title: t("checkInGps"),
      dataIndex: "check_in_gps",
      key: "check_in_gps",
      align: "center" as const,
      render: (val: string | null) => val || <span className="text-slate-400 italic">-</span>,
    },
    {
      title: t("checkOutTime"),
      dataIndex: "check_out_datetime",
      key: "check_out_datetime",
      align: "center" as const,
      render: (val: string | null) => formatDateTime(val),
    },
    {
      title: t("checkOutGps"),
      dataIndex: "check_out_gps",
      key: "check_out_gps",
      align: "center" as const,
      render: (val: string | null) => val || <span className="text-slate-400 italic">-</span>,
    },
    {
      title: t("actions"),
      key: "actions",
      align: "center" as const,
      width: 150,
      fixed: "right" as const,
      render: (_: unknown, record: UserVehicle) => (
        <Space size="middle">
          <Tooltip title={t("editTooltip")}>
            <Button variant="outline" size="iconSquare" onClick={() => openEditModal(record)}>
              <PenSquare className="w-4 h-4 text-blue-600" />
            </Button>
          </Tooltip>
          <Popconfirm
            title={t("confirmTitle")}
            description={
              <span>
                {t("confirmDelete")} <b>{getDriverName(record.user_id)}</b> -{" "}
                <b>{getVehiclePlate(record.vehicle_id)}</b>?
              </span>
            }
            okText={t("okText")}
            cancelText={t("cancelText")}
            placement="leftBottom"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Tooltip title={t("deleteTooltip")}>
              <Button variant="outline" size="iconSquare">
                <Trash2 className="w-4 h-4 text-red-500" />
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
            <p className="text-slate-500 mt-2 text-lg">{t("subtitle")}</p>
          </div>

          <div className="flex gap-3 mt-2 sm:mt-0 flex-wrap">
            <Tooltip title={t("addTooltip")}>
              <Button variant="primary" onClick={openAddModal}>
                <Plus className="w-4 h-4" />
                {t("addAssignment")}
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

        <div
          className="animate-slide-up border-t border-slate-200 overflow-hidden"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={assignments}
            rowKey="user_vehicle_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <Pagination
              total={assignments.length}
              align="end"
              showTotal={(total) => (
                <>
                  <i>{t("total")}</i>: <b>{total}</b>
                </>
              )}
            />
          </div>
        </div>

        {!loading && assignments.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Unlink className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg">{t("emptyTitle")}</p>
            <p className="text-sm mt-2">{t("emptyHint")}</p>
          </div>
        )}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full ${editingRecord ? "bg-amber-100" : "bg-blue-100"}`}
            >
              <Link2 className={`w-5 h-5 ${editingRecord ? "text-amber-600" : "text-blue-600"}`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingRecord ? t("editAssignment") : t("newAssignment")}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editingRecord ? t("editSubtitle") : t("newSubtitle")}
              </p>
            </div>
          </div>
        }
        open={isModalVisible}
        onCancel={handleCancel}
        width={500}
        styles={{
          body: {
            maxHeight: "75vh",
            overflowY: "auto",
            padding: "24px",
          },
        }}
        footer={
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
              className="min-w-[100px]"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`min-w-[140px] text-white ${editingRecord ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {t("save")}
            </Button>
          </div>
        }
        destroyOnClose
      >
        <div className="p-2">
          <Form
            form={form}
            name="user-vehicle-form"
            layout="vertical"
            autoComplete="off"
            onValuesChange={onValuesChange}
            className="space-y-4"
          >
            <Form.Item
              label={<span className="font-medium text-slate-700">{t("driver")}</span>}
              name="user_id"
              rules={[{ required: true, message: t("requiredDriver") }]}
            >
              <Select
                size="large"
                className="rounded-lg"
                placeholder={t("driverPlaceholder")}
                showSearch
                optionFilterProp="label"
                options={drivers.map((d) => ({
                  value: d.user_id,
                  label: `${d.user_full_name} (${d.user_phone_number || d.username})`,
                }))}
              />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("vehicle")}</span>}
              name="vehicle_id"
              rules={[{ required: true, message: t("requiredVehicle") }]}
            >
              <Select
                size="large"
                className="rounded-lg"
                placeholder={t("vehiclePlaceholder")}
                showSearch
                optionFilterProp="label"
                options={vehicles.map((v) => ({
                  value: v.vehicle_id,
                  label: v.vehicle_license_plate,
                }))}
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </>
  );
}
