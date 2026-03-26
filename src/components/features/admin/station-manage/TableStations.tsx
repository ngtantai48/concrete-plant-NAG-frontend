"use client";

import { Button } from "@/components/ui/button";
import stationApi from "@/services/station.service";
import type { Station } from "@/services/station.service";
import stationTypeApi from "@/services/station-type.service";
import type { StationType } from "@/services/station-type.service";
import {
  Modal,
  Pagination,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Form,
  Input,
  InputNumber,
  Select,
} from "antd";
import {
  Building2,
  MapPin,
  PencilLine,
  Plus,
  Radar,
  Save,
  Trash,
  X,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";

const TableStations: React.FC = () => {
  const t = useTranslations("StationPage");
  const tCommon = useTranslations("Common");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationTypes, setStationTypes] = useState<StationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [form] = Form.useForm();

  const fetchStations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stationApi.getAll();
      setStations(res.data?.data || res.data || []);
    } catch {
      toast.error("Tải dữ liệu thất bại", { position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStationTypes = useCallback(async () => {
    try {
      const res = await stationTypeApi.getAll();
      setStationTypes(res.data?.data || res.data || []);
    } catch {
      //
    }
  }, []);

  useEffect(() => {
    fetchStations();
    fetchStationTypes();
  }, [fetchStations, fetchStationTypes]);

  const filteredStations = useMemo(() => {
    return stations.filter((s) => {
      const matchStatus = statusFilter === "all" || s.station_status === statusFilter;
      const matchSearch =
        !searchText ||
        s.station_name?.toLowerCase().includes(searchText.toLowerCase()) ||
        s.station_address?.toLowerCase().includes(searchText.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [stations, statusFilter, searchText]);

  const openAddModal = () => {
    setEditingStation(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (station: Station) => {
    setEditingStation(station);
    const [lng, lat] = station.station_gps
      ? station.station_gps.split(",").map((v) => v.trim())
      : ["", ""];
    form.setFieldsValue({
      station_name: station.station_name,
      station_address: station.station_address,
      longitude: lng ? Number(lng) : undefined,
      latitude: lat ? Number(lat) : undefined,
      station_gps_geofencing: station.station_gps_geofencing,
      station_status: station.station_status,
      station_description: station.station_description,
      station_type_id: station.station_type_id || station.station_types?.station_type_id,
    });
    setModalOpen(true);
  };

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    fetchStations();
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
      const { longitude, latitude, ...rest } = values;
      const payload = {
        ...rest,
        station_gps: longitude && latitude ? `${longitude},${latitude}` : null,
        station_description: rest.station_description || null,
      };
      if (editingStation) {
        await stationApi.update(editingStation.station_id, payload);
      } else {
        await stationApi.create(payload);
      }
      setModalOpen(false);
      form.resetFields();
      toast.success(t("saveSuccess"), { position: "top-right" });
      fetchStations();
    } catch {
      //
    } finally {
      setSaving(false);
    }
  };


  const getTypeName = (typeId: number | null) => {
    if (!typeId) return "-";
    const found = stationTypes.find((st) => st.station_type_id === typeId);
    return found ? found.station_type_description || found.station_type_name : "-";
  };

  const handleDelete = async (station: Station) => {
    try {
      await stationApi.delete(station.station_id);
      toast.success(
        <>
          Trạm <b>{station.station_name}</b> đã bị xoá
        </>
      );
      fetchStations();
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        "Không thể xoá trạm";
      toast.error("Thất bại", { description: message });
    }
  };

  const getStatusDisplay = (status: string) => {
    if (status === "operating")
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          {t("active")}
        </span>
      );
    if (status === "stopped")
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
          Dừng HĐ
        </span>
      );
    if (status === "incident")
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200/60">
          Sự cố
        </span>
      );
    if (status === "collecting")
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200/60">
          Đang nhận
        </span>
      );
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        {status}
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
      title: t("stationName"),
      dataIndex: "station_name",
      key: "station_name",
      sorter: (a: Station, b: Station) => a.station_name.localeCompare(b.station_name),
    },
    {
      title: t("stationType"),
      dataIndex: "station_type_id",
      key: "station_type_id",
      render: (val: number | null) => getTypeName(val),
    },
    {
      title: t("address"),
      dataIndex: "station_address",
      key: "station_address",
      render: (val: string | null) => val || "-",
    },
    {
      title: t("gps"),
      dataIndex: "station_gps",
      key: "station_gps",
      render: (val: string | null) => val || "-",
    },
    {
      title: t("geofencing"),
      dataIndex: "station_gps_geofencing",
      key: "station_gps_geofencing",
      align: "center" as const,
      render: (val: number | null) => (val ? `${val} m` : "-"),
    },
    {
      title: t("status"),
      dataIndex: "station_status",
      key: "station_status",
      align: "center" as const,
      render: (status: string) => getStatusDisplay(status),
    },
    {
      title: t("actions"),
      key: "actions",
      align: "center" as const,
      fixed: "right" as const,
      render: (_: unknown, record: Station) => (
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
                {t("confirmDelete")} <b>{record.station_name}</b>?
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
            <p className="text-slate-500 mt-2 text-lg">Quản lý danh sách trạm trong hệ thống</p>
          </div>

          <div className="flex gap-3 mt-2 sm:mt-0 flex-wrap">
            <Tooltip title="Thêm trạm mới">
              <Button variant="primary" onClick={openAddModal}>
                <Plus className="w-4 h-4" />
                {t("addStation")}
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
            placeholder="Tên trạm, địa chỉ..."
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
              { value: "operating", label: t("active") },
              { value: "stopped", label: "Dừng HĐ" },
              { value: "incident", label: "Sự cố" },
              { value: "collecting", label: "Đang nhận" },
            ]}
          />
        </div>

        <div
          className="animate-slide-up border-t border-slate-200 overflow-hidden"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={filteredStations}
            rowKey="station_id"
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"

          />

          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <Pagination
              total={filteredStations.length}
              align="end"
              showTotal={(total) => (
                <>
                  <i>Tổng</i>: <b>{total}</b>
                </>
              )}
            />
          </div>
        </div>

        {!loading && filteredStations.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg">Chưa có trạm nào trong hệ thống</p>
            <p className="text-sm mt-2">Nhấn &quot;Thêm trạm&quot; để tạo trạm mới</p>
          </div>
        )}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full ${editingStation ? "bg-amber-100" : "bg-blue-100"}`}
            >
              <MapPin
                className={`w-5 h-5 ${editingStation ? "text-amber-600" : "text-blue-600"}`}
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {editingStation ? t("editStation") : t("addStation")}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {editingStation ? "Cập nhật thông tin trạm" : "Điền thông tin để thêm trạm mới"}
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
              className={`min-w-[140px] text-white ${editingStation ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {editingStation ? (
                <>
                  <Save className="w-4 h-4" />
                  Lưu thay đổi
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  {t("addStation")}
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
            name="station-form"
            layout="vertical"
            autoComplete="off"
            className="space-y-6"
          >
            {/* Section 1: Thông tin cơ bản */}
            <div>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-medium text-slate-800">Thông tin cơ bản</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("stationName")}</span>}
                  name="station_name"
                  rules={[{ required: true, message: t("required") }]}
                  className="col-span-1 md:col-span-2 mb-0"
                >
                  <Input placeholder="Nhập tên trạm" size="large" className="rounded-lg" />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("address")}</span>}
                  name="station_address"
                  rules={[{ required: true, message: t("required") }]}
                  className="col-span-1 md:col-span-2 mb-0"
                >
                  <Input.TextArea placeholder="Nhập địa chỉ trạm" rows={2} className="rounded-lg" />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("description")}</span>}
                  name="station_description"
                  className="col-span-1 md:col-span-2 mb-0"
                >
                  <Input.TextArea
                    placeholder="Mô tả chi tiết về trạm"
                    rows={2}
                    className="rounded-lg"
                  />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("stationType")}</span>}
                  name="station_type_id"
                  rules={[{ required: true, message: t("required") }]}
                  className="mb-0"
                >
                  <Select
                    placeholder={t("selectStationType")}
                    size="large"
                    className="rounded-lg"
                    options={stationTypes.map((st) => ({
                      value: st.station_type_id,
                      label: st.station_type_description || st.station_type_name,
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("status")}</span>}
                  name="station_status"
                  initialValue="operating"
                  rules={[{ required: true, message: t("required") }]}
                  className="mb-0"
                >
                  <Select
                    size="large"
                    className="rounded-lg"
                    options={[
                      { value: "operating", label: t("active") },
                      { value: "stopped", label: "Dừng HĐ" },
                      { value: "incident", label: "Sự cố" },
                      { value: "collecting", label: "Đang nhận" },
                    ]}
                  />
                </Form.Item>
              </div>
            </div>

            {/* Section 2: Vị trí tọa độ */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <Radar className="w-5 h-5 text-green-600" />
                <h3 className="text-base font-medium text-slate-800">
                  Vị trí GPS &amp; Geofencing
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("longitude")}</span>}
                  name="longitude"
                  rules={[
                    {
                      validator: (_, value) => {
                        if (!value) return Promise.resolve();
                        const num = Number(value);
                        if (isNaN(num)) return Promise.reject("Kinh độ phải là số hợp lệ");
                        if (num < -180 || num > 180)
                          return Promise.reject("Kinh độ từ -180 đến 180");
                        return Promise.resolve();
                      },
                    },
                  ]}
                  className="mb-0"
                >
                  <Input placeholder="VD: 108.2022" size="large" className="rounded-lg" />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("latitude")}</span>}
                  name="latitude"
                  rules={[
                    {
                      validator: (_, value) => {
                        if (!value) return Promise.resolve();
                        const num = Number(value);
                        if (isNaN(num)) return Promise.reject("Vĩ độ phải là số hợp lệ");
                        if (num < -90 || num > 90) return Promise.reject("Vĩ độ từ -90 đến 90");
                        return Promise.resolve();
                      },
                    },
                  ]}
                  className="mb-0"
                >
                  <Input placeholder="VD: 16.0544" size="large" className="rounded-lg" />
                </Form.Item>

                <Form.Item
                  label={<span className="font-medium text-slate-700">{t("geofencing")}</span>}
                  name="station_gps_geofencing"
                  rules={[{ type: "number", min: 0, message: "Bán kính phải >= 0" }]}
                  className="col-span-1 md:col-span-2 mb-0"
                >
                  <InputNumber
                    placeholder="Bán kính chấp nhận"
                    size="large"
                    className="rounded-lg w-full"
                    min={0}
                    addonAfter={<span className="text-slate-500 font-medium px-2">mét</span>}
                  />
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      </Modal>
    </>
  );
};

export default TableStations;
