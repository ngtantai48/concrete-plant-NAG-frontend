"use client";

import { Button } from "@/components/ui/button";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import type { VehicleMaintenance } from "@/services/vehicle-maintenance.service";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/services/vehicle.service";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tooltip,
  Popconfirm,
} from "antd";
import {
  Plus,
  RefreshCw,
  Wrench,
  PenSquare,
  Trash2,
  ClipboardList,
  Calendar,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;
const { TextArea } = Input;

export default function TableVehicleMaintenances() {
  const t = useTranslations("VehicleMaintenancePage");
  const tCommon = useTranslations("Common");
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm();
  const [maintenances, setMaintenances] = useState<VehicleMaintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<VehicleMaintenance | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchMaintenances = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vehicleMaintenanceApi.getAll();
      setMaintenances(res.data || []);
    } catch {
      toast.error(t("loadFailed"), { position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await vehicleApi.getAll();
      setVehicles(res.data?.data || res.data || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchMaintenances();
    fetchVehicles();
  }, [fetchMaintenances, fetchVehicles]);

  const getMaintenanceStatus = (record: VehicleMaintenance) => {
    const now = dayjs();
    const toDate = dayjs(record.vehicle_maintenance_to_datetime);
    return toDate.isAfter(now) ? "active" : "completed";
  };

  const getVehiclePlate = (vehicleId: number) => {
    const found = vehicles.find((v) => v.vehicle_id === vehicleId);
    return found?.vehicle_license_plate || `#${vehicleId}`;
  };

  const filteredMaintenances = useMemo(() => {
    return maintenances.filter((m) => {
      const plate = getVehiclePlate(m.vehicle_id);
      const matchSearch =
        !searchText ||
        plate.toLowerCase().includes(searchText.toLowerCase()) ||
        m.vehicle_maintenance_description?.toLowerCase().includes(searchText.toLowerCase());
      const status = getMaintenanceStatus(m);
      const matchStatus = statusFilter === "all" || status === statusFilter;
      return matchSearch && matchStatus;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenances, statusFilter, searchText, vehicles]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    fetchMaintenances();
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

  const openAddModal = () => {
    setEditingRecord(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const openEditModal = (record: VehicleMaintenance) => {
    setEditingRecord(record);
    form.setFieldsValue({
      vehicle_id: record.vehicle_id,
      dateRange: [
        dayjs(record.vehicle_maintenance_from_datetime),
        dayjs(record.vehicle_maintenance_to_datetime),
      ],
      vehicle_distance_covered: record.vehicle_distance_covered,
      vehicle_maintenance_description: record.vehicle_maintenance_description,
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

      const payload = {
        vehicle_id: values.vehicle_id,
        vehicle_maintenance_from_datetime: values.dateRange[0].toISOString(),
        vehicle_maintenance_to_datetime: values.dateRange[1].toISOString(),
        vehicle_distance_covered: values.vehicle_distance_covered || 0,
        vehicle_maintenance_description: values.vehicle_maintenance_description,
      };

      if (editingRecord) {
        await vehicleMaintenanceApi.update(editingRecord.vehicle_maintenance_id, payload);
      } else {
        await vehicleMaintenanceApi.create(payload as Omit<VehicleMaintenance, "vehicle_maintenance_id">);
      }

      setIsModalVisible(false);
      form.resetFields();
      toast.success(editingRecord ? t("updateSuccess") : t("createSuccess"), {
        position: "top-right",
      });
      fetchMaintenances();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("saveFailed");
      toast.error(t("failed"), { description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: VehicleMaintenance) => {
    try {
      await vehicleMaintenanceApi.delete(record.vehicle_maintenance_id);
      toast.success(t("deleteSuccess"), { position: "top-right" });
      fetchMaintenances();
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

  const getStatusDisplay = (record: VehicleMaintenance) => {
    const status = getMaintenanceStatus(record);
    if (status === "active") {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
          {t("active")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
        {t("completed")}
      </span>
    );
  };

  const getDurationDays = (from: string, to: string) => {
    const diff = dayjs(to).diff(dayjs(from), "day");
    return diff;
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
      title: t("vehicle"),
      dataIndex: "vehicle_id",
      key: "vehicle_id",
      render: (vehicleId: number) => (
        <div className="font-semibold text-slate-800 bg-slate-100 uppercase tracking-wider px-3 py-1 rounded inline-block border-2 border-slate-300">
          {getVehiclePlate(vehicleId)}
        </div>
      ),
    },
    {
      title: t("dateRange"),
      key: "dateRange",
      render: (_: unknown, record: VehicleMaintenance) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-700">
              {dayjs(record.vehicle_maintenance_from_datetime).format("DD/MM/YYYY")}
            </span>
            <span className="text-slate-400 mx-1">→</span>
            <span className="text-slate-700">
              {dayjs(record.vehicle_maintenance_to_datetime).format("DD/MM/YYYY")}
            </span>
          </div>
          <div className="text-xs text-slate-400">
            {getDurationDays(
              record.vehicle_maintenance_from_datetime,
              record.vehicle_maintenance_to_datetime
            )}{" "}
            {t("days")}
          </div>
        </div>
      ),
    },
    {
      title: t("distanceCovered"),
      dataIndex: "vehicle_distance_covered",
      key: "vehicle_distance_covered",
      align: "right" as const,
      render: (val: number) => (
        <span className="font-medium text-slate-700 tabular-nums">
          {val?.toLocaleString("vi-VN")} {t("km")}
        </span>
      ),
    },
    {
      title: t("description"),
      dataIndex: "vehicle_maintenance_description",
      key: "vehicle_maintenance_description",
      width: 300,
      ellipsis: true,
      render: (val: string | null) =>
        val ? (
          <Tooltip title={val}>
            <span className="text-slate-600">{val}</span>
          </Tooltip>
        ) : (
          <span className="text-slate-400 italic">-</span>
        ),
    },
    {
      title: t("status"),
      key: "status",
      align: "center" as const,
      render: (_: unknown, record: VehicleMaintenance) => getStatusDisplay(record),
    },
    {
      title: t("actions"),
      key: "actions",
      align: "center" as const,
      fixed: "right" as const,
      render: (_: unknown, record: VehicleMaintenance) => (
        <Space size="middle">
          <Tooltip title={t("editTooltip")}>
            <Button variant="outline" size="iconSquare" onClick={() => openEditModal(record)}>
              <PenSquare className="w-4 h-4 text-blue-600" />
            </Button>
          </Tooltip>
          <Popconfirm
            title={t("confirmTitle")}
            description={t("confirmDelete")}
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
                {t("addMaintenance")}
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
            placeholder={t("searchPlaceholder")}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="max-w-xs"
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="min-w-[180px]"
            options={[
              { value: "all", label: t("all") },
              { value: "active", label: t("active") },
              { value: "completed", label: t("completed") },
            ]}
          />
        </div>

        <div
          className="animate-slide-up border-t border-slate-200 overflow-hidden"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={filteredMaintenances}
            rowKey="vehicle_maintenance_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <Pagination
              total={filteredMaintenances.length}
              align="end"
              showTotal={(total) => (
                <>
                  <i>{t("total")}</i>: <b>{total}</b>
                </>
              )}
            />
          </div>
        </div>

        {!loading && filteredMaintenances.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
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
              <Wrench
                className={`w-5 h-5 ${editingRecord ? "text-amber-600" : "text-blue-600"}`}
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingRecord ? t("editMaintenance") : t("newMaintenance")}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editingRecord ? t("editSubtitle") : t("newSubtitle")}
              </p>
            </div>
          </div>
        }
        open={isModalVisible}
        onCancel={handleCancel}
        width={650}
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
            name="vehicle-maintenance-form"
            layout="vertical"
            autoComplete="off"
            onValuesChange={onValuesChange}
            className="space-y-6"
          >
            {/* Section: Maintenance Info */}
            <div>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <ClipboardList className="w-5 h-5 text-slate-500" />
                <h3 className="text-base font-medium text-slate-800">{t("sectionInfo")}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("vehicle")}</span>}
                  name="vehicle_id"
                  rules={[{ required: true, message: t("requiredVehicle") }]}
                  className="mb-0"
                >
                  <Select size="large" className="rounded-lg" placeholder={t("vehiclePlaceholder")}>
                    {vehicles.map((v) => (
                      <Select.Option key={v.vehicle_id} value={v.vehicle_id}>
                        {v.vehicle_license_plate}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  label={
                    <span className="font-medium text-slate-700">{t("distanceCovered")}</span>
                  }
                  name="vehicle_distance_covered"
                  className="mb-0"
                >
                  <InputNumber
                    size="large"
                    className="w-full rounded-lg"
                    placeholder={t("distancePlaceholder")}
                    min={0}
                    formatter={(value) =>
                      `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                    }
                    addonAfter={t("km")}
                  />
                </Form.Item>

                <div className="md:col-span-2">
                  <Form.Item
                    label={
                      <span className="font-medium text-slate-700">{t("dateRange")}</span>
                    }
                    name="dateRange"
                    rules={[{ required: true, message: t("requiredDateRange") }]}
                    className="mb-0"
                  >
                    <RangePicker
                      size="large"
                      className="w-full rounded-lg"
                      format="DD/MM/YYYY"
                      placeholder={[t("dateRangePlaceholder.0") as string, t("dateRangePlaceholder.1") as string]}
                    />
                  </Form.Item>
                </div>
              </div>
            </div>

            {/* Section: Work Details */}
            <div>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <Wrench className="w-5 h-5 text-slate-500" />
                <h3 className="text-base font-medium text-slate-800">{t("sectionDetails")}</h3>
              </div>
              <Form.Item
                label={<span className="font-medium text-slate-700">{t("description")}</span>}
                name="vehicle_maintenance_description"
                rules={[{ required: true, message: t("requiredDescription") }]}
                className="mb-0"
              >
                <TextArea
                  rows={4}
                  placeholder={t("descriptionPlaceholder")}
                  className="rounded-lg"
                  showCount
                  maxLength={500}
                />
              </Form.Item>
            </div>
          </Form>
        </div>
      </Modal>
    </>
  );
}
