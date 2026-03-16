"use client";

import { Button } from "@/components/ui/button";
import vehicleTypeApi from "@/services/vehicle-type.service";
import type { VehicleType } from "@/services/vehicle-type.service";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { Form, Input, Modal, Pagination, Space, Table, Tooltip, Popconfirm } from "antd";
import { Plus, RefreshCw, Layers, PenSquare, Trash2, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function TableVehicleTypes() {
  const t = useTranslations("VehicleTypePage");
  const tCommon = useTranslations("Common");
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm();
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingType, setEditingType] = useState<VehicleType | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchVehicleTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vehicleTypeApi.getAll();
      setVehicleTypes(res.data?.data || res.data || []);
    } catch {
      toast.error(t("loadFailed"), { position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchVehicleTypes();
  }, [fetchVehicleTypes]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    fetchVehicleTypes();
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
    setEditingType(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const openEditModal = (record: VehicleType) => {
    setEditingType(record);
    form.setFieldsValue({
      vehicle_type_name: record.vehicle_type_name,
      vehicle_type_description: record.vehicle_type_description,
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
      if (editingType) {
        await vehicleTypeApi.update(editingType.vehicle_type_id, values);
      } else {
        await vehicleTypeApi.create(values);
      }
      setIsModalVisible(false);
      form.resetFields();
      toast.success(editingType ? t("updateSuccess") : t("createSuccess"), {
        position: "top-right",
      });
      fetchVehicleTypes();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("saveFailed");
      toast.error(t("failed"), { description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: VehicleType) => {
    try {
      await vehicleTypeApi.delete(record.vehicle_type_id);
      toast.success(
        <>
          {t("typeName")} <b>{record.vehicle_type_name}</b> {t("deleteSuccess")}
        </>
      );
      fetchVehicleTypes();
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
      title: t("typeName"),
      dataIndex: "vehicle_type_name",
      key: "vehicle_type_name",
      render: (text: string) => <span className="font-semibold text-slate-800">{text}</span>,
    },
    {
      title: t("typeDescription"),
      dataIndex: "vehicle_type_description",
      key: "vehicle_type_description",
      render: (val: string | null) => val || <span className="text-slate-400 italic">-</span>,
    },
    {
      title: t("actions"),
      key: "actions",
      align: "center" as const,
      width: 150,
      fixed: "right" as const,
      render: (_: unknown, record: VehicleType) => (
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
                {t("confirmDelete")} <b>{record.vehicle_type_name}</b>?
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
                {t("addType")}
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
            dataSource={vehicleTypes}
            rowKey="vehicle_type_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <Pagination
              total={vehicleTypes.length}
              align="end"
              showTotal={(total) => (
                <>
                  <i>{t("total")}</i>: <b>{total}</b>
                </>
              )}
            />
          </div>
        </div>

        {!loading && vehicleTypes.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg">{t("emptyTitle")}</p>
            <p className="text-sm mt-2">{t("emptyHint")}</p>
          </div>
        )}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full ${editingType ? "bg-amber-100" : "bg-blue-100"}`}
            >
              <Tag className={`w-5 h-5 ${editingType ? "text-amber-600" : "text-blue-600"}`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingType ? t("editType") : t("newType")}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editingType ? t("editSubtitle") : t("newSubtitle")}
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
              className={`min-w-[140px] text-white ${editingType ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
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
            name="vehicle-type-form"
            layout="vertical"
            autoComplete="off"
            onValuesChange={onValuesChange}
            className="space-y-4"
          >
            <Form.Item
              label={<span className="font-medium text-slate-700">{t("typeName")}</span>}
              name="vehicle_type_name"
              rules={[{ required: true, message: t("requiredName") }]}
            >
              <Input placeholder={t("namePlaceholder")} size="large" className="rounded-lg" />
            </Form.Item>

            <Form.Item
              label={<span className="font-medium text-slate-700">{t("typeDescription")}</span>}
              name="vehicle_type_description"
            >
              <Input.TextArea
                placeholder={t("descriptionPlaceholder")}
                rows={3}
                className="rounded-lg"
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </>
  );
}
