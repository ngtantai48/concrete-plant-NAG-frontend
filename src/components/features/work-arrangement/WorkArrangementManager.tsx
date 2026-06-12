"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SIDEBAR } from "@/constants/route";
import { useNavigationStore } from "@/hooks/use-navigation-store";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { BriefcaseBusiness, Camera, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorkAssignmentManager from "./assignment/WorkAssignmentManager";
import WorkTaskManager from "./assignment/WorkTaskManager";
import WorkAttendanceManager from "./WorkAttendanceManager";

type WorkArrangementTab = "assignment" | "attendance" | "worktask";

/**
 * Trang gộp "Bố trí công việc": 2 tab cấp trên — Phân công (kéo-thả) + Chấm công.
 * Mỗi tab tự ẩn nếu user thiếu quyền trang tương ứng; route nào mở thì initialTab trỏ vào tab đó.
 */
export default function WorkArrangementManager({
  initialTab = "assignment",
}: {
  initialTab?: WorkArrangementTab;
}) {
  const t = useTranslations("WorkArrangementPage");
  const tAssign = useTranslations("WorkAssignmentPage");
  const { hasPageAccess } = usePermissions();

  const tabs = useMemo(() => {
    const list: { key: WorkArrangementTab; label: string }[] = [];
    if (hasPageAccess(SIDEBAR.WORK_ARRANGEMENTS)) {
      list.push({ key: "assignment", label: t("tabAssignment") });
    }
    if (hasPageAccess(SIDEBAR.WORK_ATTENDANCE)) {
      list.push({ key: "attendance", label: t("tabAttendance") });
    }
    if (hasPageAccess(SIDEBAR.WORKS)) {
      list.push({ key: "worktask", label: t("tabWorkTask") });
    }
    return list;
  }, [hasPageAccess, t]);

  const resolvedInitial: WorkArrangementTab = tabs.some((tab) => tab.key === initialTab)
    ? initialTab
    : (tabs[0]?.key ?? "assignment");

  const [activeTab, setActiveTab] = useState<WorkArrangementTab>(resolvedInitial);
  // Mount mỗi tab khi mở lần đầu rồi giữ sống (forceMount) — đổi tab không mất thao tác chưa lưu, cũng không tải lại.
  const [mountedTabs, setMountedTabs] = useState<Set<WorkArrangementTab>>(
    () => new Set([resolvedInitial])
  );

  const handleTabChange = (value: string) => {
    const next = value as WorkArrangementTab;
    setActiveTab(next);
    setMountedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  // Gom cờ "chưa lưu" của 2 tab (cả hai cùng mount) thành 1 cờ chung cho cảnh báo rời trang.
  const { setDirty } = useNavigationStore();
  const [dirtyByTab, setDirtyByTab] = useState({
    assignment: false,
    attendance: false,
    worktask: false,
  });

  const handleAssignmentDirty = useCallback(
    (dirty: boolean) =>
      setDirtyByTab((prev) => (prev.assignment === dirty ? prev : { ...prev, assignment: dirty })),
    []
  );
  const handleAttendanceDirty = useCallback(
    (dirty: boolean) =>
      setDirtyByTab((prev) => (prev.attendance === dirty ? prev : { ...prev, attendance: dirty })),
    []
  );
  const handleWorkTaskDirty = useCallback(
    (dirty: boolean) =>
      setDirtyByTab((prev) => (prev.worktask === dirty ? prev : { ...prev, worktask: dirty })),
    []
  );

  useEffect(() => {
    setDirty(dirtyByTab.assignment || dirtyByTab.attendance || dirtyByTab.worktask);
  }, [dirtyByTab, setDirty]);

  useEffect(() => () => setDirty(false), [setDirty]);

  // Nút "Chụp lịch" ở header trang — handler nằm trong manager Phân công, lift lên qua ref.
  const chupHandlerRef = useRef<(() => void) | null>(null);
  const [chupLoading, setChupLoading] = useState(false);
  const registerChup = useCallback((fn: (() => void) | null) => {
    chupHandlerRef.current = fn;
  }, []);

  const showAssignment = tabs.some((tab) => tab.key === "assignment");
  const showAttendance = tabs.some((tab) => tab.key === "attendance");
  const showWorkTask = tabs.some((tab) => tab.key === "worktask");
  const showTabBar = tabs.length > 1;

  return (
    <div className="min-h-screen bg-white px-4 py-3 text-slate-800 sm:px-6 sm:py-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <BriefcaseBusiness size={18} />
        </div>
        <h1 className="m-0 text-lg font-bold text-slate-900">{t("title")}</h1>
        <div className="ml-auto flex items-center gap-2">
          {showAssignment && mountedTabs.has("assignment") && (
            <Button
              type="button"
              size="sm"
              onClick={() => chupHandlerRef.current?.()}
              disabled={chupLoading}
              className="h-9 bg-slate-900 font-semibold text-white hover:bg-slate-800"
            >
              {chupLoading ? <Loader2 className="size-4 animate-spin" /> : <Camera size={15} />}
              {tAssign("chupButton")}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {showTabBar && (
          <TabsList className="w-full sm:w-fit">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="data-[state=active]:bg-teal-600 data-[state=active]:text-white"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {showAssignment && (
          <TabsContent
            value="assignment"
            forceMount
            className={cn(showTabBar && "mt-4", activeTab !== "assignment" && "hidden")}
          >
            {mountedTabs.has("assignment") ? (
              <WorkAssignmentManager
                active={activeTab === "assignment"}
                onDirtyChange={handleAssignmentDirty}
                onRegisterChup={registerChup}
                onChupLoadingChange={setChupLoading}
              />
            ) : null}
          </TabsContent>
        )}

        {showAttendance && (
          <TabsContent
            value="attendance"
            forceMount
            className={cn(showTabBar && "mt-4", activeTab !== "attendance" && "hidden")}
          >
            {mountedTabs.has("attendance") ? (
              <WorkAttendanceManager onDirtyChange={handleAttendanceDirty} />
            ) : null}
          </TabsContent>
        )}

        {showWorkTask && (
          <TabsContent
            value="worktask"
            forceMount
            className={cn(showTabBar && "mt-4", activeTab !== "worktask" && "hidden")}
          >
            {mountedTabs.has("worktask") ? (
              <WorkTaskManager
                active={activeTab === "worktask"}
                onDirtyChange={handleWorkTaskDirty}
              />
            ) : null}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
