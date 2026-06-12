"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input as ShadInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select as ShadSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea as ShadTextarea } from "@/components/ui/textarea";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { usePermissions } from "@/hooks/use-permissions";
import { useSocketEventListener } from "@/hooks/useSocketEventListener";
import { useSocket } from "@/context/socket-context";
import {
  formatVietnameseCurrencyValue,
  normalizeVietnameseCurrencyInput,
  parseVietnameseCurrencyInput,
} from "@/lib/currency";
import mediaApi from "@/services/media.service";
import ocrApi from "@/services/ocr.service";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import MaintenanceAiBadge from "@/components/features/vehicle-maintenance-manage/MaintenanceAiBadge";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-selector";
import {
  bulkDeleteVehicleMaintenancesThunk,
  clearSelectedVehicleMaintenanceIds,
  fetchVehicleMaintenances,
  setSelectedVehicleMaintenanceIds,
  setVehicleMaintenancePagination,
} from "@/store/slices/vehicleMaintenanceSlice";
import { fetchVehicleNameOptions } from "@/store/slices/vehicleSlice";
import type { Vehicle, VehicleMaintenance, VehicleMaintenanceDocument } from "@/types/vehicle";
import type { VtrackingVehicle } from "@/types/vtracking";
import { Pagination, Table, Tooltip } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import {
  Calendar as CalendarIcon,
  Camera,
  ClipboardList,
  FileText,
  Plus,
  ReceiptText,
  RefreshCw,
  ScanText,
  Search,
  Trash2,
  UploadCloud,
  Wrench,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { type Key, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const DIALOG_CONTROL_CLASS = "!h-11 min-h-11 w-full bg-white px-3 py-2 text-sm";
const DIALOG_GRID_CLASS = "grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2";

const MAINTENANCE_TYPES = [
  { value: "maintenance", label: "Bảo dưỡng" },
  { value: "repair", label: "Sửa chữa" },
  { value: "inspection", label: "Kiểm tra" },
  { value: "other", label: "Khác" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Nháp" },
  { value: "submitted", label: "Đã gửi" },
  { value: "reviewing", label: "Đang duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
  { value: "completed", label: "Hoàn tất" },
  { value: "canceled", label: "Đã hủy" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "unpaid", label: "Chưa thanh toán" },
  { value: "partial", label: "Thanh toán một phần" },
  { value: "paid", label: "Đã thanh toán" },
  { value: "not_required", label: "Không cần thanh toán" },
];

const RANK_OPTIONS = [
  { value: 1, label: "Thấp" },
  { value: 2, label: "Trung bình" },
  { value: 3, label: "Cao" },
  { value: 4, label: "Rất nghiêm trọng" },
];

const MAINTENANCE_LIST_TABS = [
  { value: "all", label: "Tất cả" },
  { value: "mine", label: "Của tôi" },
  { value: "submitted", label: "Chờ kiểm tra" },
  { value: "reviewing", label: "Chờ phê duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
];

const VTRACKING_DISTANCE_KEY = "distance";

type MaintenanceFormValues = {
  vehicle_id: number;
  dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
  vehicle_maintenance_location?: string | null;
  vehicle_distance_covered?: number | null;
  vehicle_maintenance_description?: string | null;
  vehicle_maintenance_type?: string;
  vehicle_maintenance_rank?: number;
  vehicle_maintenance_status?: string;
  payment_status?: string;
  deadline_pay?: dayjs.Dayjs | null;
  paid_at?: dayjs.Dayjs | null;
  service_provider_name?: string | null;
  service_provider_address?: string | null;
  invoice_no?: string | null;
  invoice_date?: dayjs.Dayjs | null;
  total_amount?: number | null;
  currency?: string | null;
  vehicle_maintenance_ocr_text?: string | null;
};

type UploadMediaResponse = {
  media_id?: number;
  data?: { media_id?: number };
};

type MaintenanceFormErrors = Partial<Record<keyof MaintenanceFormValues | "dateRange", string>>;

function createDefaultFormValues(): MaintenanceFormValues {
  return {
    dateRange: [dayjs(), dayjs()],
    vehicle_maintenance_type: "maintenance",
    vehicle_maintenance_rank: 1,
    vehicle_maintenance_status: "draft",
    payment_status: "unpaid",
    currency: "VND",
  } as MaintenanceFormValues;
}

function normalizeVehicleIdentity(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s._-]/g, "");
}

function isSameVehicleIdentity(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeVehicleIdentity(left);
  const normalizedRight = normalizeVehicleIdentity(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  return (
    normalizedLeft.length >= 5 &&
    normalizedRight.length >= 5 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  );
}

function parseVtrackingNumericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const compactValue = value.trim().replace(/\s/g, "");
  if (!compactValue) return null;

  const dotCount = (compactValue.match(/\./g) || []).length;
  const normalized =
    compactValue.includes(",")
      ? compactValue.replace(/\./g, "").replace(",", ".")
      : dotCount > 1
        ? compactValue.replace(/\./g, "")
        : compactValue.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getVtrackingDistanceKm(vehicle?: VtrackingVehicle | null) {
  const attr = vehicle?.attributes?.find((item) => item.attribute_key === VTRACKING_DISTANCE_KEY);
  const rawValue = parseVtrackingNumericValue(attr?.value);
  if (rawValue === null || rawValue < 0) return null;

  return rawValue;
}

function formatVtrackingDistanceValue(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return "";
  return String(Number(value));
}

function findMatchingVtrackingVehicle(
  vtrackingVehicles: VtrackingVehicle[],
  vehicle?: Vehicle | null
) {
  if (!vehicle) return null;

  return (
    vtrackingVehicles.find(
      (item) =>
        isSameVehicleIdentity(item.license_plate, vehicle.vehicle_license_plate) ||
        isSameVehicleIdentity(item.vehicle_name, vehicle.vehicle_name) ||
        isSameVehicleIdentity(item.vehicle_name, vehicle.vehicle_license_plate)
    ) ?? null
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-red-500">{message}</p>;
}

function DialogFormSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-slate-100 text-slate-600">
          {icon}
        </div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function DateField({
  label,
  value,
  placeholder,
  error,
  onChange,
}: {
  label: string;
  value?: dayjs.Dayjs | null;
  placeholder: string;
  error?: string;
  onChange: (value: dayjs.Dayjs | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = value?.isValid() ? value.toDate() : undefined;

  return (
    <div className="space-y-2">
      <Label className="text-slate-700">{label}</Label>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={`!h-11 min-h-11 w-full justify-start bg-white px-3 py-2 text-left text-sm font-normal ${value?.isValid() ? "text-slate-900" : "text-muted-foreground"
              }`}
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            {value?.isValid() ? value.format("DD/MM/YYYY") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              onChange(date ? dayjs(date) : null);
              if (date) setIsOpen(false);
            }}
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
      <FieldError message={error} />
    </div>
  );
}

function getVehicleLabelById(vehicles: Vehicle[], vehicleId: number) {
  const found = vehicles.find((v) => v.vehicle_id === vehicleId);
  if (!found) return `#${vehicleId}`;
  return found.vehicle_license_plate
    ? `${found.vehicle_license_plate}${found.vehicle_name ? ` | ${found.vehicle_name}` : ""}`
    : `#${vehicleId}`;
}

function getVehicleLabel(record: VehicleMaintenance, vehicles: Vehicle[]) {
  const vehicle = record.vehicle;
  if (vehicle?.vehicle_license_plate) {
    return `${vehicle.vehicle_license_plate}${vehicle.vehicle_name ? ` | ${vehicle.vehicle_name}` : ""}`;
  }
  return getVehicleLabelById(vehicles, record.vehicle_id);
}

function getMaintenanceStatus(record: VehicleMaintenance) {
  if (record.vehicle_maintenance_status) return record.vehicle_maintenance_status;
  const toDate = record.vehicle_maintenance_to_datetime
    ? dayjs(record.vehicle_maintenance_to_datetime)
    : null;
  return toDate && toDate.isAfter(dayjs()) ? "submitted" : "completed";
}

function getStatusLabel(status: string) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function getRankLabel(rank?: number) {
  return RANK_OPTIONS.find((item) => item.value === Number(rank))?.label || "-";
}

function getDurationDays(from: string, to?: string | null) {
  if (!to) return 0;
  return Math.max(dayjs(to).diff(dayjs(from), "day"), 0);
}

function getStatusBadgeClass(status: string) {
  if (status === "completed" || status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected" || status === "canceled") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (status === "reviewing") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function getRankBadgeClass(rank?: number) {
  const value = Number(rank || 1);
  if (value >= 4) return "border-red-200 bg-red-50 text-red-700";
  if (value === 3) return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === 2) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getPaymentStatusBadgeClass(status?: string | null) {
  if (status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "partial") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "not_required") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

function getStatusDisplay(record: VehicleMaintenance) {
  const status = getMaintenanceStatus(record);
  return (
    <Badge variant="outline" className={getStatusBadgeClass(status)}>
      {getStatusLabel(status)}
    </Badge>
  );
}

function getRankDisplay(rank?: number) {
  const value = Number(rank || 1);
  return (
    <Badge variant="outline" className={getRankBadgeClass(value)}>
      {getRankLabel(value)}
    </Badge>
  );
}

function buildPayload(values: MaintenanceFormValues): Partial<VehicleMaintenance> {
  return {
    vehicle_id: values.vehicle_id,
    vehicle_maintenance_from_datetime:
      values.dateRange?.[0]?.toISOString() || new Date().toISOString(),
    vehicle_maintenance_to_datetime: values.dateRange?.[1]?.toISOString() || null,
    vehicle_maintenance_location: values.vehicle_maintenance_location || null,
    vehicle_distance_covered: values.vehicle_distance_covered || null,
    vehicle_maintenance_description: values.vehicle_maintenance_description || null,
    vehicle_maintenance_type: values.vehicle_maintenance_type || "maintenance",
    vehicle_maintenance_rank: values.vehicle_maintenance_rank || 1,
    vehicle_maintenance_status: "draft",
    payment_status: values.payment_status || "unpaid",
    deadline_pay: values.deadline_pay ? values.deadline_pay.toISOString() : null,
    paid_at: values.paid_at ? values.paid_at.toISOString() : null,
    service_provider_name: values.service_provider_name || null,
    service_provider_address: values.service_provider_address || null,
    invoice_no: values.invoice_no || null,
    invoice_date: values.invoice_date ? values.invoice_date.toISOString() : null,
    total_amount: values.total_amount ?? null,
    currency: values.currency || "VND",
    vehicle_maintenance_ocr_text: values.vehicle_maintenance_ocr_text || null,
  };
}

export default function TableVehicleMaintenances() {
  const t = useTranslations("VehicleMaintenancePage");
  const tCommon = useTranslations("Common");
  const tAi = useTranslations("MaintenanceAiInsight");
  const { hasActionAccess } = usePermissions();
  const { setDirty } = useNavigationStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleIdFilter = Number(searchParams.get("vehicle_id")) || null;
  const { isConnected } = useSocket();
  const dispatch = useAppDispatch();
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const {
    bulkDeleting,
    items: maintenances,
    limit,
    loading,
    page,
    selectedIds,
    total,
  } = useAppSelector((state) => state.vehicleMaintenances);
  const {
    nameOptions: vehicles,
    nameOptionsLoaded: vehicleOptionsLoaded,
    nameOptionsLoading: vehicleOptionsLoading,
  } = useAppSelector((state) => state.vehicles);

  const [formValues, setFormValues] = useState<MaintenanceFormValues>(() =>
    createDefaultFormValues()
  );
  const [formErrors, setFormErrors] = useState<MaintenanceFormErrors>({});
  const [assignedVehicleIds, setAssignedVehicleIds] = useState<number[]>([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<VehicleMaintenance | null>(null);
  const [currentDocuments, setCurrentDocuments] = useState<VehicleMaintenanceDocument[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFileName, setOcrFileName] = useState<string | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceHelperText, setDistanceHelperText] = useState<string | null>(null);
  const [totalAmountInput, setTotalAmountInput] = useState("");
  const isTotalAmountFocusedRef = useRef(false);
  const vtrackingDistanceRequestIdRef = useRef(0);
  const [saving, setSaving] = useState(false);

  const buildListParams = useCallback(
    (overrides?: { page?: number; limit?: number; search?: string; status?: string }) => {
      const nextPage = overrides?.page ?? page;
      const nextLimit = overrides?.limit ?? limit;
      const nextSearch = overrides?.search ?? searchText;
      const nextStatus = overrides?.status ?? statusFilter;
      const params: Record<string, unknown> = {
        page: nextPage,
        limit: nextLimit,
      };
      const keyword = nextSearch.trim();
      if (keyword) params.search = keyword;
      if (nextStatus === "mine") {
        params.mine = true;
      } else if (nextStatus !== "all") {
        params.status = nextStatus;
      }
      if (vehicleIdFilter) params.vehicle_id = vehicleIdFilter;
      return params;
    },
    [limit, page, searchText, statusFilter, vehicleIdFilter]
  );

  const fetchMaintenances = useCallback(async (overrides?: { page?: number; limit?: number; search?: string; status?: string }) => {
    try {
      await dispatch(fetchVehicleMaintenances(buildListParams(overrides))).unwrap();
    } catch {
      toast.error(t("loadFailed"), { position: "top-right" });
    }
  }, [buildListParams, dispatch, t]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void dispatch(fetchVehicleMaintenances({ ...buildListParams(), force: true }));
    }, 2000);
  }, [buildListParams, dispatch]);

  useSocketEventListener("maintenance:pending_upsert", scheduleRealtimeRefresh, "notifications", isConnected);
  useSocketEventListener("maintenance:pending_remove", scheduleRealtimeRefresh, "notifications", isConnected);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const ensureVehicleOptions = useCallback(async () => {
    if (vehicleOptionsLoaded || vehicleOptionsLoading) return;
    const result = await dispatch(fetchVehicleNameOptions({ limit: 1000 }));
    if (fetchVehicleNameOptions.fulfilled.match(result)) {
      return result.payload.data;
    }
    if (fetchVehicleNameOptions.rejected.match(result)) {
      toast.error("Không tải được danh sách xe", { position: "top-right" });
    }
    return [];
  }, [dispatch, vehicleOptionsLoaded, vehicleOptionsLoading, vehicles]);

  const resetDistanceFromVtracking = useCallback(() => {
    vtrackingDistanceRequestIdRef.current += 1;
    setDistanceLoading(false);
    setDistanceHelperText(null);
  }, []);

  const fetchDistanceFromVtracking = useCallback(
    async (vehicleId: number, vehicleOverride?: Vehicle) => {
      const selectedVehicle = vehicleOverride ?? vehicles.find((item) => item.vehicle_id === vehicleId);
      if (!selectedVehicle) {
        setDistanceLoading(false);
        setDistanceHelperText("Chưa tìm thấy phương tiện trong danh sách xe.");
        return;
      }

      const requestId = vtrackingDistanceRequestIdRef.current + 1;
      vtrackingDistanceRequestIdRef.current = requestId;
      setDistanceLoading(true);
      setDistanceHelperText("Đang lấy số km từ VTracking...");
      setFormValues((prev) =>
        prev.vehicle_id === vehicleId ? { ...prev, vehicle_distance_covered: null } : prev
      );

      try {
        const response = await vtrackingApi.fetchVehicles();
        if (vtrackingDistanceRequestIdRef.current === requestId) {
          const matchedVehicle = findMatchingVtrackingVehicle(
            response.data?.vehicles || [],
            selectedVehicle
          );
          const distanceKm = getVtrackingDistanceKm(matchedVehicle);

          if (distanceKm === null) {
            setDistanceHelperText("Không có dữ liệu số km từ VTracking cho phương tiện này.");
          } else {
            setFormValues((prev) =>
              prev.vehicle_id === vehicleId ? { ...prev, vehicle_distance_covered: distanceKm } : prev
            );
            setDistanceHelperText("Đã lấy số km từ VTracking.");
          }
        }
      } catch {
        if (vtrackingDistanceRequestIdRef.current === requestId) {
          setDistanceHelperText("Không lấy được số km từ VTracking.");
        }
      } finally {
        if (vtrackingDistanceRequestIdRef.current === requestId) {
          setDistanceLoading(false);
        }
      }
    },
    [vehicles]
  );

  const markFormDirty = useCallback(() => {
    if (!useNavigationStore.getState().isDirty) {
      setDirty(true);
    }
  }, [setDirty]);

  const updateFormField = useCallback(
    <K extends keyof MaintenanceFormValues>(field: K, value: MaintenanceFormValues[K]) => {
      setFormValues((prev) => ({ ...prev, [field]: value }));
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
      markFormDirty();
    },
    [markFormDirty]
  );

  const handleTotalAmountChange = useCallback(
    (value: string) => {
      const normalized = normalizeVietnameseCurrencyInput(value);
      setTotalAmountInput(normalized);
      updateFormField("total_amount", parseVietnameseCurrencyInput(normalized));
    },
    [updateFormField]
  );

  const handleVehicleChange = useCallback(
    (value: string) => {
      const vehicleId = Number(value);
      updateFormField("vehicle_id", vehicleId);
      if (Number.isFinite(vehicleId) && vehicleId > 0) {
        void fetchDistanceFromVtracking(vehicleId);
      } else {
        resetDistanceFromVtracking();
      }
    },
    [fetchDistanceFromVtracking, resetDistanceFromVtracking, updateFormField]
  );

  const fetchDriverContext = useCallback(async (availableVehicles: Vehicle[] = vehicles) => {
    try {
      const res = await vehicleMaintenanceApi.getDriverContext({
        date: dayjs().format("YYYY-MM-DD"),
      });
      const assigned = res.data.assigned_vehicles_today || [];
      setAssignedVehicleIds(assigned.map((item) => item.vehicle_id));
      const defaultVehicleId = Number(res.data.default_vehicle_id);
      if (Number.isFinite(defaultVehicleId) && defaultVehicleId > 0) {
        setFormValues((prev) => ({ ...prev, vehicle_id: defaultVehicleId }));
        const defaultVehicle = availableVehicles.find((item) => item.vehicle_id === defaultVehicleId);
        if (defaultVehicle) {
          void fetchDistanceFromVtracking(defaultVehicleId, defaultVehicle);
        }
      }
    } catch {
      setAssignedVehicleIds([]);
    }
  }, [fetchDistanceFromVtracking, vehicles]);

  useEffect(() => {
    fetchMaintenances();
  }, [fetchMaintenances]);

  const filteredMaintenances = useMemo(() => {
    return maintenances;
  }, [maintenances]);

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

  const openAddModal = async () => {
    setEditingRecord(null);
    setCurrentDocuments([]);
    setPendingFiles([]);
    setOcrLoading(false);
    setOcrFileName(null);
    resetDistanceFromVtracking();
    isTotalAmountFocusedRef.current = false;
    setTotalAmountInput("");
    setFormErrors({});
    setFormValues(createDefaultFormValues());
    setIsModalVisible(true);
    const availableVehicles = await ensureVehicleOptions();
    fetchDriverContext(availableVehicles);
  };

  const openEditModal = async (record: VehicleMaintenance) => {
    try {
      ensureVehicleOptions();
      const detail = await vehicleMaintenanceApi.getById(record.vehicle_maintenance_id);
      const item = detail.data || record;
      setEditingRecord(item);
      setCurrentDocuments(item.documents || []);
      setPendingFiles([]);
      setOcrLoading(false);
      setOcrFileName(null);
      resetDistanceFromVtracking();
      isTotalAmountFocusedRef.current = false;
      setTotalAmountInput(formatVietnameseCurrencyValue(item.total_amount));
      setFormErrors({});
      setFormValues({
        vehicle_id: item.vehicle_id,
        dateRange: [
          dayjs(item.vehicle_maintenance_from_datetime),
          item.vehicle_maintenance_to_datetime
            ? dayjs(item.vehicle_maintenance_to_datetime)
            : dayjs(item.vehicle_maintenance_from_datetime),
        ],
        vehicle_maintenance_location: item.vehicle_maintenance_location || "",
        vehicle_distance_covered: item.vehicle_distance_covered || null,
        vehicle_maintenance_description: item.vehicle_maintenance_description || "",
        vehicle_maintenance_type: item.vehicle_maintenance_type || "maintenance",
        vehicle_maintenance_rank: item.vehicle_maintenance_rank || 1,
        vehicle_maintenance_status: item.vehicle_maintenance_status || "draft",
        payment_status: item.payment_status || "unpaid",
        deadline_pay: item.deadline_pay ? dayjs(item.deadline_pay) : null,
        paid_at: item.paid_at ? dayjs(item.paid_at) : null,
        service_provider_name: item.service_provider_name || "",
        service_provider_address: item.service_provider_address || "",
        invoice_no: item.invoice_no || "",
        invoice_date: item.invoice_date ? dayjs(item.invoice_date) : null,
        total_amount: item.total_amount ?? null,
        currency: item.currency || "VND",
        vehicle_maintenance_ocr_text: item.vehicle_maintenance_ocr_text || "",
      });
      setIsModalVisible(true);
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("loadFailed");
      toast.error(t("failed"), { description: message });
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setFormValues(createDefaultFormValues());
    setFormErrors({});
    setEditingRecord(null);
    setCurrentDocuments([]);
    setPendingFiles([]);
    setOcrLoading(false);
    setOcrFileName(null);
    resetDistanceFromVtracking();
    isTotalAmountFocusedRef.current = false;
    setTotalAmountInput("");
    setDirty(false);
  };

  const replaceOcrText = useCallback(
    (text: string) => {
      setFormValues((prev) => ({
        ...prev,
        vehicle_maintenance_ocr_text: text,
      }));
      markFormDirty();
    },
    [markFormDirty]
  );

  const runOcrForFiles = useCallback(
    async (files: File[]) => {
      const readableFiles = files.filter((file) => {
        const lowerName = file.name.toLowerCase();
        return file.type.startsWith("image/") || file.type === "application/pdf" || lowerName.endsWith(".pdf");
      });
      if (readableFiles.length === 0) return;

      setOcrLoading(true);
      try {
        setOcrFileName(readableFiles.length > 1 ? `${readableFiles.length} file` : readableFiles[0].name);
        const textBlocks = (
          await Promise.all(
            readableFiles.map(async (file) => {
              const result = await ocrApi.extractInvoiceText(file);
              const text = result.text.trim();
              if (!text) return "";
              return readableFiles.length > 1 ? `--- ${file.name} ---\n${text}` : text;
            })
          )
        ).filter(Boolean);

        if (textBlocks.length > 0) {
          replaceOcrText(textBlocks.join("\n\n"));
          toast.success("OCR đã đọc xong hóa đơn", { position: "top-right" });
        } else {
          toast.warning("OCR không trả về nội dung để điền", { position: "top-right" });
        }
      } catch (error) {
        const message = (error as Error)?.message || "OCR hóa đơn thất bại";
        toast.error("OCR hóa đơn thất bại", { description: message });
      } finally {
        setOcrLoading(false);
        setOcrFileName(null);
      }
    },
    [replaceOcrText]
  );

  const handleSelectedDocumentFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setPendingFiles((prev) => [...prev, ...files]);
      markFormDirty();
    },
    [markFormDirty]
  );

  const uploadPendingFiles = async (maintenanceId: number) => {
    await Promise.all(
      pendingFiles.map(async (file, index) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("media_name", buildMediaName(file, maintenanceId, index));
        formData.append("media_description", file.name);
        formData.append("media_reference_type", "vehicle_maintenances");
        formData.append("media_reference_id", String(maintenanceId));

        const upload = await mediaApi.upload(formData);
        const mediaPayload = normalizeUploadedMedia(upload.data as UploadMediaResponse);
        if (!mediaPayload.media_id) {
          throw new Error("ERR_MEDIA::MISSING_MEDIA_ID");
        }

        await vehicleMaintenanceApi.addDocument(maintenanceId, {
          media_id: mediaPayload.media_id,
          document_type: "invoice",
          ocr_status: "pending",
          ocr_text: null,
          sort_order: currentDocuments.length + index,
        });
      })
    );
  };

  const handleSave = async () => {
    const errors = validateFormValues();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error(t("failed"), {
        description: Object.values(errors)[0] || t("saveFailed"),
      });
      return;
    }

    try {
      setSaving(true);

      const payload = buildPayload(formValues);
      const saved = editingRecord
        ? await vehicleMaintenanceApi.update(editingRecord.vehicle_maintenance_id, payload)
        : await vehicleMaintenanceApi.create(payload);

      await uploadPendingFiles(saved.data.vehicle_maintenance_id);

      setIsModalVisible(false);
      setFormValues(createDefaultFormValues());
      setFormErrors({});
      setDirty(false);
      setPendingFiles([]);
      setCurrentDocuments([]);
      setOcrLoading(false);
      setOcrFileName(null);
      isTotalAmountFocusedRef.current = false;
      setTotalAmountInput("");
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

  const canDelete = hasActionAccess(
    SIDEBAR.VEHICLE_MAINTENANCES,
    PERMISSIONS.VEHICLE_MAINTENANCES.DELETE
  );

  // Cột AI chỉ hiện cho người có quyền duyệt (giống dock) — admin bypass qua hasActionAccess.
  const canModerate =
    hasActionAccess(SIDEBAR.VEHICLE_MAINTENANCES, PERMISSIONS.VEHICLE_MAINTENANCES.DISPATCH_REVIEW) ||
    hasActionAccess(
      SIDEBAR.VEHICLE_MAINTENANCES,
      PERMISSIONS.VEHICLE_MAINTENANCES.PRODUCTION_APPROVE
    );

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    try {
      const result = await dispatch(bulkDeleteVehicleMaintenancesThunk(selectedIds)).unwrap();
      dispatch(clearSelectedVehicleMaintenanceIds());
      setIsBulkDeleteOpen(false);

      if (result.total_deleted > 0) {
        toast.success(`Đã xóa ${result.total_deleted} phiếu bảo trì`, { position: "top-right" });
      }
      if (result.total_failed > 0) {
        toast.warning(`${result.total_failed} phiếu không thể xóa`, { position: "top-right" });
      }

      const remainingTotal = Math.max(0, total - result.total_deleted);
      const maxPage = Math.max(1, Math.ceil(remainingTotal / limit));
      const nextPage = Math.min(page, maxPage);
      dispatch(setVehicleMaintenancePagination({ page: nextPage, limit }));
      fetchMaintenances({ page: nextPage, limit });
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || t("deleteFailed");
      toast.error(t("failed"), { description: message });
    }
  };

  const rowSelection: TableProps<VehicleMaintenance>["rowSelection"] | undefined = canDelete
    ? {
      preserveSelectedRowKeys: true,
      selectedRowKeys: selectedIds,
      onChange: (keys: Key[]) => {
        const ids: number[] = [];
        for (const key of keys) {
          const id = Number(key);
          if (Number.isFinite(id)) ids.push(id);
        }
        dispatch(setSelectedVehicleMaintenanceIds(ids));
      },
    }
    : undefined;

  const handlePageChange = (nextPage: number, nextLimit: number) => {
    dispatch(setVehicleMaintenancePagination({ page: nextPage, limit: nextLimit }));
  };

  const openDetailPage = (record: VehicleMaintenance) => {
    router.push(`${SIDEBAR.VEHICLE_MAINTENANCES}/${record.vehicle_maintenance_id}`);
  };

  const handleDeleteDocument = async (document: VehicleMaintenanceDocument) => {
    try {
      await vehicleMaintenanceApi.deleteDocument(document.vehicle_maintenance_document_id);
      setCurrentDocuments((prev) =>
        prev.filter(
          (item) =>
            item.vehicle_maintenance_document_id !== document.vehicle_maintenance_document_id
        )
      );
      toast.success("Đã xóa tài liệu", { position: "top-right" });
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        "Xóa tài liệu thất bại";
      toast.error(t("failed"), { description: message });
    }
  };

  const validateFormValues = () => {
    const errors: MaintenanceFormErrors = {};
    if (!formValues.vehicle_id) {
      errors.vehicle_id = t("requiredVehicle");
    }
    if (!formValues.dateRange?.[0] || !formValues.dateRange?.[1]) {
      errors.dateRange = t("requiredDateRange");
    }
    if (!formValues.vehicle_maintenance_description?.trim()) {
      errors.vehicle_maintenance_description = t("requiredDescription");
    }
    return errors;
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
      render: (_vehicleId: number, record: VehicleMaintenance) => (
        <div className="font-semibold text-slate-800 bg-slate-100 uppercase tracking-wider px-3 py-1 rounded inline-block border-2 border-slate-300">
          {getVehicleLabel(record, vehicles)}
        </div>
      ),
    },
    {
      title: t("dateRange"),
      key: "dateRange",
      render: (_: unknown, record: VehicleMaintenance) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm">
            <CalendarIcon className="size-3.5 text-slate-400" />
            <span className="text-slate-700">
              {dayjs(record.vehicle_maintenance_from_datetime).format("DD/MM/YYYY")}
            </span>
            <span className="text-slate-400 mx-1">→</span>
            <span className="text-slate-700">
              {record.vehicle_maintenance_to_datetime
                ? dayjs(record.vehicle_maintenance_to_datetime).format("DD/MM/YYYY")
                : "-"}
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
      title: "Mức độ",
      dataIndex: "vehicle_maintenance_rank",
      key: "vehicle_maintenance_rank",
      align: "center" as const,
      render: (rank: number) => getRankDisplay(rank),
    },
    {
      title: t("description"),
      dataIndex: "vehicle_maintenance_description",
      key: "vehicle_maintenance_description",
      width: 320,
      ellipsis: true,
      render: (val: string | null, record: VehicleMaintenance) => {
        const text = val || record.service_provider_name || "-";
        return text !== "-" ? (
          <Tooltip title={text}>
            <span className="text-slate-600">{text}</span>
          </Tooltip>
        ) : (
          <span className="text-slate-400 italic">-</span>
        );
      },
    },
    {
      title: "Thanh toán",
      key: "payment_status",
      render: (_: unknown, record: VehicleMaintenance) => (
        <div className="space-y-1">
          <Badge
            variant="outline"
            className={`rounded-md ${getPaymentStatusBadgeClass(record.payment_status)}`}
          >
            {PAYMENT_STATUS_OPTIONS.find((item) => item.value === record.payment_status)?.label ||
              "-"}
          </Badge>
          {record.deadline_pay ? (
            <div className="text-xs text-slate-500">
              Hạn: {dayjs(record.deadline_pay).format("DD/MM/YYYY")}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: "Tài liệu",
      key: "documents",
      align: "center" as const,
      render: (_: unknown, record: VehicleMaintenance) => (
        <Badge variant="outline" className="rounded-md">
          <FileText className="size-3" />
          {record.document_count ?? record.documents?.length ?? 0}
        </Badge>
      ),
    },
    ...(canModerate
      ? [
          {
            title: tAi("columnTitle"),
            key: "ai_insight",
            align: "center" as const,
            render: (_: unknown, record: VehicleMaintenance) => (
              <MaintenanceAiBadge insight={record.ai_insight} />
            ),
          },
        ]
      : []),
    {
      title: t("status"),
      key: "status",
      align: "center" as const,
      render: (_: unknown, record: VehicleMaintenance) => getStatusDisplay(record),
    },
  ];

  return (
    <>
      <Card className="m-4 gap-0 overflow-hidden rounded-lg py-0 shadow-sm md:m-10">
        <CardHeader className="border-b bg-muted/30 px-6 py-6 md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                {t("title")}
              </h1>
              <p className="text-slate-500 mt-2 text-lg">{t("subtitle")}</p>
            </div>

            <div className="flex gap-3 mt-2 sm:mt-0 flex-wrap">
              {hasActionAccess(
                SIDEBAR.VEHICLE_MAINTENANCES,
                PERMISSIONS.VEHICLE_MAINTENANCES.CREATE
              ) && (
                  <Tooltip title={t("addTooltip")}>
                    <Button variant="primary" onClick={openAddModal}>
                      <Plus className="size-4" />
                      {t("addMaintenance")}
                    </Button>
                  </Tooltip>
                )}

              <Tooltip title={tCommon("refreshData")}>
                <Button
                  className="hover:bg-slate-100 transition-smooth min-w-[120px]"
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={refreshDisabled > 0}
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw className={`size-4 ${refreshDisabled > 0 ? "animate-spin" : ""}`} />
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
        </CardHeader>

        <CardContent className="px-6 py-5 md:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <ShadInput
                placeholder={t("searchPlaceholder")}
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  dispatch(setVehicleMaintenancePagination({ page: 1, limit }));
                }}
                className="h-10 pl-9 pr-9"
              />
              {searchText ? (
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => {
                    setSearchText("");
                    dispatch(setVehicleMaintenancePagination({ page: 1, limit }));
                  }}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>

            {vehicleIdFilter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-700">
                {`Xe #${vehicleIdFilter}`}
                <button type="button" onClick={() => router.replace(SIDEBAR.VEHICLE_MAINTENANCES)} aria-label="clear">
                  <X className="size-3" />
                </button>
              </span>
            )}
            <Tabs
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                dispatch(setVehicleMaintenancePagination({ page: 1, limit }));
                dispatch(clearSelectedVehicleMaintenanceIds());
              }}
            >
              <TabsList>
                {MAINTENANCE_LIST_TABS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} className="px-3">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {canDelete && selectedIds.length > 0 ? (
              // <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-100 bg-red-50 px-3 py-2">
              //   <span className="text-sm font-medium text-red-700">
              //     Đã chọn {selectedIds.length} phiếu
              //   </span>
              //   <Button type="button" variant="destructive"  disabled={bulkDeleting} onClick={() => setIsBulkDeleteOpen(true)}>
              //     <Trash2 className="size-4" />
              //     Xóa đã chọn
              //   </Button>
              // </div>
              <Button type="button" variant="destructive" disabled={bulkDeleting} onClick={() => setIsBulkDeleteOpen(true)}>
                <Trash2 className="size-4" />
                Xóa {selectedIds.length} phiếu
              </Button>
            ) : null}
          </div>
        </CardContent>

        <div
          className="animate-slide-up border-t border-slate-200 overflow-hidden"
          style={{ animationDelay: "100ms" }}
        >
          <Table
            columns={columns}
            dataSource={filteredMaintenances}
            rowKey="vehicle_maintenance_id"
            rowSelection={rowSelection}
            onRow={(record) => ({
              className: "cursor-pointer",
              onClick: (event) => {
                const target = event.target as HTMLElement;
                if (
                  target.closest(
                    "button,a,input,.ant-checkbox,.ant-checkbox-wrapper,.ant-table-selection-column"
                  )
                ) {
                  return;
                }
                openDetailPage(record);
              },
            })}
            loading={loading}
            pagination={false}
            bordered
            scroll={{ x: "max-content" }}
            tableLayout="auto"
          />

          <CardFooter className="justify-end border-t bg-muted/30 p-4">
            <Pagination
              current={page}
              pageSize={limit}
              total={total}
              align="end"
              showSizeChanger
              onChange={handlePageChange}
              showTotal={(total) => (
                <>
                  <i>{t("total")}</i>: <b>{total}</b>
                </>
              )}
            />
          </CardFooter>
        </div>

        {/* {!loading && filteredMaintenances.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg">{t("emptyTitle")}</p>
            <p className="text-sm mt-2">{t("emptyHint")}</p>
          </div>
        )} */}
      </Card>

      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa các phiếu bảo trì đã chọn?</AlertDialogTitle>
            <AlertDialogDescription>
              Thao tác này sẽ xóa mềm {selectedIds.length} phiếu bảo trì và các tài liệu liên quan.
              File trong MinIO sẽ không bị xóa vật lý ngay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={bulkDeleting}
              onClick={(event) => {
                event.preventDefault();
                handleBulkDelete();
              }}
            >
              {bulkDeleting ? "Đang xóa..." : "Xóa phiếu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={isModalVisible}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border-slate-200 bg-slate-50 p-0 sm:max-w-[960px]">
          <DialogHeader className="border-b bg-white px-8 py-6 pr-14 md:px-10">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-12 items-center justify-center rounded-full ${editingRecord ? "bg-amber-100" : "bg-blue-100"
                  }`}
              >
                <Wrench
                  className={`size-5 ${editingRecord ? "text-amber-600" : "text-blue-600"}`}
                />
              </div>
              <div>
                <DialogTitle className="text-xl text-slate-900">
                  {editingRecord ? t("editMaintenance") : t("newMaintenance")}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {editingRecord ? t("editSubtitle") : t("newSubtitle")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-[calc(92vh-164px)] overflow-y-auto px-8 py-6 md:px-10">
            <div className="space-y-5">
              <DialogFormSection
                icon={<ClipboardList className="size-5" />}
                title={t("sectionInfo")}
              >
                <div className={DIALOG_GRID_CLASS}>
                  <div className="space-y-2">
                    <Label className="text-slate-700">{t("vehicle")}</Label>
                    <ShadSelect
                      value={formValues.vehicle_id ? String(formValues.vehicle_id) : undefined}
                      onValueChange={handleVehicleChange}
                    >
                      <SelectTrigger
                        className={DIALOG_CONTROL_CLASS}
                        aria-invalid={Boolean(formErrors.vehicle_id)}
                      >
                        <SelectValue placeholder={t("vehiclePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent className="max-h-72 overflow-y-auto">
                        {vehicles.map((v) => (
                          <SelectItem key={v.vehicle_id} value={String(v.vehicle_id)}>
                            {v.vehicle_license_plate}
                            {v.vehicle_name ? ` | ${v.vehicle_name}` : ""}
                            {assignedVehicleIds.includes(v.vehicle_id)
                              ? " | được phân công hôm nay"
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </ShadSelect>
                    <FieldError message={formErrors.vehicle_id} />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Loại phiếu</Label>
                    <ShadSelect
                      value={formValues.vehicle_maintenance_type || "maintenance"}
                      onValueChange={(value) => updateFormField("vehicle_maintenance_type", value)}
                    >
                      <SelectTrigger className={DIALOG_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAINTENANCE_TYPES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </ShadSelect>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Mức độ nghiêm trọng</Label>
                    <ShadSelect
                      value={String(formValues.vehicle_maintenance_rank || 1)}
                      onValueChange={(value) =>
                        updateFormField("vehicle_maintenance_rank", Number(value))
                      }
                    >
                      <SelectTrigger className={DIALOG_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RANK_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={String(item.value)}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </ShadSelect>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">{t("status")}</Label>
                    <ShadSelect
                      value={formValues.vehicle_maintenance_status || "draft"}
                      disabled
                      onValueChange={(value) =>
                        updateFormField("vehicle_maintenance_status", value)
                      }
                    >
                      <SelectTrigger className={DIALOG_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </ShadSelect>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">{t("distanceCovered")}</Label>
                    <div className="relative">
                      <ShadInput
                        type="text"
                        disabled
                        placeholder={
                          distanceLoading
                            ? "Đang lấy từ VTracking..."
                            : formValues.vehicle_id
                              ? "Tự động lấy từ VTracking"
                              : t("vehiclePlaceholder")
                        }
                        value={formatVtrackingDistanceValue(formValues.vehicle_distance_covered)}
                        className={`${DIALOG_CONTROL_CLASS} pr-12 disabled:opacity-100`}
                      />
                      {distanceLoading ? (
                        <RefreshCw className="absolute right-10 top-1/2 size-4 -translate-y-1/2 animate-spin text-blue-500" />
                      ) : null}
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {t("km")}
                      </span>
                    </div>
                    {distanceHelperText ? (
                      <p className="text-xs text-muted-foreground">{distanceHelperText}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Địa điểm sửa chữa</Label>
                    <ShadInput
                      className={DIALOG_CONTROL_CLASS}
                      placeholder="Garage, xưởng sửa chữa, trạm bảo trì..."
                      value={formValues.vehicle_maintenance_location || ""}
                      onChange={(event) =>
                        updateFormField("vehicle_maintenance_location", event.target.value)
                      }
                    />
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-slate-700">{t("dateRange")}</Label>
                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                      <DateField
                        label={t("dateRangePlaceholder.0") as string}
                        placeholder={t("dateRangePlaceholder.0") as string}
                        value={formValues.dateRange?.[0]}
                        onChange={(value) => {
                          if (!value) return;
                          const current = formValues.dateRange ?? [value, value];
                          updateFormField("dateRange", [value, current[1] ?? value]);
                        }}
                      />
                      <DateField
                        label={t("dateRangePlaceholder.1") as string}
                        placeholder={t("dateRangePlaceholder.1") as string}
                        value={formValues.dateRange?.[1]}
                        onChange={(value) => {
                          if (!value) return;
                          const current = formValues.dateRange ?? [value, value];
                          updateFormField("dateRange", [current[0] ?? value, value]);
                        }}
                      />
                    </div>
                    <FieldError message={formErrors.dateRange} />
                  </div>
                </div>
              </DialogFormSection>

              <DialogFormSection
                icon={<ReceiptText className="size-5" />}
                title="Hóa đơn và thanh toán"
              >
                <div className={DIALOG_GRID_CLASS}>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Đơn vị sửa chữa</Label>
                    <ShadInput
                      className={DIALOG_CONTROL_CLASS}
                      value={formValues.service_provider_name || ""}
                      onChange={(event) =>
                        updateFormField("service_provider_name", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Địa chỉ đơn vị</Label>
                    <ShadInput
                      className={DIALOG_CONTROL_CLASS}
                      value={formValues.service_provider_address || ""}
                      onChange={(event) =>
                        updateFormField("service_provider_address", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Số hóa đơn</Label>
                    <ShadInput
                      className={DIALOG_CONTROL_CLASS}
                      value={formValues.invoice_no || ""}
                      onChange={(event) => updateFormField("invoice_no", event.target.value)}
                    />
                  </div>
                  <DateField
                    label="Ngày hóa đơn"
                    placeholder="Chọn ngày hóa đơn"
                    value={formValues.invoice_date}
                    onChange={(value) => updateFormField("invoice_date", value)}
                  />
                  <div className="space-y-2">
                    <Label className="text-slate-700">Tổng tiền</Label>
                    <ShadInput
                      type="text"
                      inputMode="decimal"
                      className={DIALOG_CONTROL_CLASS}
                      placeholder="VD: 100.000.000 hoặc 10.000.500,50"
                      value={totalAmountInput}
                      onFocus={() => {
                        isTotalAmountFocusedRef.current = true;
                        setTotalAmountInput(formatVietnameseCurrencyValue(formValues.total_amount));
                      }}
                      onBlur={() => {
                        isTotalAmountFocusedRef.current = false;
                        setTotalAmountInput(formatVietnameseCurrencyValue(formValues.total_amount));
                      }}
                      onChange={(event) => handleTotalAmountChange(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Tiền tệ</Label>
                    <ShadSelect
                      value={formValues.currency || "VND"}
                      onValueChange={(value) => updateFormField("currency", value)}
                    >
                      <SelectTrigger className={DIALOG_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VND">VND</SelectItem>
                      </SelectContent>
                    </ShadSelect>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Trạng thái thanh toán</Label>
                    <ShadSelect
                      value={formValues.payment_status || "unpaid"}
                      onValueChange={(value) => updateFormField("payment_status", value)}
                    >
                      <SelectTrigger className={DIALOG_CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_STATUS_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </ShadSelect>
                  </div>
                  <DateField
                    label="Hạn thanh toán"
                    placeholder="Chọn hạn thanh toán"
                    value={formValues.deadline_pay}
                    onChange={(value) => updateFormField("deadline_pay", value)}
                  />
                </div>
              </DialogFormSection>

              <DialogFormSection icon={<Wrench className="size-5" />} title={t("sectionDetails")}>
                <div className="space-y-2">
                  <Label className="text-slate-700">{t("description")}</Label>
                  <ShadTextarea
                    rows={4}
                    placeholder={t("descriptionPlaceholder")}
                    className="min-h-32 bg-white"
                    value={formValues.vehicle_maintenance_description || ""}
                    onChange={(event) =>
                      updateFormField("vehicle_maintenance_description", event.target.value)
                    }
                  />
                  <FieldError message={formErrors.vehicle_maintenance_description} />
                </div>
              </DialogFormSection>

              <DialogFormSection icon={<Camera className="size-5" />} title="Tài liệu và OCR">
                <div className="mb-4 space-y-2">
                  <Label className="text-slate-700">Nội dung OCR / bản dịch hóa đơn</Label>
                  <ShadTextarea
                    rows={5}
                    className="min-h-36 bg-white"
                    placeholder="Nội dung OCR sẽ được điền tự động khi tích hợp OCR provider; tài xế có thể chỉnh lại trước khi lưu."
                    value={formValues.vehicle_maintenance_ocr_text || ""}
                    onChange={(event) =>
                      updateFormField("vehicle_maintenance_ocr_text", event.target.value)
                    }
                  />
                </div>

                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-5">
                  <ShadInput
                    ref={documentInputRef}
                    id="vehicle-maintenance-document-upload"
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      handleSelectedDocumentFiles(files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 bg-white"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        documentInputRef.current?.click();
                      }}
                    >
                      <UploadCloud className="size-4" />
                      Chọn ảnh/PDF hóa đơn
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 bg-white"
                      disabled={pendingFiles.length === 0 || ocrLoading}
                      onClick={() => runOcrForFiles(pendingFiles)}
                    >
                      {ocrLoading ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <ScanText className="size-4" />
                      )}
                      {ocrLoading ? "Đang đọc hóa đơn" : "Đọc thông tin hóa đơn"}
                    </Button>
                    {ocrLoading && ocrFileName ? (
                      <span className="text-sm text-slate-500">Đang xử lý: {ocrFileName}</span>
                    ) : null}
                  </div>

                  {pendingFiles.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {pendingFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm"
                        >
                          <span className="truncate">{file.name}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="iconSquare"
                            onClick={() =>
                              setPendingFiles((prev) => {
                                markFormDirty();
                                return prev.filter((_, i) => i !== index);
                              })
                            }
                          >
                            <Trash2 className="size-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {currentDocuments.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {currentDocuments.map((document) => (
                        <div
                          key={document.vehicle_maintenance_document_id}
                          className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm"
                        >
                          <a
                            href={document.media?.media_url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-blue-600 hover:underline"
                          >
                            {document.media?.media_name || `Tài liệu #${document.media_id}`}
                          </a>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant="outline" className="rounded-md">
                              {document.ocr_status}
                            </Badge>
                            <Button
                              type="button"
                              variant="outline"
                              size="iconSquare"
                              onClick={() => handleDeleteDocument(document)}
                            >
                              <Trash2 className="size-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </DialogFormSection>
            </div>
          </div>
          <DialogFooter className="border-t bg-white px-8 py-5 md:px-10">
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
              className={`min-w-[140px] text-white ${editingRecord ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function normalizeUploadedMedia(payload: UploadMediaResponse) {
  return payload.data || payload;
}

function buildMediaName(file: File, maintenanceId: number, index: number) {
  const base = file.name.replace(/\.[^/.]+$/, "");
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return `vehicle_maintenance_${maintenanceId}_${Date.now()}_${index}_${safeBase || "file"}`;
}
