"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import { createEmptyAttendanceDraft, workAttendanceApi } from "@/services/work-arrangement.service";
import type {
  WorkAttendanceDraft,
  WorkAttendanceStatus,
  WorkPersonnel,
} from "@/types/work-arrangement";
import { message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import DailyMarkingView from "./attendance/DailyMarkingView";
import MonthlyOverviewView from "./attendance/MonthlyOverviewView";

export default function WorkAttendanceManager({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("WorkAttendancePage");
  const { hasActionAccess } = usePermissions();

  const canUpdate = hasActionAccess(SIDEBAR.WORK_ATTENDANCE, PERMISSIONS.WORK_ATTENDANCE.UPDATE);

  const [activeTab, setActiveTab] = useState<"daily" | "overview">("daily");
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  const [attendanceMarked, setAttendanceMarked] = useState(false);
  const [personnel, setPersonnel] = useState<WorkPersonnel[]>([]);
  const [draft, setDraft] = useState<WorkAttendanceDraft>(() =>
    createEmptyAttendanceDraft(dayjs().format("YYYY-MM-DD"))
  );

  const workDate = selectedDate.format("YYYY-MM-DD");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrap = await workAttendanceApi.getBootstrap(workDate);
      setPersonnel(bootstrap.personnel);
      setDraft(bootstrap.draft || createEmptyAttendanceDraft(workDate));
      setAttendanceMarked(Boolean(bootstrap.is_attendance_marked));
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

  const handleSetStatus = useCallback(
    (userId: number, status: WorkAttendanceStatus) => {
      setDraft((current) => ({
        ...current,
        user_statuses:
          status === "working"
            ? current.user_statuses.filter((entry) => entry.user_id !== userId)
            : [
                ...current.user_statuses.filter((entry) => entry.user_id !== userId),
                { user_id: userId, status },
              ],
      }));
      setDirtyState(true);
      onDirtyChange?.(true);
    },
    [onDirtyChange]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await workAttendanceApi.saveDraft(draft);
      setDraft(saved);
      setAttendanceMarked(true);
      setDirtyState(false);
      onDirtyChange?.(false);
      message.success(t("saveSuccess"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("saveFailed")}: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [draft, onDirtyChange, t]);

  const handleMarkDay = useCallback((date: string) => {
    setSelectedDate(dayjs(date));
    setActiveTab("daily");
  }, []);

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "daily" | "overview")}>
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger
          value="daily"
          className="data-[state=active]:bg-teal-600 data-[state=active]:text-white"
        >
          {t("tabDaily")}
        </TabsTrigger>
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-teal-600 data-[state=active]:text-white"
        >
          {t("tabOverview")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="daily" className="mt-4">
        <DailyMarkingView
          date={selectedDate}
          personnel={personnel}
          draft={draft}
          loading={loading}
          saving={saving}
          dirty={dirty}
          canUpdate={canUpdate}
          attendanceMarked={attendanceMarked}
          onChangeDate={setSelectedDate}
          onReload={loadData}
          onSave={handleSave}
          onSetStatus={handleSetStatus}
        />
      </TabsContent>

      <TabsContent value="overview" className="mt-4">
        <MonthlyOverviewView onMarkDay={handleMarkDay} />
      </TabsContent>
    </Tabs>
  );
}
