"use client";

import { Button } from "@/components/ui/button";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import driverApi from "@/services/driver.service";
import mediaApi from "@/services/media.service";
import vehicleTypeApi from "@/services/vehicle-type.service";
import vehicleApi from "@/services/vehicle.service";
import type { Driver } from "@/types/driver";
import type { VehicleMedia } from "@/types/media";
import type { Vehicle, VehicleType } from "@/types/vehicle";
import {
  Divider,
  Form,
  Image,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Table,
  Tooltip,
} from "antd";
import {
  CarFront,
  Download,
  FileArchive,
  FileText,
  Hash,
  PenSquare,
  Plus,
  RefreshCw,
  Trash2,
  Upload as UploadIcon,
  X,
  Scan,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRfidScanner } from "@/hooks/use-rfid-scanner";

interface PendingFile {
  file: File;
  media_name: string;
  media_description: string;
  uid: string;
}

const getDriversFromResponse = (payload: unknown): Driver[] => {
  if (Array.isArray(payload)) {
    return payload as Driver[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.data, record.users, record.items, record.results];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Driver[];
    }
  }

  return [];
};

export default function TableVehicles() {
  const t = useTranslations("VehiclePage");
  const tCommon = useTranslations("Common");
  const { setDirty } = useNavigationStore();

  const [form] = Form.useForm();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);

  // Media states
  const [existingMedia, setExistingMedia] = useState<VehicleMedia[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [uploadingMediaId, setUploadingMediaId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { connect, disconnect, isScanning, lastTag, setLastTag } = useRfidScanner();

  useEffect(() => {
    if (!isModalVisible) {
      disconnect();
    }
  }, [isModalVisible, disconnect]);

  useEffect(() => {
    if (lastTag) {
      form.setFieldsValue({ vehicle_rfid: lastTag });
      toast.success(t("rfidScanSuccess") || "Đã quét thẻ RFID!", {
        description: `Mã thẻ: ${lastTag}`,
        position: "top-center",
      });
      setLastTag(null);
      disconnect();
    }
  }, [lastTag, form, disconnect, setLastTag, t]);

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

  const fetchDrivers = useCallback(async () => {
    setLoadingDrivers(true);
    try {
      const res = await driverApi.getAll({ limit: 1000 });
      const driverData = getDriversFromResponse(res.data);
      setDrivers(
        driverData
          .filter(
            (driver): driver is Driver => Boolean(driver?.user_id) && driver.role === "driver"
          )
          .sort((a, b) => a.user_full_name.localeCompare(b.user_full_name))
      );
    } catch {
      setDrivers([]);
    } finally {
      setLoadingDrivers(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
    fetchVehicleTypes();
    fetchDrivers();
  }, [fetchVehicles, fetchVehicleTypes, fetchDrivers]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const normalizedSearch = searchText.toLowerCase();
      const matchSearch =
        !searchText ||
        v.vehicle_license_plate?.toLowerCase().includes(normalizedSearch) ||
        v.vehicle_description?.toLowerCase().includes(normalizedSearch) ||
        v.users?.user_full_name?.toLowerCase().includes(normalizedSearch) ||
        v.users?.username?.toLowerCase().includes(normalizedSearch);
      const matchStatus = statusFilter === "all" || v.vehicle_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [vehicles, statusFilter, searchText]);

  const driverOptions = useMemo(
    () =>
      drivers.map((driver) => ({
        value: driver.user_id,
        label: `${driver.user_full_name}${driver.username ? ` (${driver.username})` : ""}`,
      })),
    [drivers]
  );

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

  const fetchMediaForVehicle = useCallback(async (vehicleId: number) => {
    setLoadingMedia(true);
    try {
      const res = await mediaApi.getByReference("vehicles", vehicleId);
      const mediaData = res.data?.data || res.data || [];
      setExistingMedia(Array.isArray(mediaData) ? mediaData : []);
    } catch {
      setExistingMedia([]);
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  const openAddModal = () => {
    setEditingVehicle(null);
    form.resetFields();
    setExistingMedia([]);
    setPendingFiles([]);
    setIsModalVisible(true);
  };

  const openEditModal = async (record: Vehicle) => {
    setEditingVehicle(record);
    form.setFieldsValue({
      vehicle_license_plate: record.vehicle_license_plate,
      vehicle_status: record.vehicle_status,
      vehicle_description: record.vehicle_description,
      vehicle_rfid: record.vehicle_rfid,
      vehicle_type_id: record.vehicle_type_id,
      user_id: record.user_id ?? record.users?.user_id,
    });
    setPendingFiles([]);
    setIsModalVisible(true);
    await fetchMediaForVehicle(record.vehicle_id);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
    setExistingMedia([]);
    setPendingFiles([]);
    setDirty(false);
  };

  const uploadPendingFiles = async (vehicleId: number) => {
    for (const pending of pendingFiles) {
      const formData = new FormData();
      formData.append("file", pending.file);
      formData.append("media_name", pending.media_name);
      formData.append("media_description", pending.media_description);
      formData.append("media_reference_type", "vehicles");
      formData.append("media_reference_id", String(vehicleId));
      try {
        await mediaApi.upload(formData);
      } catch {
        toast.error(t("uploadFailed"), { description: pending.media_name });
      }
    }
    if (pendingFiles.length > 0) {
      toast.success(t("uploadSuccess"), { position: "top-right" });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        user_id: values.user_id ?? null,
      };
      setSaving(true);
      let vehicleId: number;
      if (editingVehicle) {
        await vehicleApi.update(editingVehicle.vehicle_id, payload);
        vehicleId = editingVehicle.vehicle_id;
      } else {
        const res = await vehicleApi.create(payload);
        vehicleId = res.data?.data?.vehicle_id || res.data?.vehicle_id;
      }

      // Upload any pending files
      if (pendingFiles.length > 0 && vehicleId) {
        await uploadPendingFiles(vehicleId);
      }

      setIsModalVisible(false);
      form.resetFields();
      setExistingMedia([]);
      setPendingFiles([]);
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

  // Media handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPending: PendingFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      newPending.push({
        file,
        media_name: nameWithoutExt,
        media_description: "",
        uid: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`,
      });
    }
    setPendingFiles((prev) => [...prev, ...newPending]);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDirectUpload = async (pending: PendingFile) => {
    if (!editingVehicle) return;
    setUploadingMediaId(-1);
    const formData = new FormData();
    formData.append("file", pending.file);
    formData.append("media_name", pending.media_name);
    formData.append("media_description", pending.media_description);
    formData.append("media_reference_type", "vehicles");
    formData.append("media_reference_id", String(editingVehicle.vehicle_id));
    try {
      await mediaApi.upload(formData);
      toast.success(t("uploadSuccess"), { position: "top-right" });
      setPendingFiles((prev) => prev.filter((p) => p.uid !== pending.uid));
      await fetchMediaForVehicle(editingVehicle.vehicle_id);
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setUploadingMediaId(null);
    }
  };

  const updatePendingFile = (
    uid: string,
    field: "media_name" | "media_description",
    value: string
  ) => {
    setPendingFiles((prev) => prev.map((p) => (p.uid === uid ? { ...p, [field]: value } : p)));
  };

  const removePendingFile = (uid: string) => {
    setPendingFiles((prev) => prev.filter((p) => p.uid !== uid));
  };

  const handleDeleteMedia = async (mediaId: number) => {
    setUploadingMediaId(mediaId);
    try {
      await mediaApi.delete(mediaId);
      toast.success(t("deleteDocumentSuccess"), { position: "top-right" });
      setExistingMedia((prev) => prev.filter((m) => m.media_id !== mediaId));
    } catch {
      toast.error(t("deleteDocumentFailed"));
    } finally {
      setUploadingMediaId(null);
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
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 uppercase">
            {t("active")}
          </span>
        );
      case "maintenance":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 uppercase">
            {t("maintenance")}
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 uppercase">
            Đang chạy
          </span>
        );
      case "transporting":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60 uppercase">
            Đang giao
          </span>
        );
      case "collecting":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200/60 uppercase">
            Đang nhận
          </span>
        );
      case "incident":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200/60 uppercase">
            Sự cố
          </span>
        );
      default:
        return <span className="text-slate-500 uppercase">{status}</span>;
    }
  };

  const getFilePreview = (name: string, urlOrFile?: string | File, forceIsImage?: boolean) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const isImage = forceIsImage || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);

    if (isImage && urlOrFile) {
      const src = typeof urlOrFile === "string" ? urlOrFile : URL.createObjectURL(urlOrFile);
      return (
        <div className="w-10 h-10 shrink-0 rounded-md overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center [&_.ant-image]:w-full [&_.ant-image]:h-full [&_.ant-image-img]:w-full [&_.ant-image-img]:h-full">
          <Image
            src={src}
            alt={name}
            className="object-cover"
            preview={{
              mask: <div className="text-[10px] text-white">Xem</div>,
            }}
          />
        </div>
      );
    }

    let Icon = FileText;
    let colorClass = "text-slate-400";

    if (["pdf"].includes(ext)) {
      Icon = FileText;
      colorClass = "text-red-500";
    } else if (["doc", "docx"].includes(ext)) {
      Icon = FileText;
      colorClass = "text-blue-500";
    } else if (["xls", "xlsx"].includes(ext)) {
      Icon = FileText;
      colorClass = "text-green-500";
    } else if (["zip", "rar", "7z"].includes(ext)) {
      Icon = FileArchive;
      colorClass = "text-amber-500";
    } else if (isImage) {
      colorClass = "text-purple-500";
    }

    return (
      <div className="w-10 h-10 shrink-0 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
    );
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
      title: t("rfid"),
      dataIndex: "vehicle_rfid",
      key: "vehicle_rfid",
      render: (val: string | null) =>
        val ? (
          <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-200">
            {val}
          </span>
        ) : (
          <span className="text-slate-400 italic">-</span>
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
      title: t("assignedDriver"),
      dataIndex: "user_id",
      key: "user_id",
      render: (value: number | null | undefined, record: Vehicle) => {
        if (record.users?.user_full_name) {
          return (
            <div className="leading-tight">
              <div className="font-medium text-slate-800">{record.users.user_full_name}</div>
              {record.users.username && (
                <div className="text-xs text-slate-500">@{record.users.username}</div>
              )}
            </div>
          );
        }

        if (value) {
          return <span className="text-xs text-slate-500">#{value}</span>;
        }

        return <span className="text-slate-400 italic">{t("unassigned")}</span>;
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
      <div className="m-10 bg-white rounded-2xl shadow-sm border border-slate-200 animate-fade-in overflow-hidden">
        <div className="p-6 md:p-8 border-b-2 border-slate-100 flex items-start justify-between gap-6 flex-wrap bg-slate-50/50">
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
              { value: "running", label: "Đang chạy" },
              { value: "transporting", label: "Đang giao" },
              { value: "collecting", label: "Đang nhận" },
              { value: "maintenance", label: t("maintenance") },
              { value: "incident", label: "Sự cố" },
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
        width={720}
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
                  label={<span className="font-medium text-slate-700">{t("assignedDriver")}</span>}
                  name="user_id"
                  className="mb-0"
                >
                  <Select
                    size="large"
                    className="rounded-lg"
                    placeholder={t("driverPlaceholder")}
                    allowClear
                    loading={loadingDrivers}
                    showSearch
                    options={driverOptions}
                    optionFilterProp="label"
                    getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                  />
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
                  label={<span className="font-medium text-slate-700">{t("rfidLabel")}</span>}
                  name="vehicle_rfid"
                  className="mb-0"
                >
                  <Input
                    placeholder={t("rfidPlaceholder")}
                    size="large"
                    className="rounded-lg font-mono tracking-wider"
                    suffix={
                      <Tooltip title={isScanning ? "Đang đợi thẻ..." : "Bấm để quét thẻ RFID"}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.preventDefault();
                            if (isScanning) disconnect();
                            else connect();
                          }}
                        >
                          <Scan
                            className={`w-4 h-4 ${
                              isScanning ? "text-blue-500 animate-pulse" : "text-slate-400"
                            }`}
                          />
                        </Button>
                      </Tooltip>
                    }
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
                    {/* <Select.Option value="running">{t("running")}</Select.Option>
                    <Select.Option value="transporting">{t("transporting")}</Select.Option>
                    <Select.Option value="collecting">{t("collecting")}</Select.Option> */}
                    <Select.Option value="maintenance">{t("maintenanceOption")}</Select.Option>
                    <Select.Option value="incident">{t("incident")}</Select.Option>
                  </Select>
                </Form.Item>
              </div>
            </div>
          </Form>

          {/* Document / Media Upload Section */}
          <Divider className="!my-6" />
          <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
              <FileText className="w-5 h-5 text-slate-500" />
              <h3 className="text-base font-medium text-slate-800">{t("documentSection")}</h3>
            </div>

            {/* Upload trigger */}
            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 rounded-xl py-6 px-4 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-200 cursor-pointer group"
              >
                <UploadIcon className="w-8 h-8 mx-auto mb-2 text-slate-400 group-hover:text-blue-500 transition-colors" />
                <p className="text-sm font-medium text-slate-600 group-hover:text-blue-600">
                  {t("uploadHint")}
                </p>
              </button>
            </div>

            {/* Pending files (not yet uploaded) */}
            {pendingFiles.length > 0 && (
              <div className="space-y-3 mb-4">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                  {!editingVehicle ? t("pendingUpload") : ""}
                </p>
                {pendingFiles.map((pending) => (
                  <div
                    key={pending.uid}
                    className="bg-amber-50/50 border border-amber-200/60 rounded-lg p-3 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      {getFilePreview(pending.file.name, pending.file)}
                      <span className="text-xs text-slate-500 truncate flex-1">
                        {pending.file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(pending.uid)}
                        className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">
                          {t("documentName")}
                        </label>
                        <Input
                          size="small"
                          value={pending.media_name}
                          onChange={(e) =>
                            updatePendingFile(pending.uid, "media_name", e.target.value)
                          }
                          placeholder={t("documentName")}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">
                          {t("documentDescription")}
                        </label>
                        <Input
                          size="small"
                          value={pending.media_description}
                          onChange={(e) =>
                            updatePendingFile(pending.uid, "media_description", e.target.value)
                          }
                          placeholder={t("documentDescriptionPlaceholder")}
                        />
                      </div>
                    </div>
                    {editingVehicle && (
                      <div className="flex justify-end">
                        <Button
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => handleDirectUpload(pending)}
                          disabled={uploadingMediaId !== null}
                        >
                          <UploadIcon className="w-3 h-3 mr-1" />
                          {uploadingMediaId === -1 ? t("uploading") : t("uploadFile")}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Existing media list */}
            {loadingMedia && (
              <div className="py-6 text-center text-sm text-slate-400 animate-pulse">
                Loading...
              </div>
            )}

            {!loadingMedia && existingMedia.length > 0 && (
              <div className="space-y-2">
                {existingMedia.map((media) => (
                  <div
                    key={media.media_id}
                    className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 group hover:border-slate-300 transition-colors"
                  >
                    {getFilePreview(
                      media.media_name,
                      media.media_url,
                      media.media_type === "images"
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {media.media_name}
                      </p>
                      {media.media_description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {media.media_description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {media.media_url && (
                        <Tooltip title={t("download")}>
                          <a
                            href={media.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </Tooltip>
                      )}
                      <Popconfirm
                        title={t("deleteDocument")}
                        description={t("confirmDeleteDocument")}
                        okText={t("okText")}
                        cancelText={t("cancelText")}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDeleteMedia(media.media_id)}
                      >
                        <Tooltip title={t("deleteDocument")}>
                          <button
                            type="button"
                            disabled={uploadingMediaId === media.media_id}
                            className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingMedia && existingMedia.length === 0 && pendingFiles.length === 0 && (
              <div className="text-center py-6 text-slate-400">
                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">{t("noDocuments")}</p>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
