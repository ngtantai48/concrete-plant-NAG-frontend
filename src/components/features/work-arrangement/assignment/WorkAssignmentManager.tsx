"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createEmptyAssignmentDraft,
  createEmptyMixerAssignmentDraft,
  workAssignmentApi,
  workAttendanceApi,
  workMixSlotApi,
  workTaskApi,
} from "@/services/work-arrangement.service";
import { exportChupLichExcel } from "@/utils/exportChupLich";
import type {
  WorkAssignmentDraft,
  WorkMixerAssignmentDraft,
  WorkPersonnel,
  WorkVehicle,
} from "@/types/work-arrangement";
import { DatePicker, message, Modal, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MixerAssignmentBoard from "./MixerAssignmentBoard";
import PumpAssignmentBoard from "./PumpAssignmentBoard";

type AssignmentSubTab = "pump" | "mixer";

export default function WorkAssignmentManager({
  active = true,
  layout = "tabs",
  onDirtyChange,
  onRegisterChup,
  onChupLoadingChange,
}: {
  active?: boolean;
  layout?: "tabs" | "stacked";
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterChup?: (fn: (() => void) | null) => void;
  onChupLoadingChange?: (loading: boolean) => void;
}) {
  const t = useTranslations("WorkAssignmentPage");

  const [subTab, setSubTab] = useState<AssignmentSubTab>("pump");
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState(false);
  const [savingPump, setSavingPump] = useState(false);
  const [savingMixer, setSavingMixer] = useState(false);
  const [pumpDirty, setPumpDirty] = useState(false);
  const [mixerDirty, setMixerDirty] = useState(false);

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

  const workDate = selectedDate.format("YYYY-MM-DD");
  const isToday = selectedDate.isSame(dayjs(), "day");
  const dirty = pumpDirty || mixerDirty;

  const halfDaySet = useMemo(() => new Set(halfDayUserIds), [halfDayUserIds]);

  const assignedUserIds = useMemo(() => {
    const set = new Set<number>();
    for (const a of pumpDraft.pump_assignments) {
      for (const id of Object.values(a.roles).flat()) set.add(id);
    }
    for (const a of mixerDraft.mixer_assignments) {
      if (a.user_id != null) set.add(a.user_id);
    }
    return set;
  }, [pumpDraft.pump_assignments, mixerDraft.mixer_assignments]);

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
      setPumpDirty(false);
      setMixerDirty(false);
      onDirtyChange?.(false);
    } catch (error) {
      setHalfDayUserIds([]);
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("loadFailed")}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [onDirtyChange, t, workDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // "Luôn mở hôm nay": vào lại tab Phân công / quay lại cửa sổ → về hôm nay (trừ khi đang dirty).
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const resetToToday = useCallback(() => {
    setSelectedDate((prev) => (prev.isSame(dayjs(), "day") ? prev : dayjs()));
  }, []);
  useEffect(() => {
    if (active && !dirtyRef.current) resetToToday();
  }, [active, resetToToday]);
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible" && !dirtyRef.current) resetToToday();
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [resetToToday]);

  const onChangePumpDraft = useCallback(
    (updater: (current: WorkAssignmentDraft) => WorkAssignmentDraft) => {
      setPumpDraft((current) => updater(current));
      setPumpDirty(true);
    },
    []
  );
  const onChangeMixerDraft = useCallback(
    (updater: (current: WorkMixerAssignmentDraft) => WorkMixerAssignmentDraft) => {
      setMixerDraft((current) => updater(current));
      setMixerDirty(true);
    },
    []
  );

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
        // Trống cả 3 mục → chặn, nêu rõ tên mục.
        message.warning(`${t("chupEmptyTitle")}: ${emptyParts.join(", ")}`);
        return;
      }
      if (emptyParts.length > 0) {
        // Một vài mục trống → cảnh báo rõ mục nào, cho chọn vẫn chụp hay quay lại bổ sung.
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

      // Tất cả người nghỉ (cả ngày + nửa ngày, có nhãn) — resolve tên từ personnel chấm công.
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

  // Đẩy handler + trạng thái loading lên cha để render nút "Chụp lịch" ở header trang.
  useEffect(() => {
    onRegisterChup?.(handleChupLich);
    return () => onRegisterChup?.(null);
  }, [onRegisterChup, handleChupLich]);
  useEffect(() => {
    onChupLoadingChange?.(chupLoading);
  }, [chupLoading, onChupLoadingChange]);

  const dateControls = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={t("prevDay")}
        onClick={() => setSelectedDate(selectedDate.subtract(1, "day"))}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
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
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
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

  if (layout === "stacked") {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">{dateControls}</div>
        {loading ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
            <Skeleton active paragraph={{ rows: 10 }} />
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                <h3 className="m-0 text-sm font-bold uppercase tracking-wide text-slate-700">
                  {t("sectionPump")}
                </h3>
              </div>
              <PumpAssignmentBoard
                personnel={personnel}
                assignedUserIds={assignedUserIds}
                vehicles={pumpVehicles}
                halfDaySet={halfDaySet}
                draft={pumpDraft}
                saving={savingPump}
                dirty={pumpDirty}
                onChangeDraft={onChangePumpDraft}
                onSave={handleSavePump}
              />
            </section>
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                <h3 className="m-0 text-sm font-bold uppercase tracking-wide text-slate-700">
                  {t("sectionMixer")}
                </h3>
              </div>
              <MixerAssignmentBoard
                personnel={personnel}
                assignedUserIds={assignedUserIds}
                vehicles={mixerVehicles}
                halfDaySet={halfDaySet}
                draft={mixerDraft}
                saving={savingMixer}
                dirty={mixerDirty}
                onChangeDraft={onChangeMixerDraft}
                onSave={handleSaveMixer}
              />
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <Tabs value={subTab} onValueChange={(value) => setSubTab(value as AssignmentSubTab)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {dateControls}

        <TabsList className="sm:w-fit">
          <TabsTrigger
            value="pump"
            className="data-[state=active]:bg-teal-600 data-[state=active]:text-white"
          >
            {t("subTabPump")}
          </TabsTrigger>
          <TabsTrigger
            value="mixer"
            className="data-[state=active]:bg-teal-600 data-[state=active]:text-white"
          >
            {t("subTabMixer")}
          </TabsTrigger>
        </TabsList>
      </div>

      {loading ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      ) : (
        <>
          <TabsContent value="pump" className="mt-4">
            <PumpAssignmentBoard
              personnel={personnel}
              assignedUserIds={assignedUserIds}
              vehicles={pumpVehicles}
              halfDaySet={halfDaySet}
              draft={pumpDraft}
              saving={savingPump}
              dirty={pumpDirty}
              onChangeDraft={onChangePumpDraft}
              onSave={handleSavePump}
            />
          </TabsContent>
          <TabsContent value="mixer" className="mt-4">
            <MixerAssignmentBoard
              personnel={personnel}
              assignedUserIds={assignedUserIds}
              vehicles={mixerVehicles}
              halfDaySet={halfDaySet}
              draft={mixerDraft}
              saving={savingMixer}
              dirty={mixerDirty}
              onChangeDraft={onChangeMixerDraft}
              onSave={handleSaveMixer}
            />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
