"use client";

import { Button } from "@/components/ui/button";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/services/vehicle.service";
import vehicleTypeApi from "@/services/vehicle-type.service";
import type { VehicleType } from "@/services/vehicle-type.service";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { Form, Input, Modal, Pagination, Select, Space, Table, Tooltip, Popconfirm } from "antd";
import { Plus, RefreshCw, CarFront, PenSquare, Trash2, Hash } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function TableVehicles() {
  const t = useTranslations("VehiclePage");
  const tCommon = useTranslations("Common");
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vehicleApi.getAll();
      setVehicles(res.data?.data || res.data || []);
    } catch {
      toast.error(t("loadFailed"), { position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchVehicleTypes = useCallback(async () => {
    try {
      const res = await vehicleTypeApi.getAll();
      setVehicleTypes(res.data?.data || res.data || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
    fetchVehicleTypes();
  }, [fetchVehicles, fetchVehicleTypes]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchSearch =
        !searchText ||
        v.vehicle_license_plate?.toLowerCase().includes(searchText.toLowerCase()) ||
        v.vehicle_description?.toLowerCase().includes(searchText.toLowerCase());
      const matchStatus = statusFilter === "all" || v.vehicle_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [vehicles, statusFilter, searchText]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    fetchVehicles();
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
    setEditingVehicle(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const openEditModal = (record: Vehicle) => {
    setEditingVehicle(record);
    form.setFieldsValue({
      vehicle_license_plate: record.vehicle_license_plate,
      vehicle_status: record.vehicle_status,
      vehicle_description: record.vehicle_description,
      vehicle_type_id: record.vehicle_type_id,
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
      if (editingVehicle) {
        await vehicleApi.update(editingVehicle.vehicle_id, values);
      } else {
        await vehicleApi.create(values);
      }
      setIsModalVisible(false);
      form.resetFields();
      toast.success(editingVehicle ? t("updateSuccess") : t("createSuccess"), {
        position: "top-right",
      });
      fetchVehicles();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("saveFailed");
      toast.error(t("failed"), { description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: Vehicle) => {
    try {
      await vehicleApi.delete(record.vehicle_id);
      toast.success(
        <>
          {t("licensePlate")} <b>{record.vehicle_license_plate}</b> {t("deleteSuccess")}
        </>
      );
      fetchVehicles();
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

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "available":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            {t("active")}
          </span>
        );
      case "maintenance":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
            {t("maintenance")}
          </span>
        );
      case "unavailable":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            {t("inactive")}
          </span>
        );
      default:
        return <span className="text-slate-500">{status}</span>;
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
      title: t("licensePlate"),
      dataIndex: "vehicle_license_plate",
      key: "vehicle_license_plate",
      render: (text: string) => (
        <div className="font-semibold text-slate-800 bg-slate-100 uppercase tracking-wider px-3 py-1 rounded inline-block border-2 border-slate-300">
          {text}
        </div>
      ),
    },
    {
      title: t("vehicleType"),
      dataIndex: "vehicle_type_id",
      key: "vehicle_type_id",
      align: "center" as const,
      render: (val: number) => {
        const found = vehicleTypes.find((vt) => vt.vehicle_type_id === val);
        return found?.vehicle_type_name || `#${val}`;
      },
    },
    {
      title: t("description"),
      dataIndex: "vehicle_description",
      key: "vehicle_description",
      render: (val: string | null) => val || <span className="text-slate-400 italic">-</span>,
    },
    {
      title: t("status"),
      dataIndex: "vehicle_status",
      key: "vehicle_status",
      align: "center" as const,
      render: (status: string) => getStatusDisplay(status),
    },
    {
      title: t("actions"),
      key: "actions",
      align: "center" as const,
      fixed: "right" as const,
      render: (_: unknown, record: Vehicle) => (
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
                {t("confirmDelete")} <b>{record.vehicle_license_plate}</b>?
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
                {t("addVehicle")}
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
            className="min-w-[160px]"
            options={[
              { value: "all", label: t("all") },
              { value: "available", label: t("active") },
              { value: "maintenance", label: t("maintenance") },
              { value: "unavailable", label: t("inactiveOption") },
            ]}
          />
        </div>

        <div
          className="animate-slide-up border-t border-slate-200 overflow-hidden"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={filteredVehicles}
            rowKey="vehicle_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <Pagination
              total={filteredVehicles.length}
              align="end"
              showTotal={(total) => (
                <>
                  <i>{t("total")}</i>: <b>{total}</b>
                </>
              )}
            />
          </div>
        </div>

        {!loading && filteredVehicles.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <CarFront className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg">{t("emptyTitle")}</p>
            <p className="text-sm mt-2">{t("emptyHint")}</p>
          </div>
        )}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full ${editingVehicle ? "bg-amber-100" : "bg-blue-100"}`}
            >
              <CarFront
                className={`w-5 h-5 ${editingVehicle ? "text-amber-600" : "text-blue-600"}`}
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingVehicle ? t("editVehicle") : t("newVehicle")}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editingVehicle ? t("editSubtitle") : t("newSubtitle")}
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
              className={`min-w-[140px] text-white ${editingVehicle ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
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
            name="vehicle-form"
            layout="vertical"
            autoComplete="off"
            onValuesChange={onValuesChange}
            className="space-y-6"
          >
            <div>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <Hash className="w-5 h-5 text-slate-500" />
                <h3 className="text-base font-medium text-slate-800">{t("sectionTitle")}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <Form.Item
                  label={
                    <span className="font-medium text-slate-700">{t("licensePlateLabel")}</span>
                  }
                  name="vehicle_license_plate"
                  rules={[{ required: true, message: t("requiredLicense") }]}
                  className="mb-0"
                >
                  <Input
                    placeholder={t("licensePlaceholder")}
                    size="large"
                    className="rounded-lg uppercase font-semibold tracking-wider text-lg"
                  />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("vehicleType")}</span>}
                  name="vehicle_type_id"
                  rules={[{ required: true, message: t("requiredType") }]}
                  className="mb-0"
                >
                  <Select size="large" className="rounded-lg" placeholder={t("typePlaceholder")}>
                    {vehicleTypes.map((vt) => (
                      <Select.Option key={vt.vehicle_type_id} value={vt.vehicle_type_id}>
                        {vt.vehicle_type_name}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("description")}</span>}
                  name="vehicle_description"
                  className="mb-0"
                >
                  <Input
                    placeholder={t("descriptionPlaceholder")}
                    size="large"
                    className="rounded-lg"
                  />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("status")}</span>}
                  name="vehicle_status"
                  initialValue="available"
                  className="mb-0"
                >
                  <Select size="large" className="rounded-lg">
                    <Select.Option value="available">{t("activeOption")}</Select.Option>
                    <Select.Option value="maintenance">{t("maintenanceOption")}</Select.Option>
                    <Select.Option value="unavailable">{t("inactiveOption")}</Select.Option>
                  </Select>
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      </Modal>
    </>
  );
}
