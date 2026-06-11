"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { convertSolarToLunar } from "@/utils/lunar";
import dayjs from "dayjs";
import {
  Briefcase,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MonthlyOverviewView from "./attendance/MonthlyOverviewView";
import WorkAssignmentSelectManager from "./assignment/WorkAssignmentSelectManager";
import WorkTaskSelectManager from "./assignment/WorkTaskSelectManager";
import WorkAttendanceManager from "./WorkAttendanceManager";

type TrialSectionKey = "attendance" | "assignment" | "worktask";

export default function WorkArrangementExperimentPage() {
  const t = useTranslations("WorkArrangementPage");
  const tAttendance = useTranslations("WorkAttendancePage");
  const tAssign = useTranslations("WorkAssignmentPage");
  const setDirty = useNavigationStore((state) => state.setDirty);
  const chupHandlerRef = useRef<(() => void) | null>(null);
  const [chupLoading, setChupLoading] = useState(false);
  const [dirtyBySection, setDirtyBySection] = useState<Record<TrialSectionKey, boolean>>({
    attendance: false,
    assignment: false,
    worktask: false,
  });
  const todayLabel = useMemo(() => dayjs().format("DD/MM/YYYY"), []);
  const lunarLabel = useMemo(() => {
    const today = dayjs();
    const lunar = convertSolarToLunar(today.date(), today.month() + 1, today.year());
    return `${lunar.day}/${lunar.month}${lunar.leap ? " nhuận" : ""} ÂL`;
  }, []);

  const hasDirty = useMemo(() => Object.values(dirtyBySection).some(Boolean), [dirtyBySection]);

  useEffect(() => {
    setDirty(hasDirty);
  }, [hasDirty, setDirty]);

  useEffect(() => () => setDirty(false), [setDirty]);

  const registerChup = useCallback((fn: (() => void) | null) => {
    chupHandlerRef.current = fn;
  }, []);

  const updateDirty = useCallback((key: TrialSectionKey, dirty: boolean) => {
    setDirtyBySection((prev) => (prev[key] === dirty ? prev : { ...prev, [key]: dirty }));
  }, []);
  const handleAttendanceDirty = useCallback(
    (dirty: boolean) => updateDirty("attendance", dirty),
    [updateDirty]
  );
  const handleAssignmentDirty = useCallback(
    (dirty: boolean) => updateDirty("assignment", dirty),
    [updateDirty]
  );
  const handleWorkTaskDirty = useCallback(
    (dirty: boolean) => updateDirty("worktask", dirty),
    [updateDirty]
  );

  return (
    <div className="min-h-screen bg-[#f7f4ed] text-slate-800">
      <div className="mx-auto max-w-[1920px] px-4 py-4 sm:px-5">
        <header className="sticky top-0 z-30 -mx-4 border-b border-stone-200 bg-[#f7f4ed]/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <BriefcaseBusiness size={18} />
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="m-0 text-base font-bold leading-tight text-slate-950 sm:text-lg">
                {t("trialTitle")}
              </h1>
              <span className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600">
                {todayLabel}
                <span className="text-red-600">({lunarLabel})</span>
              </span>
              {hasDirty && (
                <span className="inline-flex h-6 items-center rounded-md bg-amber-50 px-2 text-xs font-semibold text-amber-700">
                  {t("dirty")}
                </span>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => chupHandlerRef.current?.()}
                disabled={chupLoading}
                className="h-8 bg-slate-900 px-3 font-semibold text-white hover:bg-slate-800"
              >
                {chupLoading ? <Loader2 className="size-4 animate-spin" /> : <Camera size={15} />}
                {tAssign("chupButton")}
              </Button>
            </div>
          </div>
        </header>

        {/* Bố cục: Xe bồn cột trái (kèm cột Lốt), Xe bơm cột phải; dưới Xe bơm là Công việc → Chấm công
            (các khối truyền qua children để nằm trong cột phải của manager). */}
        <div className="mt-3">
          <WorkAssignmentSelectManager
            active
            todayOnly
            onDirtyChange={handleAssignmentDirty}
            onRegisterChup={registerChup}
            onChupLoadingChange={setChupLoading}
          >
            <WorkbenchSection
              id="trial-work-task"
              icon={Briefcase}
              title={t("tabWorkTask")}
              dirty={dirtyBySection.worktask}
              dirtyLabel={t("dirty")}
            >
              <WorkTaskSelectManager active compact todayOnly onDirtyChange={handleWorkTaskDirty} />
            </WorkbenchSection>

            <WorkbenchSection
              id="trial-attendance"
              icon={CalendarDays}
              title={t("tabAttendance")}
              dirty={dirtyBySection.attendance}
              dirtyLabel={t("dirty")}
            >
              <Tabs defaultValue="daily" className="gap-2">
                <TabsList className="h-7 w-fit rounded-md border border-slate-200 bg-white p-0.5">
                  <TabsTrigger
                    value="daily"
                    className="h-6 flex-none rounded px-2.5 text-xs font-semibold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                  >
                    {tAttendance("tabDaily")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="overview"
                    className="h-6 flex-none rounded px-2.5 text-xs font-semibold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                  >
                    {tAttendance("tabOverview")}
                  </TabsTrigger>
                </TabsList>
                <div className="border border-slate-300 bg-white p-2.5 sm:p-3">
                  <TabsContent value="daily" className="mt-0">
                    <WorkAttendanceManager
                      compact
                      todayOnly
                      onDirtyChange={handleAttendanceDirty}
                    />
                  </TabsContent>
                  <TabsContent value="overview" className="mt-0">
                    <MonthlyOverviewView compact showMarkDayAction={false} />
                  </TabsContent>
                </div>
              </Tabs>
            </WorkbenchSection>

          </WorkAssignmentSelectManager>
        </div>
      </div>
    </div>
  );
}

function WorkbenchSection({
  id,
  icon: Icon,
  title,
  dirty = false,
  dirtyLabel,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  dirty?: boolean;
  dirtyLabel?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-1">
        <Icon size={15} className="shrink-0 text-slate-500" />
        <h2 className="m-0 text-[13px] font-bold uppercase tracking-wide text-slate-950">
          {title}
        </h2>
        {dirty && dirtyLabel && (
          <span className="ml-auto inline-flex h-5 items-center rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-700">
            {dirtyLabel}
          </span>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
