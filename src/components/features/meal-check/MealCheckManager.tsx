"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  groupByDepartment,
  normalizeSearchText,
} from "@/components/features/work-arrangement/attendance/shared";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import mealCheckApi, {
  type MealCheckReport,
  type MealCheckRunId,
  type MealSlotKey,
} from "@/services/meal-check.service";
import { userAssignmentApi } from "@/services/user-assignment.service";
import { workAssignmentApi, workTaskApi } from "@/services/work-arrangement.service";
import type { UserAssignment } from "@/types/user-assignment";
import {
  DatePicker,
  Empty,
  InputNumber,
  message,
  Modal,
  Progress,
  Select as AntSelect,
  Skeleton,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { toPng } from "html-to-image";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ImageDown,
  Loader2,
  MapPin,
  Save,
  Search,
  UtensilsCrossed,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MealOverviewView from "./MealOverviewView";
import {
  cellKey,
  type CellState,
  MEAL_SLOTS,
  type PendingMap,
  rosterToPersonnel,
  type StatusMap,
} from "./shared";

type TabKey = "daily" | "overview";
type SyncPhase = "creating" | "scanning";

interface FlatRow {
  key: string;
  stt: number | string;
  name: string;
  meta: string;
  userId: number;
  total: number;
  count: number; // số người trong nhóm (chỉ dùng cho hàng section)
  isSection: boolean;
  expanded: boolean; // chỉ dùng cho hàng bộ phận: đang bung hay thu gọn
  cells: Record<string, CellState>; // key = slot
}

export default function MealCheckManager() {
  const t = useTranslations("MealCheck");
  const { setDirty } = useNavigationStore();

  const [activeTab, setActiveTab] = useState<TabKey>("daily");
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [selectedSlots, setSelectedSlots] = useState<MealSlotKey[]>(["sang", "trua", "toi"]);

  const [showLocation, setShowLocation] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(17.490144886448913);
  const [longitude, setLongitude] = useState<number | null>(106.55922219182935);
  const [radius, setRadius] = useState<number | null>(150);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("creating");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [syncError, setSyncError] = useState("");
  const [saving, setSaving] = useState(false);

  const [roster, setRoster] = useState<UserAssignment[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [pending, setPending] = useState<PendingMap>({});

  // Bộ lọc (giống Chấm Công)
  const [nameFilter, setNameFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<number | "all">("all");
  const [skillFilter, setSkillFilter] = useState<number | "all">("all");

  // Mặc định các bộ phận thu gọn; chỉ mở bộ phận user chủ động bung (giống Chấm Công).
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const toggleDept = useCallback(
    (name: string) =>
      setExpandedDepts((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      }),
    []
  );

  const tableRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusMapRef = useRef<StatusMap>({});
  const baselineRef = useRef<StatusMap>({}); // trạng thái đã lưu (mốc so sánh "chưa lưu")
  const pendingRef = useRef<PendingMap>({});

  useEffect(() => {
    statusMapRef.current = statusMap;
  }, [statusMap]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const dirtyCount = Object.keys(pending).length;
  const dirty = dirtyCount > 0;

  // Đồng bộ cờ "chưa lưu" cho guard điều hướng (Sidebar) + cảnh báo đóng tab.
  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const cancelPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Load roster (tất cả nhân sự, kể cả người không thuộc xe) một lần.
  useEffect(() => {
    let mounted = true;
    userAssignmentApi
      .list({ limit: 1000 })
      .then((res) => {
        if (!mounted) return;
        const list = (res.data || []).filter((p) => !p.delete_flag && p.user_id);
        setRoster(list);
      })
      .catch(() => {
        if (mounted) message.error(t("rosterFailed"));
      });
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => () => cancelPoll(), [cancelPoll]);

  const slotLabel = useCallback(
    (key: MealSlotKey) =>
      key === "sang" ? t("slotSang") : key === "trua" ? t("slotTrua") : t("slotToi"),
    [t]
  );

  const activeSlots = useMemo(
    () => MEAL_SLOTS.filter((s) => selectedSlots.includes(s.key)),
    [selectedSlots]
  );

  const workDate = selectedDate.format("YYYY-MM-DD");
  const isToday = selectedDate.isSame(dayjs(), "day");

  const personnel = useMemo(() => rosterToPersonnel(roster), [roster]);

  // Ghi báo cáo 1 ngày -> statusMap + cập nhật mốc, xoá "chưa lưu".
  const applyDayReport = useCallback((report: MealCheckReport) => {
    const map: StatusMap = {};
    for (const user of report.by_user) {
      for (const cell of user.cells) {
        if (!cell.work_date || !cell.meal_slot) continue;
        map[cellKey(user.user_id, cell.work_date, cell.meal_slot)] = {
          is_allowance: true,
          source: cell.source,
        };
      }
    }
    setStatusMap(map);
    baselineRef.current = map;
    setPending({});
  }, []);

  // Tải dữ liệu đã lưu của ngày đang chọn (không quét GPS).
  const loadDay = useCallback(async () => {
    cancelPoll();
    setLoading(true);
    setSyncError("");
    try {
      const report = await mealCheckApi.getReport(workDate, workDate);
      applyDayReport(report);
    } catch {
      setStatusMap({});
      baselineRef.current = {};
      setPending({});
      message.error(t("loadResultsFailed"));
    } finally {
      setLoading(false);
    }
  }, [workDate, cancelPoll, applyDayReport, t]);

  // Tự nạp khi mở trang / khi đổi ngày (dùng ref tránh re-run vòng lặp).
  const loadDayRef = useRef(loadDay);
  useEffect(() => {
    loadDayRef.current = loadDay;
  }, [loadDay]);
  useEffect(() => {
    loadDayRef.current();
  }, [workDate]);

  const confirmDiscard = useCallback(() => {
    if (
      Object.keys(pendingRef.current).length > 0 &&
      typeof window !== "undefined" &&
      !window.confirm(t("discardConfirm"))
    ) {
      return false;
    }
    return true;
  }, [t]);

  const changeDate = useCallback(
    (date: Dayjs) => {
      if (!confirmDiscard()) return;
      setSelectedDate(date);
    },
    [confirmDiscard]
  );

  const handleMarkDay = useCallback(
    (date: string) => {
      if (!confirmDiscard()) return;
      setSelectedDate(dayjs(date));
      setActiveTab("daily");
    },
    [confirmDiscard]
  );

  const departmentOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const person of personnel) {
      if (person.department_id && person.department_name) {
        map.set(person.department_id, person.department_name);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [personnel]);

  const skillOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const person of personnel) {
      if (person.skill_id && person.skill_name) {
        map.set(person.skill_id, person.skill_name);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [personnel]);

  const filteredPersonnel = useMemo(() => {
    const normalizedNameFilter = normalizeSearchText(nameFilter);
    return personnel.filter((person) => {
      if (normalizedNameFilter) {
        const haystack = normalizeSearchText(
          [
            person.user_full_name,
            person.user_short_name,
            person.department_name,
            person.skill_name,
          ].join(" ")
        );
        if (!haystack.includes(normalizedNameFilter)) return false;
      }
      if (departmentFilter !== "all" && person.department_id !== departmentFilter) return false;
      if (skillFilter !== "all" && person.skill_id !== skillFilter) return false;
      return true;
    });
  }, [personnel, nameFilter, departmentFilter, skillFilter]);

  // Tổng suất trong ngày theo từng người (trên toàn roster — không phụ thuộc bộ lọc).
  const totalsByUser = useMemo(() => {
    const map = new Map<number, number>();
    for (const person of personnel) {
      let total = 0;
      for (const slot of activeSlots) {
        if (statusMap[cellKey(person.user_id, workDate, slot.key)]?.is_allowance) total++;
      }
      map.set(person.user_id, total);
    }
    return map;
  }, [personnel, activeSlots, statusMap, workDate]);

  const grandTotal = useMemo(() => {
    let sum = 0;
    for (const value of totalsByUser.values()) sum += value;
    return sum;
  }, [totalsByUser]);

  // Đã đồng bộ GPS chưa: có ít nhất 1 suất nguồn "auto" trong ngày.
  const synced = useMemo(() => {
    for (const person of personnel) {
      for (const slot of MEAL_SLOTS) {
        const cell = statusMap[cellKey(person.user_id, workDate, slot.key)];
        if (cell?.is_allowance && cell.source === "auto") return true;
      }
    }
    return false;
  }, [personnel, statusMap, workDate]);

  const filteredGroups = useMemo(
    () => groupByDepartment(filteredPersonnel, t("noDepartment")),
    [filteredPersonnel, t]
  );

  // Khi đang lọc/tìm thì bung hết để thấy kết quả.
  const hasActiveFilter =
    nameFilter.trim() !== "" || departmentFilter !== "all" || skillFilter !== "all";

  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    let stt = 1;

    for (const [departmentName, people] of filteredGroups) {
      if (people.length === 0) continue;
      const isExpanded = hasActiveFilter || expandedDepts.has(departmentName);
      const groupTotal = people.reduce((sum, p) => sum + (totalsByUser.get(p.user_id) || 0), 0);
      rows.push({
        key: `sec-${departmentName}`,
        stt: "",
        name: departmentName,
        meta: "",
        userId: 0,
        total: groupTotal,
        count: people.length,
        isSection: true,
        expanded: isExpanded,
        cells: {},
      });

      // Thu gọn: bỏ qua người trong bộ phận chưa bung.
      if (!isExpanded) continue;

      for (const person of people) {
        const cells: Record<string, CellState> = {};
        for (const slot of activeSlots) {
          const state = statusMap[cellKey(person.user_id, workDate, slot.key)];
          if (state) cells[slot.key] = state;
        }
        const meta = [person.user_short_name, person.skill_name].filter(Boolean).join("  ·  ");
        rows.push({
          key: `u-${person.user_id}`,
          stt: stt++,
          name: person.user_full_name,
          meta,
          userId: person.user_id,
          total: totalsByUser.get(person.user_id) || 0,
          count: 0,
          isSection: false,
          expanded: false,
          cells,
        });
      }
    }

    return rows;
  }, [
    filteredGroups,
    activeSlots,
    statusMap,
    totalsByUser,
    workDate,
    expandedDepts,
    hasActiveFilter,
  ]);

  // --- Chấm tay: gom vào "chưa lưu", chưa ghi DB cho tới khi bấm Lưu ---

  const toggleCell = useCallback((userId: number, date: string, slot: MealSlotKey) => {
    const key = cellKey(userId, date, slot);
    const current = statusMapRef.current[key];
    const next = !current?.is_allowance;

    setStatusMap((m) => ({
      ...m,
      [key]: { id: current?.id, is_allowance: next, source: "manual", note: current?.note },
    }));
    setPending((p) => {
      const baseline = baselineRef.current[key]?.is_allowance ?? false;
      const copy = { ...p };
      if (next === baseline) delete copy[key];
      else copy[key] = { userId, date, slot, is_allowance: next };
      return copy;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const entries = Object.values(pendingRef.current);
    if (entries.length === 0) return;
    setSaving(true);
    try {
      const results = await Promise.allSettled(
        entries.map((entry) =>
          mealCheckApi.upsertUserMealStatus({
            user_id: entry.userId,
            work_date: entry.date,
            meal_slot: entry.slot,
            is_allowance: entry.is_allowance,
          })
        )
      );

      const nextStatus: StatusMap = { ...statusMapRef.current };
      const nextBaseline: StatusMap = { ...baselineRef.current };
      const stillPending: PendingMap = {};
      let failed = 0;

      results.forEach((result, index) => {
        const entry = entries[index];
        const key = cellKey(entry.userId, entry.date, entry.slot);
        if (result.status === "fulfilled") {
          const saved = result.value;
          const cell: CellState = saved
            ? {
                id: saved.user_meal_status_id,
                is_allowance: saved.is_allowance,
                source: saved.source,
                note: saved.note ?? undefined,
              }
            : { is_allowance: entry.is_allowance, source: "manual" };
          nextStatus[key] = cell;
          nextBaseline[key] = cell;
        } else {
          failed++;
          stillPending[key] = entry;
        }
      });

      setStatusMap(nextStatus);
      baselineRef.current = nextBaseline;
      setPending(stillPending);

      if (failed === 0) {
        message.success(t("saveSuccess", { count: entries.length }));
      } else {
        message.error(t("savePartialFailed", { count: failed }));
      }
    } finally {
      setSaving(false);
    }
  }, [t]);

  // --- Đồng bộ: quét GPS ở backend cho đúng ngày đang chọn ---

  const handleSync = useCallback(async () => {
    if (selectedSlots.length === 0) return;
    if (!confirmDiscard()) return;

    // Chỉ cho đồng bộ khi phân công trong ngày đã cấu hình (giống nút Chụp lịch):
    // GPS gán suất ăn theo kíp xe, chưa phân công thì không có gì để gán.
    setCheckingConfig(true);
    let configOk = false;
    try {
      const [arrangement, taskBootstrap] = await Promise.all([
        workAssignmentApi.getBootstrap(workDate),
        workTaskApi.getBootstrap(workDate),
      ]);
      const hasPump = arrangement.pump.draft.pump_assignments.length > 0;
      const hasMixer = arrangement.mixer.draft.mixer_assignments.some(
        (item) => item.user_id != null
      );
      const hasTask = taskBootstrap.draft.task_assignments.some((task) => task.user_ids.length > 0);
      const emptyParts: string[] = [];
      if (!hasPump) emptyParts.push(t("sectionPump"));
      if (!hasMixer) emptyParts.push(t("sectionMixer"));
      if (!hasTask) emptyParts.push(t("sectionWork"));

      if (emptyParts.length === 3) {
        // Trống cả 3 mục → chặn, nêu rõ tên mục.
        message.warning(`${t("syncEmptyTitle")}: ${emptyParts.join(", ")}`);
      } else if (emptyParts.length > 0) {
        // Một vài mục trống → cảnh báo, cho chọn vẫn đồng bộ hay quay lại bổ sung.
        configOk = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: t("syncPartialTitle"),
            content: `${t("syncPartialContent")} ${emptyParts.join(", ")}`,
            okText: t("syncPartialOk"),
            cancelText: t("syncPartialCancel"),
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
      } else {
        configOk = true;
      }
    } catch {
      message.error(t("configCheckFailed"));
    } finally {
      setCheckingConfig(false);
    }
    if (!configOk) return;

    cancelPoll();
    setSyncing(true);
    setSyncPhase("creating");
    setSyncError("");
    setProgress({ done: 0, total: 0 });

    const orderedSlots = MEAL_SLOTS.filter((s) => selectedSlots.includes(s.key)).map((s) => s.key);
    const hasLocation =
      Number.isFinite(latitude) && Number.isFinite(longitude) && Number.isFinite(radius);

    const poll = async (runId: MealCheckRunId) => {
      try {
        const run = await mealCheckApi.getRun(runId);
        setProgress({ done: run.progress_done, total: run.progress_total });
        if (run.status === "done") {
          setSyncing(false);
          await loadDay();
          return;
        }
        if (run.status === "failed") {
          const msg = run.error_message || t("runFailed");
          setSyncError(msg);
          setSyncing(false);
          message.error(msg);
          return;
        }
        setSyncPhase("scanning");
        pollTimerRef.current = setTimeout(() => poll(runId), 2000);
      } catch {
        setSyncError(t("runFailed"));
        setSyncing(false);
      }
    };

    try {
      const runId = await mealCheckApi.createRun({
        from: workDate,
        to: workDate,
        meal_slots: orderedSlots.join(","),
        ...(hasLocation
          ? {
              location: {
                lat: latitude as number,
                lng: longitude as number,
                radius: radius as number,
              },
            }
          : {}),
      });
      if (!runId) throw new Error("no run id");
      setSyncPhase("scanning");
      poll(runId);
    } catch {
      setSyncError(t("createRunFailed"));
      setSyncing(false);
    }
  }, [
    selectedSlots,
    workDate,
    latitude,
    longitude,
    radius,
    cancelPoll,
    loadDay,
    confirmDiscard,
    t,
  ]);

  const handleExportImage = useCallback(async () => {
    if (!tableRef.current) return;
    try {
      const dataUrl = await toPng(tableRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `com-ca_${selectedDate.format("DD-MM-YYYY")}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      message.error(t("exportImageFailed"));
    }
  }, [selectedDate, t]);

  // --- Table columns (1 ngày: STT | Họ tên | <các bữa> | Tổng) ---

  const columns: ColumnsType<FlatRow> = useMemo(() => {
    const cols: ColumnsType<FlatRow> = [
      {
        title: "STT",
        dataIndex: "stt",
        key: "stt",
        width: 52,
        fixed: "left",
        align: "center",
        render: (val: number | string, record: FlatRow) =>
          record.isSection ? null : <span className="text-slate-500">{val}</span>,
      },
      {
        title: t("driverName"),
        dataIndex: "name",
        key: "name",
        width: 240,
        fixed: "left",
        render: (val: string, record: FlatRow) =>
          record.isSection ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {record.expanded ? (
                  <ChevronDown size={14} className="shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight size={14} className="shrink-0 text-slate-400" />
                )}
                <span className="truncate font-semibold uppercase tracking-wide text-slate-600">
                  {val}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium normal-case text-slate-400">
                {t("groupSummary", { count: record.count })}
              </span>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-800">{val}</div>
              {record.meta && (
                <div className="mt-0.5 truncate text-xs text-slate-500">{record.meta}</div>
              )}
            </div>
          ),
      },
    ];

    for (const slot of activeSlots) {
      cols.push({
        title: slotLabel(slot.key),
        key: slot.key,
        width: 92,
        align: "center",
        render: (_: unknown, record: FlatRow) => {
          if (record.isSection) return null;
          const state = record.cells[slot.key];
          const on = !!state?.is_allowance;
          const manual = state?.source === "manual";
          return (
            <button
              type="button"
              onClick={() => toggleCell(record.userId, workDate, slot.key)}
              title={manual ? t("manualMark") : on ? t("autoMark") : undefined}
              className={`flex h-7 w-full items-center justify-center rounded transition-colors ${
                on
                  ? manual
                    ? "bg-amber-100 ring-1 ring-inset ring-amber-300 hover:bg-amber-200"
                    : "bg-emerald-50 hover:bg-emerald-100"
                  : "hover:bg-slate-100"
              }`}
            >
              {on ? (
                <CheckCircle size={15} className={manual ? "text-amber-600" : "text-emerald-600"} />
              ) : (
                <span className="text-slate-200">·</span>
              )}
            </button>
          );
        },
      });
    }

    cols.push({
      title: t("totalColumn"),
      dataIndex: "total",
      key: "total",
      width: 64,
      fixed: "right",
      align: "center",
      render: (val: number, record: FlatRow) =>
        record.isSection ? (
          <span className="font-semibold tabular-nums text-slate-500">{val || ""}</span>
        ) : (
          <span className="font-semibold tabular-nums">{val}</span>
        ),
    });

    return cols;
  }, [activeSlots, toggleCell, slotLabel, workDate, t]);

  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div className="min-h-screen bg-white px-4 py-3 text-slate-800 sm:px-6 sm:py-4">
      {/* Header */}
      <div className="mb-5">
        <div className="mb-1 flex items-center gap-3">
          <UtensilsCrossed size={22} className="text-amber-600" strokeWidth={2.5} />
          <h1 className="m-0 text-2xl font-bold tracking-tight text-slate-800">{t("title")}</h1>
        </div>
        <p className="m-0 ml-[34px] text-sm text-slate-500">{t("description")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger
            value="daily"
            className="data-[state=active]:bg-amber-600 data-[state=active]:text-white"
          >
            {t("tabDaily")}
          </TabsTrigger>
          <TabsTrigger
            value="overview"
            className="data-[state=active]:bg-amber-600 data-[state=active]:text-white"
          >
            {t("tabOverview")}
          </TabsTrigger>
        </TabsList>

        {/* ===== Tab: Chấm theo ngày ===== */}
        <TabsContent value="daily" className="mt-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t("prevDay")}
                onClick={() => changeDate(selectedDate.subtract(1, "day"))}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ChevronLeft size={18} />
              </button>
              <DatePicker
                value={selectedDate}
                onChange={(value) => value && changeDate(value)}
                format="DD/MM/YYYY"
                allowClear={false}
                className="h-9 w-[140px]"
              />
              <button
                type="button"
                aria-label={t("nextDay")}
                onClick={() => changeDate(selectedDate.add(1, "day"))}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ChevronRight size={18} />
              </button>
              {!isToday && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => changeDate(dayjs())}
                  className="ml-1 h-9 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                >
                  {t("today")}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {!loading && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                    synced
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${synced ? "bg-emerald-500" : "bg-amber-500"}`}
                  />
                  {synced ? t("statusSynced") : t("statusNotSynced")}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                {t("employeeCount")}
                <b className="text-slate-900">{personnel.length}</b>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t("totalMeals")}
                <b className="text-slate-900">{grandTotal}</b>
              </span>
              {dirty && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {t("unsaved", { count: dirtyCount })}
                </span>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!dirty || saving || loading}
                className="h-9 bg-amber-600 font-semibold text-white hover:bg-amber-700"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
                {t("save")}
                {dirty && !saving && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-white/90" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={
                  selectedSlots.length === 0 || syncing || checkingConfig || saving || loading
                }
                className="h-9 border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                {syncing || checkingConfig ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search size={15} />
                )}
                {t("syncDay")}
              </Button>
            </div>
          </div>

          {/* Hàng tuỳ chọn bữa + điểm ăn */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AntSelect
              mode="multiple"
              value={selectedSlots}
              onChange={(val) => setSelectedSlots(val as MealSlotKey[])}
              placeholder={t("mealSlots")}
              style={{ minWidth: 220 }}
              options={MEAL_SLOTS.map((slot) => ({ value: slot.key, label: slotLabel(slot.key) }))}
            />
            <button
              type="button"
              onClick={() => setShowLocation(!showLocation)}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:bg-slate-50"
            >
              <MapPin size={13} />
              {t("locationSettings")}
              {showLocation ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Location panel */}
          {showLocation && (
            <div className="mt-3 flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("latitude")}
                </label>
                <InputNumber
                  value={latitude}
                  onChange={setLatitude}
                  step={0.0001}
                  style={{ width: 180 }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("longitude")}
                </label>
                <InputNumber
                  value={longitude}
                  onChange={setLongitude}
                  step={0.0001}
                  style={{ width: 180 }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("radius")}
                </label>
                <InputNumber
                  value={radius}
                  onChange={setRadius}
                  min={10}
                  max={2000}
                  step={10}
                  style={{ width: 120 }}
                />
              </div>
              <p className="m-0 pb-2 text-xs italic text-slate-400">{t("useMainStationHint")}</p>
            </div>
          )}

          {/* Sync banner */}
          {syncing && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-5">
              <div className="mb-2 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-amber-600" />
                <span className="text-sm font-medium text-amber-800">
                  {syncPhase === "creating" ? t("creatingRun") : t("scanning")}
                </span>
                {syncPhase === "scanning" && progress.total > 0 && (
                  <span className="ml-auto text-sm font-semibold tabular-nums text-amber-700">
                    {progress.done}/{progress.total} ({percent}%)
                  </span>
                )}
              </div>
              <Progress
                percent={syncPhase === "scanning" && progress.total > 0 ? percent : 100}
                showInfo={false}
                status="active"
                strokeColor="#b45309"
                size="small"
              />
            </div>
          )}

          {/* Sync error */}
          {!syncing && syncError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-600">
              <AlertTriangle size={16} className="shrink-0 text-red-500" />
              <span>{syncError}</span>
            </div>
          )}

          {/* Filters */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(220px,1fr)_repeat(2,minmax(160px,220px))]">
            <div className="relative col-span-2 sm:col-span-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
                placeholder={t("searchPersonnel")}
                className="h-10 border-slate-200 bg-white pl-9 text-sm shadow-none focus-visible:ring-amber-500/20"
              />
            </div>
            <Select
              value={String(departmentFilter)}
              onValueChange={(value) =>
                setDepartmentFilter(value === "all" ? "all" : Number(value))
              }
            >
              <SelectTrigger className="h-10 w-full border-slate-200 bg-white text-slate-700 shadow-none focus:ring-amber-500/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDepartments")}</SelectItem>
                {departmentOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(skillFilter)}
              onValueChange={(value) => setSkillFilter(value === "all" ? "all" : Number(value))}
            >
              <SelectTrigger className="h-10 w-full border-slate-200 bg-white text-slate-700 shadow-none focus:ring-amber-500/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allSkills")}</SelectItem>
                {skillOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
            <span className="text-xs text-slate-500">
              {t("shownPersonnel", { count: filteredPersonnel.length, total: personnel.length })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportImage}
              disabled={loading || filteredPersonnel.length === 0}
              className="h-8 border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <ImageDown size={14} />
              {t("exportImage")}
            </Button>
          </div>

          {/* Grid */}
          <div
            ref={tableRef}
            className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            {loading ? (
              <div className="p-5">
                <Skeleton active paragraph={{ rows: 8 }} />
              </div>
            ) : filteredPersonnel.length === 0 ? (
              <div className="py-14">
                <Empty description={t("empty")} />
              </div>
            ) : (
              <Table
                columns={columns}
                dataSource={flatRows}
                rowKey="key"
                pagination={false}
                scroll={{ x: 460 + activeSlots.length * 92 }}
                size="small"
                bordered
                onRow={(record) =>
                  record.isSection ? { onClick: () => toggleDept(record.name) } : {}
                }
                rowClassName={(record) =>
                  record.isSection
                    ? "cursor-pointer select-none bg-slate-50 font-semibold hover:bg-slate-100"
                    : ""
                }
              />
            )}
          </div>

          {/* Legend */}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CheckCircle size={13} className="text-emerald-600" /> {t("autoMark")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-100 ring-1 ring-inset ring-amber-300">
                <CheckCircle size={11} className="text-amber-600" />
              </span>
              {t("manualMark")}
            </span>
            <span className="text-slate-400">{t("editHint")}</span>
          </div>
        </TabsContent>

        {/* ===== Tab: Tổng quan ===== */}
        <TabsContent value="overview" className="mt-4">
          <MealOverviewView roster={personnel} slots={selectedSlots} onMarkDay={handleMarkDay} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
