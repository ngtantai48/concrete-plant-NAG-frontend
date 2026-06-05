"use client";

import { Button } from "@/components/ui/button";
import { createEmptyWorkTaskDraft, workTaskApi } from "@/services/work-arrangement.service";
import { workApi } from "@/services/work.service";
import type { Work } from "@/types/work";
import type { WorkPersonnel, WorkTaskAssignmentDraft } from "@/types/work-arrangement";
import { DatePicker, message, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import WorkTaskBoard from "./WorkTaskBoard";

export default function WorkTaskManager({
  active = true,
  onDirtyChange,
}: {
  active?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("WorkTaskPage");

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  const [personnel, setPersonnel] = useState<WorkPersonnel[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [draft, setDraft] = useState<WorkTaskAssignmentDraft>(() =>
    createEmptyWorkTaskDraft(dayjs().format("YYYY-MM-DD"))
  );

  const workDate = selectedDate.format("YYYY-MM-DD");
  const isToday = selectedDate.isSame(dayjs(), "day");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrap = await workTaskApi.getBootstrap(workDate);
      setPersonnel(bootstrap.personnel);
      setWorks(bootstrap.works);
      setDraft(bootstrap.draft);
      setDirtyState(false);
      onDirtyChange?.(false);
    } catch (error) {
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

  // Luôn mở hôm nay khi vào lại tab / quay lại cửa sổ (trừ khi đang có thay đổi chưa lưu).
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

  const onChangeDraft = useCallback(
    (updater: (current: WorkTaskAssignmentDraft) => WorkTaskAssignmentDraft) => {
      setDraft((current) => updater(current));
      setDirtyState(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await workTaskApi.save(draft, personnel, works);
      setDraft(saved);
      setDirtyState(false);
      message.success(t("saveSuccess"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("saveFailed")}: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [draft, personnel, works, t]);

  const handleCreateWork = useCallback(
    async (payload: { work_name: string; work_root: number | null }) => {
      setCreating(true);
      try {
        await workApi.create(payload);
        const res = await workApi.list({ limit: 1000 });
        setWorks(res.data.filter((work) => !work.delete_flag));
        message.success(t("createSuccess"));
      } catch (error) {
        const msg = error instanceof Error ? error.message : t("unknownError");
        message.error(`${t("createFailed")}: ${msg}`);
      } finally {
        setCreating(false);
      }
    },
    [t]
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
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
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      ) : (
        <WorkTaskBoard
          works={works}
          personnel={personnel}
          draft={draft}
          saving={saving}
          dirty={dirty}
          creating={creating}
          onChangeDraft={onChangeDraft}
          onSave={handleSave}
          onCreateWork={handleCreateWork}
        />
      )}
    </div>
  );
}
