"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import {
  createEmptyAssignmentDraft,
  createEmptyMixerAssignmentDraft,
  workAssignmentApi,
  workAttendanceApi,
  workMixSlotApi,
  workTaskApi,
  WORK_PUMP_ROLES,
} from "@/services/work-arrangement.service";
import type {
  WorkAssignmentDraft,
  WorkMixerAssignmentDraft,
  WorkMixSlotItem,
  WorkPersonnel,
  WorkPumpRoleKey,
  WorkVehicle,
} from "@/types/work-arrangement";
import { useSocket } from "@/context/socket-context";
import { useSocketEventListener } from "@/hooks/useSocketEventListener";
import systemApi from "@/services/system.service";
import { exportChupLichExcel } from "@/utils/exportChupLich";
import { DatePicker, message, Modal, Select as AntSelect, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileSpreadsheet,
  Loader2,
  Plus,
  Save,
  Search,
  Star,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Chip,
  compareVehicleByName,
  filterSelectOptionByLabel,
  getVehicleLabel,
  normalizeSearchText,
} from "./shared";

const formatLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const NONE_VALUE = "__none__";

const removeUserFromPumpAssignments = (
  assignments: WorkAssignmentDraft["pump_assignments"],
  userId: number
) =>
  assignments.map((assignment) => ({
    ...assignment,
    roles: {
      driver: assignment.roles.driver.filter((id) => id !== userId),
      operator: assignment.roles.operator.filter((id) => id !== userId),
      hose: assignment.roles.hose.filter((id) => id !== userId),
    },
  }));

const pumpHasUser = (draft: WorkAssignmentDraft, userId: number) =>
  draft.pump_assignments.some((assignment) =>
    Object.values(assignment.roles).some((ids) => ids.includes(userId))
  );

const uniquePositiveIds = (ids: number[]) =>
  Array.from(new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)));

const getPersonLabel = (person?: WorkPersonnel) => {
  if (!person) return "";
  return person.user_short_name || person.user_full_name || `#${person.user_id}`;
};

const getDefaultLotCaptureName = () => `Lốt ${dayjs().format("H")}H`;

const normalizeLotVehicleName = (raw: unknown) => {
  const upper = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const match = upper.match(/^X0*(\d+)$/);
  return match ? `X${match[1]}` : upper;
};

const buildLotSyncMap = (items: WorkMixSlotItem[]) => {
  const maToStt: Record<string, number> = {};
  const skipped: { order_number: number; reason: string; raw: unknown }[] = [];

  items.forEach((item, index) => {
    const maX = normalizeLotVehicleName(item.vehicle_name);
    if (!/^X\d+$/.test(maX)) {
      skipped.push({
        order_number: item.order_number,
        reason: "invalid_vehicle_name",
        raw: item.vehicle_name,
      });
      return;
    }
    if (maX in maToStt) {
      skipped.push({ order_number: item.order_number, reason: "duplicate", raw: maX });
      return;
    }
    maToStt[maX] = index + 1;
  });

  return { maToStt, skipped };
};

const normalizeLotDisplayName = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const withoutTechnicalPrefix = trimmed.replace(/^tanker_lot_sync\s*:?\s*/i, "").trim();
  const displayName = (withoutTechnicalPrefix || trimmed).split(" - ")[0].trim();
  const hourLabel = displayName.match(/(?:^|\D)([01]?\d|2[0-3])\s*H(?:\D|$)/i);
  if (hourLabel) return `${Number(hourLabel[1])}H`;

  const timeLabel =
    displayName.match(/(?:^|[T\s])([01]?\d|2[0-3]):[0-5]\d/) ||
    displayName.match(/^([01]?\d|2[0-3]):[0-5]\d/);
  if (timeLabel) return `${Number(timeLabel[1])}H`;

  const parsed = dayjs(displayName);
  return parsed.isValid() ? `${parsed.hour()}H` : displayName;
};

const getLotDisplayName = (response: {
  data?: {
    multi_name?: string;
    multi_description?: string;
    multi_data?: { snapshot_note?: string } | null;
  };
}) => {
  return (
    normalizeLotDisplayName(response.data?.multi_data?.snapshot_note) ||
    normalizeLotDisplayName(response.data?.multi_description) ||
    normalizeLotDisplayName(response.data?.multi_name)
  );
};

export default function WorkAssignmentSelectManager({
  active = true,
  todayOnly = false,
  selectedDate: controlledSelectedDate,
  onSelectedDateChange,
  hideDateControls = false,
  onDirtyChange,
  onRegisterChup,
  onChupLoadingChange,
  onRegisterLotCapture,
  onLotCaptureLoadingChange,
  children,
}: {
  active?: boolean;
  todayOnly?: boolean;
  selectedDate?: Dayjs;
  onSelectedDateChange?: (date: Dayjs) => void;
  hideDateControls?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterChup?: (fn: (() => void) | null) => void;
  onChupLoadingChange?: (loading: boolean) => void;
  onRegisterLotCapture?: (fn: (() => void) | null) => void;
  onLotCaptureLoadingChange?: (loading: boolean) => void;
  /** Các khối hiển thị bên dưới bảng Xe bơm (cột phải): Công việc, Chấm công, Lốt trộn... */
  children?: ReactNode;
}) {
  const t = useTranslations("WorkAssignmentPage");
  const { isConnected } = useSocket();
  const { hasActionAccess } = usePermissions();
  const canUpdate = hasActionAccess(
    SIDEBAR.WORK_ARRANGEMENTS,
    PERMISSIONS.WORK_ARRANGEMENTS.UPDATE
  );
  const canSyncLots = hasActionAccess(SIDEBAR.DASHBOARD, PERMISSIONS.DASHBOARD.SYNC_SLOTS);

  const [internalSelectedDate, setInternalSelectedDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState(false);
  const [savingPump, setSavingPump] = useState(false);
  const [savingMixer, setSavingMixer] = useState(false);
  const [pumpDirty, setPumpDirty] = useState(false);
  const [mixerDirty, setMixerDirty] = useState(false);
  const [selectedPumpVehicleId, setSelectedPumpVehicleId] = useState<string>(NONE_VALUE);

  const [personnel, setPersonnel] = useState<WorkPersonnel[]>([]);
  const [halfDayUserIds, setHalfDayUserIds] = useState<number[]>([]);
  const [pumpVehicles, setPumpVehicles] = useState<WorkVehicle[]>([]);
  const [mixerVehicles, setMixerVehicles] = useState<WorkVehicle[]>([]);
  const [pumpDraft, setPumpDraft] = useState<WorkAssignmentDraft>(() =>
    createEmptyAssignmentDraft(dayjs().format("YYYY-MM-DD"))
  );
  const [mixerDraft, setMixerDraft] = useState<WorkMixerAssignmentDraft>(() =>
    createEmptyMixerAssignmentDraft(dayjs().format("YYYY-MM-DD"))
  );
  // Số lốt theo xe (thứ tự trong hàng đợi lốt trộn hôm nay); 1 xe có thể giữ nhiều lốt.
  const [lotNumbersByVehicle, setLotNumbersByVehicle] = useState<Map<number, number[]>>(new Map());
  const [latestLotName, setLatestLotName] = useState("");
  const [lotCaptureOpen, setLotCaptureOpen] = useState(false);
  const [lotCaptureName, setLotCaptureName] = useState(getDefaultLotCaptureName);
  const [lotDutyUserId, setLotDutyUserId] = useState<string>(NONE_VALUE);
  const [lotCaptureItems, setLotCaptureItems] = useState<WorkMixSlotItem[]>([]);
  const [lotCaptureLoading, setLotCaptureLoading] = useState(false);
  const [lotCaptureSaving, setLotCaptureSaving] = useState(false);
  const onDirtyChangeRef = useRef(onDirtyChange);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  const pumpDraftRef = useRef(pumpDraft);
  const mixerDraftRef = useRef(mixerDraft);
  useEffect(() => {
    pumpDraftRef.current = pumpDraft;
  }, [pumpDraft]);
  useEffect(() => {
    mixerDraftRef.current = mixerDraft;
  }, [mixerDraft]);

  const isDateControlled = controlledSelectedDate != null;
  const selectedDate = controlledSelectedDate || internalSelectedDate;
  const setSelectedDate = useCallback(
    (nextDate: Dayjs) => {
      if (isDateControlled) onSelectedDateChange?.(nextDate);
      else setInternalSelectedDate(nextDate);
    },
    [isDateControlled, onSelectedDateChange]
  );

  const workDate = selectedDate.format("YYYY-MM-DD");
  const isToday = selectedDate.isSame(dayjs(), "day");
  const dirty = pumpDirty || mixerDirty;
  const pumpPrefilledTitle = pumpDraft.prefilled_from_date
    ? t("prefilledFromDate", { date: dayjs(pumpDraft.prefilled_from_date).format("DD/MM/YYYY") })
    : "";
  const pumpPrefilledTab = pumpDraft.prefilled_from_date
    ? t("prefilledTab", { date: dayjs(pumpDraft.prefilled_from_date).format("DD/MM") })
    : "";
  const mixerPrefilledTitle = mixerDraft.prefilled_from_date
    ? t("prefilledFromDate", { date: dayjs(mixerDraft.prefilled_from_date).format("DD/MM/YYYY") })
    : "";
  const mixerPrefilledTab = mixerDraft.prefilled_from_date
    ? t("prefilledTab", { date: dayjs(mixerDraft.prefilled_from_date).format("DD/MM") })
    : "";
  const halfDaySet = useMemo(() => new Set(halfDayUserIds), [halfDayUserIds]);

  const personnelById = useMemo(() => new Map(personnel.map((p) => [p.user_id, p])), [personnel]);
  const pumpVehicleById = useMemo(
    () => new Map(pumpVehicles.map((vehicle) => [vehicle.vehicle_id, vehicle])),
    [pumpVehicles]
  );
  const mixerDriverByVehicle = useMemo(() => {
    const map = new Map<number, number>();
    for (const assignment of mixerDraft.mixer_assignments) {
      if (assignment.user_id != null) map.set(assignment.vehicle_id, assignment.user_id);
    }
    return map;
  }, [mixerDraft.mixer_assignments]);

  // Xe bồn xếp theo tên tự nhiên X1 → cuối (X1, X2, ... X10), không theo thứ tự backend.
  const sortedMixerVehicles = useMemo(
    () => [...mixerVehicles].sort(compareVehicleByName),
    [mixerVehicles]
  );

  const assignedUserIds = useMemo(() => {
    const set = new Set<number>();
    for (const assignment of pumpDraft.pump_assignments) {
      for (const id of Object.values(assignment.roles).flat()) set.add(id);
    }
    for (const assignment of mixerDraft.mixer_assignments) {
      if (assignment.user_id != null) set.add(assignment.user_id);
    }
    return set;
  }, [pumpDraft.pump_assignments, mixerDraft.mixer_assignments]);

  const assignedPumpVehicleIds = useMemo(
    () => new Set(pumpDraft.pump_assignments.map((assignment) => assignment.vehicle_id)),
    [pumpDraft.pump_assignments]
  );

  const availablePumpVehicles = useMemo(
    () => pumpVehicles.filter((vehicle) => !assignedPumpVehicleIds.has(vehicle.vehicle_id)),
    [assignedPumpVehicleIds, pumpVehicles]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrap = await workAssignmentApi.getBootstrap(workDate);
      setPersonnel(bootstrap.personnel);
      setHalfDayUserIds(bootstrap.half_day_user_ids);
      setPumpVehicles(bootstrap.pump.vehicles);
      setMixerVehicles(bootstrap.mixer.vehicles);
      setPumpDraft(bootstrap.pump.draft);
      setMixerDraft(bootstrap.mixer.draft);
      setSelectedPumpVehicleId(NONE_VALUE);
      setPumpDirty(false);
      setMixerDirty(false);
      onDirtyChangeRef.current?.(false);
    } catch (error) {
      setHalfDayUserIds([]);
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("loadFailed")}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [t, workDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cột Lốt = snapshot "Đồng bộ lốt xe" mới nhất trong ngày (chưa sync → trống).
  const loadLots = useCallback(async () => {
    try {
      const today = formatLocalDate(new Date());
      const res = await systemApi.getLatestTankerLotSync(today);
      const items = res.data?.multi_data?.items ?? [];
      const map = new Map<number, number[]>();
      items.forEach((item) => {
        const positions = map.get(item.vehicle_id) || [];
        positions.push(item.position);
        map.set(item.vehicle_id, positions);
      });
      setLotNumbersByVehicle(map);
      setLatestLotName(items.length > 0 ? getLotDisplayName(res) : "");
    } catch (error) {
      console.error("[WorkAssignmentSelectManager] load lots error:", error);
      setLotNumbersByVehicle(new Map());
      setLatestLotName("");
    }
  }, []);

  // Tải khi mở và mỗi lần quay lại trang (lốt đổi theo hàng đợi) — giữ hành vi của khối Lốt trộn cũ.
  useEffect(() => {
    if (!active) return;
    if (!isToday) {
      setLotNumbersByVehicle(new Map());
      setLatestLotName("");
      return;
    }
    void loadLots();
  }, [active, isToday, loadLots]);

  // Realtime: ai đó Đồng bộ / Apply trực sản xuất → snapshot đổi → tải lại cột Lốt.
  useSocketEventListener(
    "lot_sync:updated",
    () => {
      if (!isToday) return;
      void loadLots();
    },
    "notifications",
    active && isConnected && isToday
  );

  const loadLotCaptureItems = useCallback(async () => {
    setLotCaptureLoading(true);
    try {
      const items = await workMixSlotApi.getList();
      setLotCaptureItems(items);
      if (items.length === 0) message.warning(t("lotCaptureEmpty"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("lotCaptureLoadFailed")}: ${msg}`);
      setLotCaptureItems([]);
    } finally {
      setLotCaptureLoading(false);
    }
  }, [t]);

  const openLotCaptureDialog = useCallback(() => {
    if (!canSyncLots) {
      message.warning(t("lotCaptureNoPermission"));
      return;
    }
    if (!isToday) return;
    setLotCaptureName(getDefaultLotCaptureName());
    setLotDutyUserId(NONE_VALUE);
    setLotCaptureOpen(true);
    void loadLotCaptureItems();
  }, [canSyncLots, isToday, loadLotCaptureItems, t]);

  const moveLotCaptureItem = useCallback((index: number, direction: -1 | 1) => {
    setLotCaptureItems((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }, []);

  const handleCaptureLots = useCallback(async () => {
    const lotName = lotCaptureName.trim() || getDefaultLotCaptureName();
    const dutyUserId = lotDutyUserId === NONE_VALUE ? 0 : Number(lotDutyUserId);
    const dutyPerson = dutyUserId > 0 ? personnelById.get(dutyUserId) : undefined;
    const dutyPersonName = getPersonLabel(dutyPerson);
    const snapshotNote = dutyPersonName
      ? `${lotName} - ${t("lotDutyPerson")}: ${dutyPersonName}`
      : lotName;
    const { maToStt, skipped } = buildLotSyncMap(lotCaptureItems);
    const lotCount = Object.keys(maToStt).length;

    if (skipped.length > 0) console.warn("[handleCaptureLots] skipped:", skipped);
    if (lotCount === 0) {
      message.warning(t("lotCaptureEmpty"));
      return;
    }

    setLotCaptureSaving(true);

    const pushToSheet = async () => {
      const res = await fetch("/api/google-sheets/bo-tri-cv/sync-lot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maToStt, lotName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sync failed");
      if (data.unmatchedMaX?.length > 0) {
        console.warn("[handleCaptureLots] mã X không có trong sheet cột H:", data.unmatchedMaX);
      }
      return data;
    };

    try {
      const [sheetResult, snapshotResult] = await Promise.allSettled([
        pushToSheet(),
        systemApi.captureTankerLotSync({
          lot_name: lotName,
          duty_user_id: dutyUserId || undefined,
          duty_user_name: dutyPersonName || undefined,
          snapshot_note: snapshotNote,
          multi_description: snapshotNote,
        }),
      ]);

      if (sheetResult.status === "fulfilled") {
        const data = sheetResult.value;
        message.success(t("lotSyncSuccess", { count: data.updated ?? lotCount }));
      } else {
        console.error("[handleCaptureLots] sheet error:", sheetResult.reason);
        message.error(t("lotSyncFailed"));
      }

      if (snapshotResult.status === "fulfilled") {
        message.success(t("lotCaptureSuccess", { name: lotName }));
        await loadLots();
      } else {
        console.error("[handleCaptureLots] snapshot error:", snapshotResult.reason);
        message.error(t("lotCaptureFailed"));
      }

      if (sheetResult.status === "fulfilled" || snapshotResult.status === "fulfilled") {
        setLotCaptureOpen(false);
      }
    } finally {
      setLotCaptureSaving(false);
    }
  }, [loadLots, lotCaptureItems, lotCaptureName, lotDutyUserId, personnelById, t]);

  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const resetToToday = useCallback(() => {
    setInternalSelectedDate((prev) => (prev.isSame(dayjs(), "day") ? prev : dayjs()));
  }, []);
  useEffect(() => {
    if (active && !dirtyRef.current && !isDateControlled) resetToToday();
  }, [active, isDateControlled, resetToToday]);
  useEffect(() => {
    if (todayOnly && !isDateControlled) resetToToday();
  }, [isDateControlled, resetToToday, todayOnly]);
  const addPumpVehicle = useCallback(() => {
    const vehicleId = Number(selectedPumpVehicleId);
    if (!vehicleId || assignedPumpVehicleIds.has(vehicleId)) return;

    setPumpDraft((current) => ({
      ...current,
      pump_assignments: [
        ...current.pump_assignments,
        {
          assignment_id: `local:${vehicleId}:${Date.now()}`,
          vehicle_id: vehicleId,
          roles: { driver: [], operator: [], hose: [] },
        },
      ],
    }));
    setSelectedPumpVehicleId(NONE_VALUE);
    setPumpDirty(true);
  }, [assignedPumpVehicleIds, selectedPumpVehicleId]);

  const removePumpVehicle = useCallback((assignmentId: string) => {
    setPumpDraft((current) => ({
      ...current,
      pump_assignments: current.pump_assignments.filter(
        (assignment) => assignment.assignment_id !== assignmentId
      ),
    }));
    setPumpDirty(true);
  }, []);

  const setPumpRoleUsers = useCallback(
    (assignmentId: string, role: WorkPumpRoleKey, nextIdsRaw: number[]) => {
      const currentPump = pumpDraftRef.current;
      const currentMixer = mixerDraftRef.current;
      const target = currentPump.pump_assignments.find(
        (assignment) => assignment.assignment_id === assignmentId
      );
      if (!target) return;

      const currentIds = target.roles[role] || [];
      const nextIds = uniquePositiveIds(nextIdsRaw);
      const addedIds = nextIds.filter((id) => !currentIds.includes(id));
      const addedSet = new Set(addedIds);

      let nextAssignments = currentPump.pump_assignments;
      for (const userId of addedIds) {
        nextAssignments = removeUserFromPumpAssignments(nextAssignments, userId);
      }
      nextAssignments = nextAssignments.map((assignment) =>
        assignment.assignment_id === assignmentId
          ? {
              ...assignment,
              roles: {
                ...assignment.roles,
                [role]: nextIds,
              },
            }
          : assignment
      );
      setPumpDraft({ ...currentPump, pump_assignments: nextAssignments });
      setPumpDirty(true);

      if (
        addedIds.length > 0 &&
        currentMixer.mixer_assignments.some(
          (assignment) => assignment.user_id != null && addedSet.has(assignment.user_id)
        )
      ) {
        setMixerDraft({
          ...currentMixer,
          mixer_assignments: currentMixer.mixer_assignments.filter(
            (assignment) => assignment.user_id == null || !addedSet.has(assignment.user_id)
          ),
        });
        setMixerDirty(true);
      }
    },
    []
  );

  const setMixerDriver = useCallback((vehicleId: number, userId: number | null) => {
    const currentMixer = mixerDraftRef.current;
    const currentDriver = currentMixer.mixer_assignments.find(
      (assignment) => assignment.vehicle_id === vehicleId
    )?.user_id;

    if (currentDriver === userId) return;

    if (userId == null) {
      setMixerDraft({
        ...currentMixer,
        mixer_assignments: currentMixer.mixer_assignments.filter(
          (assignment) => assignment.vehicle_id !== vehicleId
        ),
      });
      setMixerDirty(true);
      return;
    }

    const currentPump = pumpDraftRef.current;
    if (pumpHasUser(currentPump, userId)) {
      setPumpDraft({
        ...currentPump,
        pump_assignments: removeUserFromPumpAssignments(currentPump.pump_assignments, userId),
      });
      setPumpDirty(true);
    }

    setMixerDraft({
      ...currentMixer,
      mixer_assignments: [
        ...currentMixer.mixer_assignments.filter(
          (assignment) => assignment.vehicle_id !== vehicleId && assignment.user_id !== userId
        ),
        { assignment_id: `mixer:${vehicleId}`, vehicle_id: vehicleId, user_id: userId },
      ],
    });
    setMixerDirty(true);
  }, []);

  const handleSavePump = useCallback(async () => {
    setSavingPump(true);
    try {
      const saved = await workAssignmentApi.savePump(pumpDraft, personnel);
      setPumpDraft(saved);
      setPumpDirty(false);
      message.success(t("saveSuccess"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("saveFailed")}: ${msg}`);
    } finally {
      setSavingPump(false);
    }
  }, [personnel, pumpDraft, t]);

  const handleSaveMixer = useCallback(async () => {
    setSavingMixer(true);
    try {
      const saved = await workAssignmentApi.saveMixer(mixerDraft, personnel);
      setMixerDraft(saved);
      setMixerDirty(false);
      message.success(t("saveSuccess"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("saveFailed")}: ${msg}`);
    } finally {
      setSavingMixer(false);
    }
  }, [mixerDraft, personnel, t]);

  const [chupLoading, setChupLoading] = useState(false);
  const handleChupLich = useCallback(async () => {
    if (pumpDirty || mixerDirty) {
      message.warning(t("chupDirtyWarning"));
      return;
    }
    setChupLoading(true);
    try {
      const [taskBootstrap, lotList, offBootstrap] = await Promise.all([
        workTaskApi.getBootstrap(workDate),
        workMixSlotApi.getList(),
        workAttendanceApi.getBootstrap(workDate),
      ]);

      const hasPump = pumpDraft.pump_assignments.length > 0;
      const hasMixer = mixerDraft.mixer_assignments.some((item) => item.user_id != null);
      const hasTask = taskBootstrap.draft.task_assignments.some((task) => task.user_ids.length > 0);
      const emptyParts: string[] = [];
      if (!hasPump) emptyParts.push(t("sectionPump"));
      if (!hasMixer) emptyParts.push(t("sectionMixer"));
      if (!hasTask) emptyParts.push(t("sectionWork"));

      if (emptyParts.length === 3) {
        message.warning(`${t("chupEmptyTitle")}: ${emptyParts.join(", ")}`);
        return;
      }
      if (emptyParts.length > 0) {
        const proceed = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: t("chupPartialTitle"),
            content: `${t("chupPartialContent")} ${emptyParts.join(", ")}`,
            okText: t("chupPartialOk"),
            cancelText: t("chupPartialCancel"),
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!proceed) return;
      }

      const offPersonById = new Map(
        offBootstrap.personnel.map((person) => [person.user_id, person])
      );
      const offNote: Record<string, string> = {
        morning: " (nghỉ sáng)",
        afternoon: " (nghỉ chiều)",
      };
      const offNames = (offBootstrap.draft?.user_statuses || []).map((status) => {
        const person = offPersonById.get(status.user_id);
        const name = person?.user_full_name || person?.user_short_name || `#${status.user_id}`;
        return `${name}${offNote[status.status] || ""}`;
      });

      await exportChupLichExcel({
        workDate,
        personnel,
        pumpDraft,
        pumpVehicles,
        mixerDraft,
        mixerVehicles,
        works: taskBootstrap.works,
        taskDraft: taskBootstrap.draft,
        lotLabels: lotList.map((item) => item.label),
        offNames,
      });
      message.success(t("chupSuccess"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("chupFailed")}: ${msg}`);
    } finally {
      setChupLoading(false);
    }
  }, [
    pumpDirty,
    mixerDirty,
    workDate,
    pumpDraft,
    mixerDraft,
    personnel,
    pumpVehicles,
    mixerVehicles,
    t,
  ]);

  useEffect(() => {
    onRegisterChup?.(handleChupLich);
    return () => onRegisterChup?.(null);
  }, [onRegisterChup, handleChupLich]);
  useEffect(() => {
    onChupLoadingChange?.(chupLoading);
  }, [chupLoading, onChupLoadingChange]);
  useEffect(() => {
    onRegisterLotCapture?.(openLotCaptureDialog);
    return () => onRegisterLotCapture?.(null);
  }, [onRegisterLotCapture, openLotCaptureDialog]);
  useEffect(() => {
    onLotCaptureLoadingChange?.(lotCaptureLoading || lotCaptureSaving);
  }, [lotCaptureLoading, lotCaptureSaving, onLotCaptureLoadingChange]);

  const dateControls = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={t("prevDay")}
        onClick={() => setSelectedDate(selectedDate.subtract(1, "day"))}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
      >
        <ChevronLeft size={18} />
      </button>
      <DatePicker
        value={selectedDate}
        onChange={(value) => value && setSelectedDate(value)}
        format="DD/MM/YYYY"
        allowClear={false}
        className="h-9 w-[140px]"
      />
      <button
        type="button"
        aria-label={t("nextDay")}
        onClick={() => setSelectedDate(selectedDate.add(1, "day"))}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
      >
        <ChevronRight size={18} />
      </button>
      {!isToday && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setSelectedDate(dayjs())}
          className="ml-1 h-9 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
        >
          {t("today")}
        </Button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Modal
        open={lotCaptureOpen}
        onCancel={() => setLotCaptureOpen(false)}
        onOk={handleCaptureLots}
        okText={t("lotCaptureConfirm")}
        cancelText={t("lotCaptureCancel")}
        confirmLoading={lotCaptureSaving}
        okButtonProps={{
          disabled: !canSyncLots || lotCaptureLoading || lotCaptureItems.length === 0,
        }}
        title={t("lotCaptureTitle")}
        width={520}
      >
        <div className="space-y-3 pt-1">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {t("lotCaptureDescription")}
          </div>
          <Input
            value={lotCaptureName}
            onChange={(event) => setLotCaptureName(event.target.value)}
            placeholder={t("lotCaptureNamePlaceholder")}
            className="h-9 rounded-none border-slate-300 bg-white shadow-none focus-visible:ring-teal-500/20"
          />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <UserRound size={15} className="text-teal-600" />
              {t("lotDutyPerson")}
            </div>
            <AntSelect
              showSearch
              allowClear
              value={lotDutyUserId === NONE_VALUE ? undefined : lotDutyUserId}
              onChange={(value) => setLotDutyUserId(value || NONE_VALUE)}
              placeholder={t("lotDutyPersonPlaceholder")}
              options={personnel.map((person) => ({
                value: String(person.user_id),
                label: getPersonLabel(person),
              }))}
              filterOption={filterSelectOptionByLabel}
              className="w-full [&_.ant-select-selector]:!rounded-none"
            />
          </div>
          <div className="rounded-md border border-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
              <FileSpreadsheet size={16} className="text-teal-600" />
              {t("lotCapturePreview", { count: lotCaptureItems.length })}
            </div>
            <div className="max-h-[240px] overflow-y-auto p-2">
              {lotCaptureLoading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
              ) : lotCaptureItems.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-slate-400">
                  {t("lotCaptureEmpty")}
                </div>
              ) : (
                <div className="space-y-1">
                  {lotCaptureItems.map((item, index) => (
                    <div
                      key={`${item.order_id}-${item.vehicle_id}`}
                      className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                        {item.vehicle_license_plate} | {item.vehicle_name}
                      </span>
                      <Chip tone="teal">{item.label}</Chip>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={t("lotOrderMoveUp")}
                          disabled={index === 0 || lotCaptureSaving}
                          onClick={() => moveLotCaptureItem(index, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={t("lotOrderMoveDown")}
                          disabled={index === lotCaptureItems.length - 1 || lotCaptureSaving}
                          onClick={() => moveLotCaptureItem(index, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {!todayOnly && !hideDateControls && (
        <div className="flex flex-wrap items-center gap-3 border border-slate-300 bg-white px-3 py-1.5">
          {dateControls}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-3 2xl:grid-cols-[minmax(380px,500px)_minmax(0,1fr)]">
        {/* Cột phải (2xl): Xe bơm + các khối truyền qua children (Công việc, Chấm công, Lốt trộn) */}
        <div className="min-w-0 space-y-3 2xl:order-2">
          <section className="overflow-hidden border border-slate-300 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50 px-2.5 py-1.5">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Truck size={17} className="text-teal-600" />
                {t("sectionPump")}
              </div>
              <Chip tone={pumpDraft.pump_assignments.length > 0 ? "teal" : "slate"}>
                {pumpDraft.pump_assignments.length}
              </Chip>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <AntSelect
                  showSearch
                  allowClear
                  value={selectedPumpVehicleId === NONE_VALUE ? undefined : selectedPumpVehicleId}
                  onChange={(value) => setSelectedPumpVehicleId(value || NONE_VALUE)}
                  placeholder={t("selectVehicleToAdd")}
                  options={availablePumpVehicles.map((vehicle) => ({
                    value: String(vehicle.vehicle_id),
                    label: getVehicleLabel(vehicle),
                  }))}
                  filterOption={filterSelectOptionByLabel}
                  className="w-[280px] [&_.ant-select-selector]:!rounded-none"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={addPumpVehicle}
                  disabled={!canUpdate || selectedPumpVehicleId === NONE_VALUE}
                  className="h-8 rounded-none bg-slate-900 font-semibold text-white hover:bg-slate-800"
                >
                  <Plus size={15} />
                  {t("addVehicle")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSavePump}
                  disabled={!canUpdate || savingPump}
                  className="h-8 rounded-none bg-teal-600 font-semibold text-white hover:bg-teal-700"
                >
                  {savingPump ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
                  {t("save")}
                  {pumpPrefilledTitle && !savingPump && (
                    <span title={pumpPrefilledTitle} aria-label={pumpPrefilledTitle}>
                      <Star size={13} className="fill-amber-200 text-amber-200" />
                    </span>
                  )}
                  {pumpDirty && !savingPump && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-white/90" />
                  )}
                </Button>
                {pumpPrefilledTab && (
                  <span
                    title={pumpPrefilledTitle}
                    className="inline-flex h-8 items-center border border-amber-300 bg-amber-50 px-2 text-xs font-extrabold text-amber-700 shadow-sm"
                  >
                    {pumpPrefilledTab}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <th className="w-12 border border-slate-300 px-2 py-1.5 text-center">#</th>
                    <th className="w-[280px] border border-slate-300 px-2 py-1.5 text-left">
                      {t("sectionPump")}
                    </th>
                    {WORK_PUMP_ROLES.map((role) => (
                      <th key={role.key} className="border border-slate-300 px-2 py-1.5 text-left">
                        {role.label}
                      </th>
                    ))}
                    <th className="w-12 border border-slate-300 px-2 py-1.5 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {pumpDraft.pump_assignments.length === 0 ? (
                    <tr>
                      <td className="border border-slate-200 px-2 py-3 text-center text-slate-400">
                        1
                      </td>
                      <td
                        colSpan={5}
                        className="border border-slate-200 px-3 py-3 text-sm text-slate-400"
                      >
                        {t("noPumpAssignments")}
                      </td>
                    </tr>
                  ) : (
                    pumpDraft.pump_assignments.map((assignment, index) => {
                      const vehicle = pumpVehicleById.get(assignment.vehicle_id);
                      return (
                        <tr key={assignment.assignment_id} className="h-10">
                          <td className="border border-slate-200 bg-slate-50 px-2 text-center text-xs font-medium text-slate-500">
                            {index + 1}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 align-middle">
                            <div className="flex min-w-0 items-center gap-2">
                              <Chip tone="indigo">
                                {vehicle?.vehicle_type_symbol || vehicle?.vehicle_type_name || "B"}
                              </Chip>
                              <span className="truncate font-semibold text-slate-900">
                                {vehicle ? getVehicleLabel(vehicle) : `#${assignment.vehicle_id}`}
                              </span>
                            </div>
                          </td>
                          {WORK_PUMP_ROLES.map((role) => (
                            <td key={role.key} className="border border-slate-200 p-0 align-middle">
                              <PersonnelPicker
                                people={personnel}
                                selectedIds={assignment.roles[role.key] || []}
                                assignedUserIds={assignedUserIds}
                                halfDaySet={halfDaySet}
                                disabled={!canUpdate}
                                placeholder={t("selectPersonnel")}
                                emptyLabel={t("noPersonnelOptions")}
                                onChange={(ids) =>
                                  setPumpRoleUsers(assignment.assignment_id, role.key, ids)
                                }
                              />
                            </td>
                          ))}
                          <td className="border border-slate-200 p-0 text-center align-middle">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!canUpdate}
                              onClick={() => removePumpVehicle(assignment.assignment_id)}
                              className="h-9 rounded-none px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={15} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {children}
        </div>

        {/* Cột trái (2xl): Xe bồn */}
        <section className="min-w-0 overflow-hidden border border-slate-300 bg-white 2xl:order-1">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50 px-2.5 py-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Truck size={17} className="text-indigo-600" />
              {t("sectionMixer")}
            </div>
            <Chip tone={mixerDriverByVehicle.size > 0 ? "teal" : "slate"}>
              {mixerDriverByVehicle.size}/{mixerVehicles.length}
            </Chip>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveMixer}
              disabled={!canUpdate || savingMixer}
              className="ml-auto h-8 rounded-none bg-teal-600 font-semibold text-white hover:bg-teal-700"
            >
              {savingMixer ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
              {t("save")}
              {mixerPrefilledTitle && !savingMixer && (
                <span title={mixerPrefilledTitle} aria-label={mixerPrefilledTitle}>
                  <Star size={13} className="fill-amber-200 text-amber-200" />
                </span>
              )}
              {mixerDirty && !savingMixer && (
                <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-white/90" />
              )}
            </Button>
            {mixerPrefilledTab && (
              <span
                title={mixerPrefilledTitle}
                className="inline-flex h-8 items-center border border-amber-300 bg-amber-50 px-2 text-xs font-extrabold text-amber-700 shadow-sm"
              >
                {mixerPrefilledTab}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <th className="w-12 border border-slate-300 px-2 py-1.5 text-center">#</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">
                    {t("sectionMixer")}
                  </th>
                  <th className="w-[45%] border border-slate-300 px-2 py-1.5 text-left">
                    {t("mixerDriver")}
                  </th>
                  <th className="w-[112px] border border-slate-300 px-2 py-1.5 text-center">
                    {t("mixerLot")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {mixerVehicles.length === 0 ? (
                  <tr>
                    <td className="border border-slate-200 px-2 py-3 text-center text-slate-400">
                      1
                    </td>
                    <td
                      colSpan={3}
                      className="border border-slate-200 px-3 py-3 text-sm text-slate-400"
                    >
                      {t("mixerEmptyVehicles")}
                    </td>
                  </tr>
                ) : (
                  sortedMixerVehicles.map((vehicle, index) => {
                    const driverId = mixerDriverByVehicle.get(vehicle.vehicle_id) || null;
                    const lotNumbers = isToday
                      ? lotNumbersByVehicle.get(vehicle.vehicle_id)
                      : undefined;
                    return (
                      <tr key={vehicle.vehicle_id} className="h-10">
                        <td className="border border-slate-200 bg-slate-50 px-2 text-center text-xs font-medium text-slate-500">
                          {index + 1}
                        </td>
                        <td className="border border-slate-200 px-2 py-1">
                          <div className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
                            <Chip tone="indigo">{vehicle.vehicle_type_symbol || "X"}</Chip>
                            <span className="truncate">{getVehicleLabel(vehicle)}</span>
                          </div>
                        </td>
                        <td className="border border-slate-200 p-0">
                          <PersonnelPicker
                            single
                            people={personnel}
                            selectedIds={driverId ? [driverId] : []}
                            assignedUserIds={assignedUserIds}
                            halfDaySet={halfDaySet}
                            disabled={!canUpdate}
                            placeholder={t("selectPersonnel")}
                            emptyLabel={t("noPersonnelOptions")}
                            onChange={(ids) => setMixerDriver(vehicle.vehicle_id, ids[0] || null)}
                          />
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {/* Xe không có lốt thì bỏ trống */}
                          {lotNumbers && lotNumbers.length > 0 && (
                            <div className="flex min-w-0 flex-col items-center gap-0.5">
                              {latestLotName && (
                                <span
                                  title={latestLotName}
                                  className="max-w-[96px] truncate text-[11px] font-bold leading-4 text-teal-700"
                                >
                                  {latestLotName}
                                </span>
                              )}
                              <Chip tone="teal">{lotNumbers.join(", ")}</Chip>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export function PersonnelPicker({
  people,
  selectedIds,
  assignedUserIds,
  halfDaySet,
  disabled,
  placeholder,
  emptyLabel,
  single = false,
  onChange,
}: {
  people: WorkPersonnel[];
  selectedIds: number[];
  assignedUserIds: Set<number>;
  halfDaySet: Set<number>;
  disabled: boolean;
  placeholder: string;
  emptyLabel: string;
  single?: boolean;
  onChange: (ids: number[]) => void;
}) {
  const t = useTranslations("WorkAssignmentPage");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const keyword = normalizeSearchText(search);

  const visiblePeople = useMemo(
    () =>
      people.filter((person) => {
        const isSelected = selectedSet.has(person.user_id);
        if (!isSelected && assignedUserIds.has(person.user_id)) return false;
        if (!keyword) return true;
        return normalizeSearchText(
          [
            person.user_full_name,
            person.user_short_name,
            person.department_name,
            person.skill_name,
          ].join(" ")
        ).includes(keyword);
      }),
    [assignedUserIds, keyword, people, selectedSet]
  );

  const label = useMemo(() => {
    if (selectedIds.length === 0) return placeholder;
    if (selectedIds.length === 1)
      return getPersonLabel(people.find((p) => p.user_id === selectedIds[0]));
    const names = selectedIds
      .map((id) => getPersonLabel(people.find((p) => p.user_id === id)))
      .filter(Boolean);
    return names.length
      ? names.join(", ")
      : t("selectedPersonnelCount", { count: selectedIds.length });
  }, [people, placeholder, selectedIds, t]);

  const toggle = (userId: number) => {
    if (single) {
      onChange(selectedSet.has(userId) ? [] : [userId]);
      setOpen(false);
      return;
    }

    if (selectedSet.has(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 min-h-9 w-full justify-between rounded-none border-0 bg-transparent px-1.5 text-left font-medium shadow-none hover:bg-teal-50",
            selectedIds.length === 0 ? "text-slate-400" : "text-slate-900"
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown size={15} className="ml-2 shrink-0 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2">
        <div className="relative mb-2">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={placeholder}
            className="h-9 border-slate-200 bg-white pl-9 text-sm shadow-none focus-visible:ring-teal-500/20"
          />
        </div>

        {selectedIds.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            className="mb-2 h-8 w-full justify-start text-slate-500 hover:bg-slate-50"
          >
            {t("clearSelection")}
          </Button>
        )}

        <div className="max-h-[280px] overflow-y-auto pr-1">
          {visiblePeople.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-slate-400">{emptyLabel}</div>
          ) : (
            <div className="space-y-1">
              {visiblePeople.map((person) => {
                const checked = selectedSet.has(person.user_id);
                return (
                  <button
                    key={person.user_id}
                    type="button"
                    onClick={() => toggle(person.user_id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-50",
                      checked && "bg-teal-50"
                    )}
                  >
                    <Checkbox checked={checked} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {person.user_full_name}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {person.user_short_name && <Chip>{person.user_short_name}</Chip>}
                        {person.department_name && <Chip tone="sky">{person.department_name}</Chip>}
                        {person.skill_name && <Chip tone="violet">{person.skill_name}</Chip>}
                        {halfDaySet.has(person.user_id) && <Chip tone="amber">1/2</Chip>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
