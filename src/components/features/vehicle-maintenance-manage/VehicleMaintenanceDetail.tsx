"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import VehicleMaintenanceDiscussion from "@/components/features/vehicle-maintenance-manage/VehicleMaintenanceDiscussion";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { usePermissions } from "@/hooks/use-permissions";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-selector";
import { formatVietnameseCurrencyValue, normalizeVietnameseCurrencyInput, parseVietnameseCurrencyInput } from "@/lib/currency";
import mediaApi from "@/services/media.service";
import ocrApi from "@/services/ocr.service";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import vtrackingApi from "@/services/vtracking.service";
import { deleteVehicleMaintenanceThunk, fetchVehicleMaintenanceHistoryThunk, fetchVehicleMaintenanceById, runVehicleMaintenanceWorkflowThunk, updateVehicleMaintenanceThunk } from "@/store/slices/vehicleMaintenanceSlice";
import { fetchVehicleNameOptions } from "@/store/slices/vehicleSlice";
import type { Vehicle, VehicleMaintenance, VehicleMaintenanceDocument, VehicleMaintenanceHistory, VehicleMaintenanceWorkflowAction } from "@/types/vehicle";
import type { VtrackingVehicle } from "@/types/vtracking";
import { Image, Popconfirm, Spin, Tooltip } from "antd";
import dayjs from "dayjs";
import { ArrowLeft, Calendar as CalendarIcon, Camera, CheckCircle2, ClipboardList, FileText, History, Pencil, ReceiptText, RefreshCw, Save, ScanText, Send, Trash2, UploadCloud, Wrench, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CONTROL_CLASS = "!h-11 min-h-11 w-full bg-white px-3 py-2 text-sm disabled:bg-slate-50";
const GRID_CLASS = "grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4";

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

const VTRACKING_DISTANCE_KEY = "distance";

const EMPTY_HISTORIES: VehicleMaintenanceHistory[] = [];

type VehicleOption = Pick<Vehicle, "vehicle_id" | "vehicle_license_plate" | "vehicle_name">;

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

type MaintenanceFormErrors = Partial<Record<keyof MaintenanceFormValues | "dateRange", string>>;

type UploadMediaResponse = {
  media_id?: number;
  data?: { media_id?: number };
};

function DetailSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 py-4 last:border-b-0">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex size-7 items-center justify-center text-slate-500">
          {icon}
        </div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-red-500">{message}</p>;
}

function DateField({
  disabled,
  label,
  value,
  placeholder,
  error,
  onChange,
}: {
  disabled: boolean;
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
            disabled={disabled}
            className={`!h-11 min-h-11 w-full justify-start bg-white px-3 py-2 text-left text-sm font-normal disabled:bg-slate-50 ${value?.isValid() ? "text-slate-900" : "text-muted-foreground"
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
  const normalized = compactValue.includes(",")
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

function findMatchingVtrackingVehicle(vtrackingVehicles: VtrackingVehicle[], vehicle?: VehicleOption | null) {
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

function getVehicleLabelById(vehicles: VehicleOption[], vehicleId: number) {
  const found = vehicles.find((v) => v.vehicle_id === vehicleId);
  if (!found) return `#${vehicleId}`;
  return found.vehicle_license_plate
    ? `${found.vehicle_license_plate}${found.vehicle_name ? ` | ${found.vehicle_name}` : ""}`
    : `#${vehicleId}`;
}

function getVehicleLabel(maintenance: VehicleMaintenance, vehicles: VehicleOption[]) {
  const vehicle = maintenance.vehicle;
  if (vehicle?.vehicle_license_plate) {
    return `${vehicle.vehicle_license_plate}${vehicle.vehicle_name ? ` | ${vehicle.vehicle_name}` : ""}`;
  }
  return getVehicleLabelById(vehicles, maintenance.vehicle_id);
}

function getStatusLabel(status?: string | null) {
  if (!status) return "-";
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function getHistoryStatusBadgeClass(status?: string | null) {
  if (status === "approved" || status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected" || status === "canceled") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (status === "submitted") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "reviewing") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  if (status === "draft") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getWorkflowActionLabel(action: string) {
  const labels: Record<string, string> = {
    create: "Tạo phiếu",
    update: "Cập nhật phiếu",
    submit: "Gửi phiếu",
    dispatch_approve: "Kiểm tra bảo trì đạt",
    dispatch_reject: "Kiểm tra bảo trì từ chối",
    production_approve: "Phê duyệt bảo trì",
    production_reject: "Phê duyệt bảo trì từ chối",
    delete: "Xóa phiếu",
    bulk_delete: "Xóa hàng loạt",
  };
  return labels[action] || action;
}

function getWorkflowDialogText(action: VehicleMaintenanceWorkflowAction) {
  const config: Record<
    VehicleMaintenanceWorkflowAction,
    { title: string; description: string; confirmLabel: string; requiresReason?: boolean }
  > = {
    submit: {
      title: "Gửi phiếu bảo trì?",
      description: "Phiếu sẽ chuyển sang trạng thái chờ kiểm tra bảo trì.",
      confirmLabel: "Gửi phiếu",
    },
    dispatch_approve: {
      title: "Hoàn tất kiểm tra bảo trì?",
      description: "Phiếu sẽ được chuyển sang bước phê duyệt bảo trì.",
      confirmLabel: "Chuyển phê duyệt",
    },
    dispatch_reject: {
      title: "Từ chối ở bước kiểm tra bảo trì?",
      description: "Phiếu sẽ trả về trạng thái từ chối để người tạo phiếu chỉnh sửa và gửi lại.",
      confirmLabel: "Từ chối kiểm tra",
      requiresReason: true,
    },
    production_approve: {
      title: "Phê duyệt phiếu bảo trì?",
      description: "Phiếu sẽ được đánh dấu đã duyệt và khóa theo luồng xử lý hiện tại.",
      confirmLabel: "Phê duyệt",
    },
    production_reject: {
      title: "Từ chối phê duyệt phiếu?",
      description: "Phiếu sẽ trả về trạng thái từ chối để bổ sung hoặc chỉnh sửa.",
      confirmLabel: "Từ chối phê duyệt",
      requiresReason: true,
    },
  };
  return config[action];
}

function getCreatorDisplayName(maintenance: VehicleMaintenance) {
  if (maintenance.created_by_user?.user_full_name) return maintenance.created_by_user.user_full_name;
  const creatorId = maintenance.created_by ?? maintenance.reported_by;
  return creatorId ? `#${creatorId}` : "-";
}

function getReviewerDisplayName(maintenance: VehicleMaintenance) {
  if (maintenance.reviewed_by_user?.user_full_name) return maintenance.reviewed_by_user.user_full_name;
  return maintenance.reviewed_by ? `#${maintenance.reviewed_by}` : "-";
}

function getHistoryActorDisplayName(item: VehicleMaintenanceHistory) {
  return item.actor?.name || (item.actor?.id ? `User #${item.actor.id}` : "Không xác định");
}

function getHistoryActorRole(item: VehicleMaintenanceHistory) {
  return item.actor?.role_label || item.actor?.role || null;
}

function toFormValues(item: VehicleMaintenance): MaintenanceFormValues {
  const fromDate = dayjs(item.vehicle_maintenance_from_datetime);
  return {
    vehicle_id: item.vehicle_id,
    dateRange: [
      fromDate,
      item.vehicle_maintenance_to_datetime ? dayjs(item.vehicle_maintenance_to_datetime) : fromDate,
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
  };
}

function buildPayload(values: MaintenanceFormValues): Partial<VehicleMaintenance> {
  return {
    vehicle_id: values.vehicle_id,
    vehicle_maintenance_from_datetime:
      values.dateRange?.[0]?.toISOString() || new Date().toISOString(),
    vehicle_maintenance_to_datetime: values.dateRange?.[1]?.toISOString() || null,
    vehicle_maintenance_location: values.vehicle_maintenance_location || null,
    vehicle_distance_covered: values.vehicle_distance_covered ?? null,
    vehicle_maintenance_description: values.vehicle_maintenance_description || null,
    vehicle_maintenance_type: values.vehicle_maintenance_type || "maintenance",
    vehicle_maintenance_rank: values.vehicle_maintenance_rank || 1,
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

function normalizeUploadedMedia(payload: UploadMediaResponse) {
  return payload.data || payload;
}

function buildMediaName(file: File, maintenanceId: number, index: number) {
  const base = file.name.replace(/\.[^/.]+$/, "");
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return `vehicle_maintenance_${maintenanceId}_${Date.now()}_${index}_${safeBase || "file"}`;
}

function getDocumentMediaName(document: VehicleMaintenanceDocument) {
  return document.media?.media_description || document.media?.media_name || `Tài liệu #${document.media_id}`;
}

function getDocumentMediaSearchText(document: VehicleMaintenanceDocument) {
  return [
    document.media?.media_type,
    document.media?.media_name,
    document.media?.media_description,
    document.media?.media_url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isImageDocument(document: VehicleMaintenanceDocument) {
  const mediaType = document.media?.media_type?.toLowerCase() || "";
  const searchText = getDocumentMediaSearchText(document);
  return (
    mediaType === "images" ||
    mediaType === "image" ||
    mediaType.startsWith("image/") ||
    /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i.test(searchText)
  );
}

function isPdfDocument(document: VehicleMaintenanceDocument) {
  const mediaType = document.media?.media_type?.toLowerCase() || "";
  const searchText = getDocumentMediaSearchText(document);
  return mediaType === "documents" || mediaType.includes("pdf") || /\.pdf(\?|#|$)/i.test(searchText);
}

function DocumentPreview({ document }: { document: VehicleMaintenanceDocument }) {
  const mediaUrl = document.media?.media_url || "";
  const mediaName = getDocumentMediaName(document);

  if (mediaUrl && isImageDocument(document)) {
    return (
      <div className="flex min-w-0 flex-1 items-center">
        <Image
          src={mediaUrl}
          alt={mediaName}
          width={112}
          height={80}
          className="rounded-md object-cover"
          preview={{ mask: "Xem ảnh" }}
          styles={{
            root: { flexShrink: 0 },
            image: {
              border: "1px solid rgb(226 232 240)",
              objectFit: "cover",
            },
          }}
        />
      </div>
    );
  }

  if (mediaUrl && isPdfDocument(document)) {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3 text-blue-600 hover:underline"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500">
          <FileText className="size-5" />
        </span>
        <span className="truncate">{mediaName}</span>
      </a>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 text-slate-700">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500">
        <FileText className="size-5" />
      </span>
      <span className="truncate">{mediaName}</span>
    </div>
  );
}

export default function VehicleMaintenanceDetail({ maintenanceId }: { maintenanceId: number }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { hasActionAccess } = usePermissions();
  const { isDirty, setDirty } = useNavigationStore();
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const maintenance = useAppSelector((state) => state.vehicleMaintenances.entities[maintenanceId]);
  const histories = useAppSelector((state) => state.vehicleMaintenances.historiesById[maintenanceId] || EMPTY_HISTORIES);
  const { deleting, detailLoading, historyLoading, saving, workflowLoading } = useAppSelector((state) => state.vehicleMaintenances);
  const {
    nameOptions: vehicles,
    nameOptionsLoaded: vehicleOptionsLoaded,
    nameOptionsLoading: vehicleOptionsLoading,
  } = useAppSelector((state) => state.vehicles);

  const [formValues, setFormValues] = useState<MaintenanceFormValues | null>(null);
  const [formErrors, setFormErrors] = useState<MaintenanceFormErrors>({});
  const [currentDocuments, setCurrentDocuments] = useState<VehicleMaintenanceDocument[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isOcrDetailOpen, setIsOcrDetailOpen] = useState(false);
  const [workflowAction, setWorkflowAction] = useState<VehicleMaintenanceWorkflowAction | null>(null);
  const [workflowNote, setWorkflowNote] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFileName, setOcrFileName] = useState<string | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [totalAmountInput, setTotalAmountInput] = useState("");
  const isTotalAmountFocusedRef = useRef(false);
  const vtrackingDistanceRequestIdRef = useRef(0);

  const canUpdate = hasActionAccess(SIDEBAR.VEHICLE_MAINTENANCES, PERMISSIONS.VEHICLE_MAINTENANCES.UPDATE);
  const canDelete = hasActionAccess(SIDEBAR.VEHICLE_MAINTENANCES, PERMISSIONS.VEHICLE_MAINTENANCES.DELETE);
  const currentStatus = maintenance?.vehicle_maintenance_status || "draft";
  const workflowActions = maintenance?.workflow_available_actions || [];
  const canEditMaintenance = canUpdate && ["draft", "rejected"].includes(currentStatus);
  const disabled = !isEditing || saving || deleting;
  const workflowDialogText = workflowAction ? getWorkflowDialogText(workflowAction) : null;
  const vehicleSelectOptions = useMemo<VehicleOption[]>(() => {
    const selectedVehicleId = formValues?.vehicle_id;
    if (!selectedVehicleId || vehicles.some((vehicle) => vehicle.vehicle_id === selectedVehicleId)) {
      return vehicles;
    }

    const detailVehicle = maintenance?.vehicle;
    return [
      {
        vehicle_id: selectedVehicleId,
        vehicle_license_plate: detailVehicle?.vehicle_license_plate || `#${selectedVehicleId}`,
        vehicle_name: detailVehicle?.vehicle_name ?? null,
      },
      ...vehicles,
    ];
  }, [formValues?.vehicle_id, maintenance?.vehicle, vehicles]);

  useEffect(() => {
    setDirty(false);
    return () => setDirty(false);
  }, [maintenanceId, setDirty]);

  const refreshDetail = useCallback(async () => {
    if (!Number.isFinite(maintenanceId) || maintenanceId <= 0) return;
    try {
      await dispatch(fetchVehicleMaintenanceById(maintenanceId)).unwrap();
    } catch {
      toast.error("Không tải được chi tiết phiếu bảo trì");
    }
  }, [dispatch, maintenanceId]);

  const refreshHistory = useCallback(async () => {
    if (!Number.isFinite(maintenanceId) || maintenanceId <= 0) return;
    try {
      await dispatch(fetchVehicleMaintenanceHistoryThunk(maintenanceId)).unwrap();
    } catch {
      toast.error("Không tải được lịch sử xử lý phiếu");
    }
  }, [dispatch, maintenanceId]);

  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const ensureVehicleOptions = useCallback(async () => {
    if (vehicleOptionsLoaded || vehicleOptionsLoading) return;
    const result = await dispatch(fetchVehicleNameOptions({ limit: 1000 }));
    if (fetchVehicleNameOptions.rejected.match(result)) {
      toast.error("Không tải được danh sách xe");
    }
  }, [dispatch, vehicleOptionsLoaded, vehicleOptionsLoading]);

  useEffect(() => {
    if (!maintenance || isEditing) return;
    const nextFormValues = toFormValues(maintenance);
    setFormValues(nextFormValues);
    if (!isTotalAmountFocusedRef.current) {
      setTotalAmountInput(formatVietnameseCurrencyValue(nextFormValues.total_amount));
    }
    setCurrentDocuments(maintenance.documents || []);
  }, [isEditing, maintenance]);

  const updateFormField = useCallback(
    <K extends keyof MaintenanceFormValues>(field: K, value: MaintenanceFormValues[K]) => {
      setFormValues((prev) => (prev ? { ...prev, [field]: value } : prev));
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
      setDirty(true);
    },
    [setDirty]
  );

  const fetchDistanceFromVtracking = useCallback(
    async (vehicleId: number, vehicleOverride?: VehicleOption | null) => {
      const selectedVehicle = vehicleOverride ?? vehicleSelectOptions.find((item) => item.vehicle_id === vehicleId);
      if (!selectedVehicle) {
        toast.warning("Chưa tìm thấy phương tiện trong danh sách xe.");
        return;
      }

      const requestId = vtrackingDistanceRequestIdRef.current + 1;
      vtrackingDistanceRequestIdRef.current = requestId;
      setDistanceLoading(true);

      try {
        const response = await vtrackingApi.fetchVehicles();
        if (vtrackingDistanceRequestIdRef.current === requestId) {
          const matchedVehicle = findMatchingVtrackingVehicle(response.data?.vehicles || [], selectedVehicle);
          const distanceKm = getVtrackingDistanceKm(matchedVehicle);

          if (distanceKm === null) {
            toast.warning("Không có dữ liệu số km từ VTracking cho phương tiện này.");
          } else {
            setFormValues((prev) =>
              prev?.vehicle_id === vehicleId ? { ...prev, vehicle_distance_covered: distanceKm } : prev
            );
            setDirty(true);
            toast.success("Đã cập nhật số km từ VTracking.");
          }
        }
      } catch {
        if (vtrackingDistanceRequestIdRef.current === requestId) {
          toast.error("Không lấy được số km từ VTracking.");
        }
      } finally {
        if (vtrackingDistanceRequestIdRef.current === requestId) {
          setDistanceLoading(false);
        }
      }
    },
    [setDirty, vehicleSelectOptions]
  );

  const handleVehicleChange = useCallback(
    (value: string) => {
      const vehicleId = Number(value);
      const selectedVehicle = vehicleSelectOptions.find((item) => item.vehicle_id === vehicleId);
      setFormValues((prev) =>
        prev ? { ...prev, vehicle_id: vehicleId, vehicle_distance_covered: null } : prev
      );
      setFormErrors((prev) => ({ ...prev, vehicle_id: undefined }));
      setDirty(true);
      void fetchDistanceFromVtracking(vehicleId, selectedVehicle);
    },
    [fetchDistanceFromVtracking, setDirty, vehicleSelectOptions]
  );

  const handleRefreshDistance = useCallback(() => {
    if (!formValues?.vehicle_id) return;
    void fetchDistanceFromVtracking(formValues.vehicle_id);
  }, [fetchDistanceFromVtracking, formValues?.vehicle_id]);

  const handleTotalAmountChange = useCallback(
    (value: string) => {
      const normalized = normalizeVietnameseCurrencyInput(value);
      setTotalAmountInput(normalized);
      updateFormField("total_amount", parseVietnameseCurrencyInput(normalized));
    },
    [updateFormField]
  );

  const validateFormValues = () => {
    const errors: MaintenanceFormErrors = {};
    if (!formValues?.vehicle_id) errors.vehicle_id = "Vui lòng chọn phương tiện";
    if (!formValues?.dateRange?.[0] || !formValues?.dateRange?.[1]) {
      errors.dateRange = "Vui lòng chọn thời gian bảo trì";
    }
    if (!formValues?.vehicle_maintenance_description?.trim()) {
      errors.vehicle_maintenance_description = "Vui lòng nhập mô tả công việc sửa chữa";
    }
    return errors;
  };

  const replaceOcrText = useCallback(
    (text: string) => {
      setFormValues((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          vehicle_maintenance_ocr_text: text,
        };
      });
      setDirty(true);
    },
    [setDirty]
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
          toast.success("OCR đã đọc xong hóa đơn");
        } else {
          toast.warning("OCR không trả về nội dung để điền");
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

  const handleSelectedDocumentFiles = (files: File[]) => {
    if (!isEditing || files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...files]);
    setDirty(true);
  };

  const uploadPendingFiles = async () => {
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
        if (!mediaPayload.media_id) throw new Error("ERR_MEDIA::MISSING_MEDIA_ID");

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
    if (!formValues) return;
    const errors = validateFormValues();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error(Object.values(errors)[0] || "Dữ liệu chưa hợp lệ");
      return;
    }

    try {
      await dispatch(
        updateVehicleMaintenanceThunk({
          id: maintenanceId,
          data: buildPayload(formValues),
        })
      ).unwrap();
      await uploadPendingFiles();
      await refreshDetail();
      await refreshHistory();
      setPendingFiles([]);
      setFormErrors({});
      isTotalAmountFocusedRef.current = false;
      setTotalAmountInput(formatVietnameseCurrencyValue(formValues.total_amount));
      setDistanceLoading(false);
      setIsEditing(false);
      setDirty(false);
      toast.success("Đã lưu phiếu bảo trì");
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || "Lưu phiếu bảo trì thất bại";
      toast.error("Lưu phiếu bảo trì thất bại", { description: message });
    }
  };

  const handleDelete = async () => {
    try {
      await dispatch(deleteVehicleMaintenanceThunk(maintenanceId)).unwrap();
      setDirty(false);
      toast.success("Đã xóa phiếu bảo trì");
      router.push(SIDEBAR.VEHICLE_MAINTENANCES);
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || "Xóa phiếu bảo trì thất bại";
      toast.error("Xóa phiếu bảo trì thất bại", { description: message });
    }
  };

  const handleBackToList = () => {
    if (isDirty) {
      setIsLeaveDialogOpen(true);
      return;
    }
    router.push(SIDEBAR.VEHICLE_MAINTENANCES);
  };

  const confirmLeaveToList = () => {
    setDirty(false);
    setIsLeaveDialogOpen(false);
    router.push(SIDEBAR.VEHICLE_MAINTENANCES);
  };

  const openWorkflowDialog = (action: VehicleMaintenanceWorkflowAction) => {
    setWorkflowAction(action);
    setWorkflowNote("");
  };

  const closeWorkflowDialog = () => {
    if (workflowLoading) return;
    setWorkflowAction(null);
    setWorkflowNote("");
  };

  const handleWorkflowConfirm = async () => {
    if (!workflowAction || !workflowDialogText) return;
    const note = workflowNote.trim();
    if (workflowDialogText.requiresReason && !note) {
      toast.error("Vui lòng nhập lý do từ chối");
      return;
    }

    try {
      await dispatch(
        runVehicleMaintenanceWorkflowThunk({
          id: maintenanceId,
          action: workflowAction,
          note,
          reason: workflowDialogText.requiresReason ? note : undefined,
        })
      ).unwrap();
      await refreshDetail();
      await refreshHistory();
      setIsEditing(false);
      setDirty(false);
      closeWorkflowDialog();
      toast.success("Đã cập nhật trạng thái phiếu bảo trì");
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as Error)?.message ||
        "Cập nhật trạng thái phiếu thất bại";
      toast.error("Cập nhật trạng thái phiếu thất bại", { description: message });
    }
  };

  const handleDeleteDocument = async (document: VehicleMaintenanceDocument) => {
    try {
      await vehicleMaintenanceApi.deleteDocument(document.vehicle_maintenance_document_id);
      setCurrentDocuments((prev) =>
        prev.filter((item) => item.vehicle_maintenance_document_id !== document.vehicle_maintenance_document_id)
      );
      await refreshDetail();
      toast.success("Đã xóa tài liệu");
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message || (error as Error)?.message || "Xóa tài liệu thất bại";
      toast.error("Xóa tài liệu thất bại", { description: message });
    }
  };

  const handleEnableEdit = async () => {
    await ensureVehicleOptions();
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (maintenance) {
      setFormValues(toFormValues(maintenance));
      setCurrentDocuments(maintenance.documents || []);
    }
    setPendingFiles([]);
    setFormErrors({});
    isTotalAmountFocusedRef.current = false;
    setTotalAmountInput(formatVietnameseCurrencyValue(maintenance?.total_amount));
    vtrackingDistanceRequestIdRef.current += 1;
    setDistanceLoading(false);
    setIsEditing(false);
    setDirty(false);
  };

  if (detailLoading && !formValues) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!formValues || !maintenance) {
    return (
      <Card className="m-4 rounded-lg p-8 md:m-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <Wrench className="size-10 text-slate-300" />
          <p className="text-lg font-semibold text-slate-800">Không tìm thấy phiếu bảo trì</p>
          <Button variant="outline" onClick={() => router.push(SIDEBAR.VEHICLE_MAINTENANCES)}>
            <ArrowLeft className="size-4" />
            Quay lại
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="m-4 gap-0 overflow-hidden rounded-lg py-0 shadow-sm md:m-10">
        <CardHeader className="border-b bg-white px-6 py-6 md:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-row items-center gap-7">
              <Button size="iconCircle" variant="outline" onClick={handleBackToList}>
                <ArrowLeft className="size-4" />
              </Button>
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                  Chi tiết bảo trì/ bảo dưỡng:
                  <span className="text-blue-600 font-extrabold">{getVehicleLabel(maintenance, vehicles)}</span>
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                  <span>
                    Người tạo phiếu:{" "}
                    <b className="font-medium text-slate-700">{getCreatorDisplayName(maintenance)}</b>
                  </span>
                  {maintenance.reviewed_by ? (
                    <span>
                      Duyệt cuối: <b className="font-medium text-slate-700">{getReviewerDisplayName(maintenance)}</b>
                    </span>
                  ) : null}
                  {maintenance.reviewed_at ? (
                    <span>
                      Lúc:{" "}
                      <b className="font-medium text-slate-700">
                        {dayjs(maintenance.reviewed_at).format("DD/MM/YYYY HH:mm")}
                      </b>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {workflowActions.includes("submit") ? (
                <Button
                  variant="primary"
                  disabled={workflowLoading || isEditing}
                  onClick={() => openWorkflowDialog("submit")}
                >
                  <Send className="size-4" />
                  Gửi phiếu
                </Button>
              ) : null}
              {workflowActions.includes("dispatch_approve") ? (
                <Button
                  variant="primary"
                  disabled={workflowLoading || isEditing}
                  onClick={() => openWorkflowDialog("dispatch_approve")}
                >
                  <CheckCircle2 className="size-4" />
                  Chuyển phê duyệt
                </Button>
              ) : null}
              {workflowActions.includes("production_approve") ? (
                <Button
                  variant="primary"
                  disabled={workflowLoading || isEditing}
                  onClick={() => openWorkflowDialog("production_approve")}
                >
                  <CheckCircle2 className="size-4" />
                  Phê duyệt
                </Button>
              ) : null}
              {workflowActions.includes("dispatch_reject") ? (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  disabled={workflowLoading || isEditing}
                  onClick={() => openWorkflowDialog("dispatch_reject")}
                >
                  <XCircle className="size-4" />
                  Từ chối kiểm tra
                </Button>
              ) : null}
              {workflowActions.includes("production_reject") ? (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  disabled={workflowLoading || isEditing}
                  onClick={() => openWorkflowDialog("production_reject")}
                >
                  <XCircle className="size-4" />
                  Từ chối phê duyệt
                </Button>
              ) : null}
              {canEditMaintenance && !isEditing ? (
                <Popconfirm placement="bottomRight"
                  title="Cho phép chỉnh sửa phiếu?"
                  description="Sau khi xác nhận, các trường thông tin sẽ được mở khóa để chỉnh sửa."
                  okText="Chỉnh sửa"
                  cancelText="Hủy"
                  onConfirm={handleEnableEdit}
                >
                  <Button variant="outline">
                    <Pencil className="size-4 text-blue-600" />
                    Chỉnh sửa
                  </Button>
                </Popconfirm>
              ) : null}
              {canDelete ? (
                <Button variant="destructive" onClick={() => setIsDeleteOpen(true)} disabled={deleting}>
                  <Trash2 className="size-4" />
                  Xóa
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="bg-white px-8">
          <div className="grid grid-cols-1 xl:grid-cols-2">
            <div className="h-[520px] min-w-0 overflow-y-auto pr-2 xl:pr-6">
              <DetailSection icon={<ClipboardList className="size-5" />} title="Thông tin bảo trì">
                <div className={GRID_CLASS}>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Phương tiện</Label>
                    <Select
                      disabled={disabled}
                      value={formValues.vehicle_id ? String(formValues.vehicle_id) : undefined}
                      onValueChange={handleVehicleChange}
                    >
                      <SelectTrigger className={CONTROL_CLASS} aria-invalid={Boolean(formErrors.vehicle_id)}>
                        <SelectValue placeholder="Chọn xe">
                          {formValues.vehicle_id ? getVehicleLabelById(vehicleSelectOptions, formValues.vehicle_id) : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-92 overflow-y-auto">
                        {vehicleSelectOptions.map((vehicle) => (
                          <SelectItem key={vehicle.vehicle_id} value={String(vehicle.vehicle_id)}>
                            {vehicle.vehicle_license_plate}
                            {vehicle.vehicle_name ? ` | ${vehicle.vehicle_name}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError message={formErrors.vehicle_id} />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Loại phiếu</Label>
                    <Select
                      disabled={disabled}
                      value={formValues.vehicle_maintenance_type || "maintenance"}
                      onValueChange={(value) => updateFormField("vehicle_maintenance_type", value)}
                    >
                      <SelectTrigger className={CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAINTENANCE_TYPES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Mức độ nghiêm trọng</Label>
                    <Select
                      disabled={disabled}
                      value={String(formValues.vehicle_maintenance_rank || 1)}
                      onValueChange={(value) => updateFormField("vehicle_maintenance_rank", Number(value))}
                    >
                      <SelectTrigger className={CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RANK_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={String(item.value)}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Trạng thái</Label>
                    <Select
                      disabled
                      value={formValues.vehicle_maintenance_status || "draft"}
                      onValueChange={(value) => updateFormField("vehicle_maintenance_status", value)}
                    >
                      <SelectTrigger className={CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Số km đã chạy</Label>
                    <div className="relative">
                      <Input
                        disabled={!isEditing || saving || deleting}
                        readOnly
                        inputMode="decimal"
                        className={`${CONTROL_CLASS} ${isEditing ? "!pr-24 cursor-default bg-slate-50" : "!pr-12"}`}
                        value={formatVtrackingDistanceValue(formValues.vehicle_distance_covered)}
                      />
                      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                        <span className="border-r border-slate-200 pr-2 text-sm font-medium text-slate-500">Km</span>
                        {isEditing ? (
                          <Tooltip title="Cập nhật số km từ VTracking">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-sm text-slate-500 hover:text-blue-600"
                              disabled={distanceLoading || saving || deleting || !formValues.vehicle_id}
                              onClick={handleRefreshDistance}
                            >
                              <RefreshCw className={`size-4 ${distanceLoading ? "animate-spin" : ""}`} />
                            </Button>
                          </Tooltip>
                        ) : null}

                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Địa điểm sửa chữa</Label>
                    <Input
                      disabled={disabled}
                      className={CONTROL_CLASS}
                      value={formValues.vehicle_maintenance_location || ""}
                      onChange={(event) => updateFormField("vehicle_maintenance_location", event.target.value)}
                    />
                  </div>

                  <DateField
                    disabled={disabled}
                    label="Từ ngày"
                    placeholder="Chọn ngày bắt đầu"
                    error={formErrors.dateRange}
                    value={formValues.dateRange?.[0]}
                    onChange={(value) => {
                      if (!value) return;
                      const current = formValues.dateRange ?? [value, value];
                      updateFormField("dateRange", [value, current[1] ?? value]);
                    }}
                  />

                  <DateField
                    disabled={disabled}
                    label="Đến ngày"
                    placeholder="Chọn ngày kết thúc"
                    value={formValues.dateRange?.[1]}
                    onChange={(value) => {
                      if (!value) return;
                      const current = formValues.dateRange ?? [value, value];
                      updateFormField("dateRange", [current[0] ?? value, value]);
                    }}
                  />
                </div>
              </DetailSection>

              <DetailSection icon={<ReceiptText className="size-5" />} title="Hóa đơn và thanh toán">
                <div className={GRID_CLASS}>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Đơn vị sửa chữa</Label>
                    <Input
                      disabled={disabled}
                      className={CONTROL_CLASS}
                      value={formValues.service_provider_name || ""}
                      onChange={(event) => updateFormField("service_provider_name", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Địa chỉ đơn vị</Label>
                    <Input
                      disabled={disabled}
                      className={CONTROL_CLASS}
                      value={formValues.service_provider_address || ""}
                      onChange={(event) => updateFormField("service_provider_address", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Số hóa đơn</Label>
                    <Input
                      disabled={disabled}
                      className={CONTROL_CLASS}
                      value={formValues.invoice_no || ""}
                      onChange={(event) => updateFormField("invoice_no", event.target.value)}
                    />
                  </div>
                  <DateField
                    disabled={disabled}
                    label="Ngày hóa đơn"
                    placeholder="Chọn ngày hóa đơn"
                    value={formValues.invoice_date}
                    onChange={(value) => updateFormField("invoice_date", value)}
                  />
                  <div className="space-y-2">
                    <Label className="text-slate-700">Tổng tiền</Label>
                    <Input
                      disabled={disabled}
                      type="text"
                      inputMode="decimal"
                      className={CONTROL_CLASS}
                      placeholder="VD: 10.000.500,50"
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
                    <Select disabled={disabled} value={formValues.currency || "VND"} onValueChange={(value) => updateFormField("currency", value)}>
                      <SelectTrigger className={CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VND">VND</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700">Trạng thái thanh toán</Label>
                    <Select
                      disabled={disabled}
                      value={formValues.payment_status || "unpaid"}
                      onValueChange={(value) => updateFormField("payment_status", value)}
                    >
                      <SelectTrigger className={CONTROL_CLASS}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_STATUS_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DateField
                    disabled={disabled}
                    label="Hạn thanh toán"
                    placeholder="Chọn hạn thanh toán"
                    value={formValues.deadline_pay}
                    onChange={(value) => updateFormField("deadline_pay", value)}
                  />
                </div>
              </DetailSection>

            </div>
            <div className="h-[520px] min-w-0 overflow-y-auto xl:border-l xl:border-slate-200/70 xl:pl-6">
              <DetailSection icon={<Wrench className="size-5" />} title="Mô tả công việc">
                <div className="space-y-2">
                  <Textarea
                    disabled={disabled}
                    rows={2}
                    className="bg-white disabled:bg-slate-50"
                    value={formValues.vehicle_maintenance_description || ""}
                    onChange={(event) => updateFormField("vehicle_maintenance_description", event.target.value)}
                  />
                  <FieldError message={formErrors.vehicle_maintenance_description} />
                </div>
              </DetailSection>

              <DetailSection icon={<Camera className="size-5" />} title="Tài liệu và OCR">
                <Button
                  type="button"
                  variant="outline"
                  className="mb-4 h-auto w-full justify-between gap-3 bg-white px-4 py-3 text-left"
                  onClick={() => setIsOcrDetailOpen(true)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-700">Nội dung OCR / bản dịch hóa đơn</span>
                    <span className="mt-1 block truncate text-xs font-normal text-slate-500">
                      {formValues.vehicle_maintenance_ocr_text?.trim()
                        ? "Đã có nội dung OCR, bấm để xem chi tiết"
                        : "Chưa có nội dung OCR"}
                    </span>
                  </span>
                  <ScanText className="size-4 shrink-0 text-slate-500" />
                </Button>

                <div className="rounded-md border border-dashed border-slate-300 p-4">
                  <Input
                    ref={documentInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    disabled={!isEditing}
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
                      disabled={!isEditing}
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
                      disabled={!isEditing || pendingFiles.length === 0 || ocrLoading}
                      onClick={() => runOcrForFiles(pendingFiles)}
                    >
                      {ocrLoading ? <RefreshCw className="size-4 animate-spin" /> : <ScanText className="size-4" />}
                      {ocrLoading ? "Đang đọc hóa đơn" : "Đọc thông tin hóa đơn"}
                    </Button>
                    {/* {ocrLoading && ocrFileName ? (
                      <span className="text-sm text-slate-500">Đang xử lý: {ocrFileName}</span>
                    ) : null} */}
                    {pendingFiles.length > 0 ? (
                      <div className="space-y-2">
                        {pendingFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-2 py-1 text-xs"
                          >
                            <span className="truncate text-slate-700">{file.name}</span>
                            <Button type="button" variant="ghost" size="sm" disabled={!isEditing}
                              onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== index))}
                            >
                              <X color="red" className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* {pendingFiles.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {pendingFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm"
                        >
                          <span className="truncate text-slate-700">{file.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={!isEditing}
                            onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== index))}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null} */}

                  {currentDocuments.length > 0 ? (
                    <div className="mt-2 flex gap-4 overflow-x-auto py-3">
                      {currentDocuments.map((document) => (
                        <div
                          key={document.vehicle_maintenance_document_id}
                          className="relative flex shrink-0 flex-col gap-2"
                        >
                          {isEditing ? (
                            <span className="absolute right-[-10px] top-[-10px] z-10">
                              <Popconfirm placement="bottom"
                                title="Xóa tài liệu này?"
                                okText="Xóa"
                                cancelText="Hủy"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => handleDeleteDocument(document)}
                              >
                                <Tooltip title="Xóa tài liệu">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="size-6 rounded-full bg-white text-red-500 shadow-sm hover:bg-red-400 hover:text-white"
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                </Tooltip>
                              </Popconfirm>
                            </span>
                          ) : null}
                          <DocumentPreview document={document} />
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="rounded-md">
                              {document.ocr_status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </DetailSection>

            </div>
          </div>
          <div className="py-6 grid grid-cols-1 gap-6 xl:grid-cols-2 border-t border-slate-200">
            <div className="min-w-0 rounded-lg border border-slate-200 p-4">
              <DetailSection icon={<History className="size-5" />} title="Lịch sử xử lý">
                {historyLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                    <RefreshCw className="size-4 animate-spin" />
                    Đang tải lịch sử...
                  </div>
                ) : histories.length > 0 ? (
                  <div className="max-h-[520px] overflow-y-auto pr-2">
                    <div className="space-y-0">
                      {histories.map((item, index) => {
                        const actorRole = getHistoryActorRole(item);
                        const hasFromStatus = Boolean(item.from_status);
                        return (
                          <div
                            key={item.vehicle_maintenance_history_id}
                            className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 pb-3 last:pb-0"
                          >
                            <div className="flex flex-col items-center pt-2">
                              <span className="size-2.5 rounded-full border-2 border-white bg-blue-600 shadow ring-2 ring-blue-100" />
                              {index < histories.length - 1 ? (
                                <span className="mt-1 h-full min-h-8 w-px bg-slate-200" />
                              ) : null}
                            </div>
                            <div className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <p className="min-w-0 font-medium text-slate-800">
                                    {getWorkflowActionLabel(item.action)}
                                  </p>
                                  <div className="flex items-center gap-1.5 text-xs">
                                    {hasFromStatus ? (
                                      <>
                                        <Badge
                                          variant="outline"
                                          className={`rounded-md px-2 py-0.5 font-medium ${getHistoryStatusBadgeClass(item.from_status)}`}
                                        >
                                          {getStatusLabel(item.from_status)}
                                        </Badge>
                                        <span className="text-slate-400">{"->"}</span>
                                      </>
                                    ) : null}
                                    <Badge
                                      variant="outline"
                                      className={`rounded-md px-2 py-0.5 font-medium ${getHistoryStatusBadgeClass(item.to_status)}`}
                                    >
                                      {getStatusLabel(item.to_status)}
                                    </Badge>
                                  </div>
                                </div>
                                <span className="shrink-0 text-xs font-medium text-slate-500">
                                  {dayjs(item.created_at).format("DD/MM/YYYY HH:mm")}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">{getHistoryActorDisplayName(item)}</span>
                                {actorRole ? (
                                  <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600">
                                    {actorRole}
                                  </span>
                                ) : null}
                                {item.note ? (
                                  <span>
                                    <span className="font-medium text-slate-500">Ghi chú: </span>
                                    <span className="break-words">{item.note}</span>
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-sm text-slate-500">Chưa có lịch sử xử lý.</p>
                )}
              </DetailSection>
            </div>
            <div className="min-w-0">
              <VehicleMaintenanceDiscussion maintenanceId={maintenanceId} />
            </div>
          </div>
        </CardContent>

        {isEditing ? (
          <CardFooter className="justify-end gap-3 border-t bg-white px-6 py-5 md:px-8">
            <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
              Hủy chỉnh sửa
            </Button>
            <Button onClick={handleSave} disabled={saving || ocrLoading}>
              <Save className="size-4" />
              {saving ? "Đang lưu..." : ocrLoading ? "Đang OCR..." : "Lưu"}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Dialog open={isOcrDetailOpen} onOpenChange={setIsOcrDetailOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nội dung OCR / bản dịch hóa đơn</DialogTitle>
            <DialogDescription>
              Xem nội dung OCR đã đọc từ hóa đơn. Khi phiếu đang ở chế độ chỉnh sửa, nội dung này có thể được chỉnh lại trước khi lưu.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            disabled={disabled}
            rows={14}
            className="max-h-[60vh] min-h-[360px] overflow-y-auto bg-white disabled:bg-slate-50"
            placeholder="Chưa có nội dung OCR."
            value={formValues.vehicle_maintenance_ocr_text || ""}
            onChange={(event) => updateFormField("vehicle_maintenance_ocr_text", event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOcrDetailOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(workflowAction)} onOpenChange={(open) => (!open ? closeWorkflowDialog() : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{workflowDialogText?.title}</DialogTitle>
            <DialogDescription>{workflowDialogText?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-slate-700">
              {workflowDialogText?.requiresReason ? "Lý do từ chối" : "Ghi chú"}
            </Label>
            <Textarea
              rows={4}
              placeholder={
                workflowDialogText?.requiresReason
                  ? "Nhập lý do để người tạo phiếu biết cần bổ sung gì"
                  : "Ghi chú thêm nếu cần"
              }
              value={workflowNote}
              onChange={(event) => setWorkflowNote(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={workflowLoading} onClick={closeWorkflowDialog}>
              Hủy
            </Button>
            <Button
              variant={workflowDialogText?.requiresReason ? "destructive" : "primary"}
              disabled={workflowLoading}
              onClick={handleWorkflowConfirm}
            >
              {workflowLoading ? "Đang xử lý..." : workflowDialogText?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa phiếu bảo trì này?</AlertDialogTitle>
            <AlertDialogDescription>
              Phiếu bảo trì và tài liệu liên quan sẽ được xóa mềm. File MinIO không bị xóa vật lý ngay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
            >
              {deleting ? "Đang xóa..." : "Xóa phiếu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn chưa lưu thay đổi</AlertDialogTitle>
            <AlertDialogDescription>
              Phiếu bảo trì đang có thay đổi chưa được lưu. Nếu quay lại danh sách, các thay đổi này sẽ bị mất.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setIsLeaveDialogOpen(false);
              }}
            >
              Ở lại
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeaveToList}>
              Rời khỏi trang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
