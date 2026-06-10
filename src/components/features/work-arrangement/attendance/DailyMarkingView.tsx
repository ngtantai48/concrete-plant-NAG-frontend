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
import { cn } from "@/lib/utils";
import type {
  WorkAttendanceDraft,
  WorkAttendanceStatus,
  WorkPersonnel,
} from "@/types/work-arrangement";
import { DatePicker, Empty, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Save,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useMemo, useState } from "react";
import StatusSegmented from "./StatusSegmented";
import { groupByDepartment, normalizeSearchText, STATUS_ORDER } from "./shared";

type DailyMarkingViewProps = {
  date: Dayjs;
  personnel: WorkPersonnel[];
  draft: WorkAttendanceDraft;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  canUpdate: boolean;
  attendanceMarked: boolean;
  compact?: boolean;
  todayOnly?: boolean;
  onChangeDate: (date: Dayjs) => void;
  onReload: () => void;
  onSave: () => void;
  onSetStatus: (userId: number, status: WorkAttendanceStatus) => void;
};

export default function DailyMarkingView({
  date,
  personnel,
  draft,
  loading,
  saving,
  dirty,
  canUpdate,
  attendanceMarked,
  compact = false,
  todayOnly = false,
  onChangeDate,
  onReload,
  onSave,
  onSetStatus,
}: DailyMarkingViewProps) {
  const t = useTranslations("WorkAttendancePage");

  const [nameFilter, setNameFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<number | "all">("all");
  const [skillFilter, setSkillFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<WorkAttendanceStatus | "all">("all");
  // Mặc định các bộ phận thu gọn; chỉ giữ những bộ phận user chủ động mở.
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const toggleDept = (name: string) =>
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const isToday = date.isSame(dayjs(), "day");
  // Khi đang lọc/tìm thì bung hết để thấy kết quả.
  const hasActiveFilter =
    nameFilter.trim() !== "" ||
    departmentFilter !== "all" ||
    skillFilter !== "all" ||
    statusFilter !== "all";

  const statusByUserId = useMemo(
    () => new Map(draft.user_statuses.map((entry) => [entry.user_id, entry.status])),
    [draft.user_statuses]
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

      const status = statusByUserId.get(person.user_id) || "working";
      if (statusFilter !== "all" && status !== statusFilter) return false;

      return true;
    });
  }, [departmentFilter, nameFilter, personnel, skillFilter, statusByUserId, statusFilter]);

  const groups = useMemo(
    () => groupByDepartment(filteredPersonnel, t("unknownDepartment")),
    [filteredPersonnel, t]
  );

  const offCount = draft.user_statuses.length;
  const workingCount = Math.max(personnel.length - offCount, 0);

  return (
    <div className="pb-24 sm:pb-2">
      {/* Toolbar */}
      <div
        className={cn(
          "flex flex-wrap items-center border-b border-slate-200",
          compact ? "gap-2 pb-2" : "gap-x-4 gap-y-3 pb-3"
        )}
      >
        {!todayOnly && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t("prevDay")}
              onClick={() => onChangeDate(date.subtract(1, "day"))}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ChevronLeft size={18} />
            </button>
            <DatePicker
              value={date}
              onChange={(value) => value && onChangeDate(value)}
              format="DD/MM/YYYY"
              allowClear={false}
              className="h-9 w-[140px]"
            />
            <button
              type="button"
              aria-label={t("nextDay")}
              onClick={() => onChangeDate(date.add(1, "day"))}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ChevronRight size={18} />
            </button>
            {!isToday && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChangeDate(dayjs())}
                className="ml-1 h-9 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
              >
                {t("today")}
              </Button>
            )}
          </div>
        )}

        <div className={cn("flex flex-wrap items-center gap-2 text-sm", compact && "gap-1.5")}>
          {!loading && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                attendanceMarked
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${attendanceMarked ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {attendanceMarked ? t("statusMarked") : t("statusNotMarked")}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-slate-600",
              compact && "rounded-full bg-slate-50 px-2 py-1"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("working")}
            <b className="text-slate-900">{workingCount}</b>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-slate-600",
              compact && "rounded-full bg-slate-50 px-2 py-1"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            {t("offLabel")}
            <b className="text-slate-900">{offCount}</b>
          </span>
        </div>

        <div className={cn("ml-auto hidden items-center gap-2 sm:flex", compact && "gap-1.5")}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={loading}
            className={cn(
              "border-slate-200 text-slate-700 hover:bg-slate-50",
              compact ? "h-8 rounded-none px-2.5" : "h-9"
            )}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={15} />}
            {t("reload")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={!canUpdate || saving}
            className={cn(
              "bg-teal-600 font-semibold text-white hover:bg-teal-700",
              compact ? "h-8 rounded-none px-3" : "h-9"
            )}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
            {t("save")}
            {dirty && !saving && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-white/90" />}
          </Button>
        </div>
      </div>

      {isToday && !attendanceMarked && !loading && !compact && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <div className="font-semibold text-amber-900">{t("todayNotMarkedTitle")}</div>
            <div className="text-amber-700">{t("todayNotMarkedDescription")}</div>
          </div>
        </div>
      )}

      {!compact && (
        <>
          {/* Filters */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,210px))]">
            <div className="relative col-span-2 sm:col-span-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={nameFilter}
                onChange={(event) => setNameFilter(event.target.value)}
                placeholder={t("searchPersonnel")}
                className="h-10 border-slate-200 bg-white pl-9 text-sm shadow-none focus-visible:ring-teal-500/20"
              />
            </div>
            <Select
              value={String(departmentFilter)}
              onValueChange={(value) =>
                setDepartmentFilter(value === "all" ? "all" : Number(value))
              }
            >
              <SelectTrigger className="h-10 w-full border-slate-200 bg-white text-slate-700 shadow-none focus:ring-teal-500/20">
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
              <SelectTrigger className="h-10 w-full border-slate-200 bg-white text-slate-700 shadow-none focus:ring-teal-500/20">
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
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as WorkAttendanceStatus | "all")}
            >
              <SelectTrigger className="h-10 w-full border-slate-200 bg-white text-slate-700 shadow-none focus:ring-teal-500/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                {STATUS_ORDER.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {t(option.tkey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-1.5 px-0.5 text-xs text-slate-500">
            {t("shownPersonnel", { count: filteredPersonnel.length, total: personnel.length })}
          </div>
        </>
      )}

      {/* List */}
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-5">
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
        ) : filteredPersonnel.length === 0 ? (
          <div className="py-14">
            <Empty description={t("empty")} />
          </div>
        ) : (
          groups.map(([departmentName, people]) => {
            const groupOff = people.filter(
              (person) => (statusByUserId.get(person.user_id) || "working") !== "working"
            ).length;
            const isExpanded = hasActiveFilter || expandedDepts.has(departmentName);

            return (
              <Fragment key={departmentName}>
                <button
                  type="button"
                  onClick={() => toggleDept(departmentName)}
                  className="flex w-full items-center justify-between gap-2 border-y border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:bg-slate-100 first:border-t-0"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {isExpanded ? (
                      <ChevronDown size={14} className="shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="shrink-0" />
                    )}
                    <span className="truncate">{departmentName}</span>
                  </span>
                  <span className="shrink-0 font-medium normal-case text-slate-400">
                    {groupOff > 0
                      ? t("groupOffSummary", { off: groupOff, total: people.length })
                      : t("groupAllPresent", { total: people.length })}
                  </span>
                </button>
                {isExpanded &&
                  people.map((person) => {
                    const status = statusByUserId.get(person.user_id) || "working";
                    const meta = [person.user_short_name, person.department_name, person.skill_name]
                      .filter(Boolean)
                      .join("  ·  ");

                    return (
                      <div
                        key={person.user_id}
                        className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800">
                            {person.user_full_name}
                          </div>
                          {meta && (
                            <div className="mt-0.5 truncate text-xs text-slate-500">{meta}</div>
                          )}
                        </div>
                        <StatusSegmented
                          value={status}
                          disabled={!canUpdate}
                          onChange={(next) => onSetStatus(person.user_id, next)}
                          className="sm:w-[320px] sm:shrink-0"
                        />
                      </div>
                    );
                  })}
              </Fragment>
            );
          })
        )}
      </div>

      {/* Sticky save bar (mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            {t("offLabel")}
            <b className="text-slate-900">{offCount}</b>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReload}
            disabled={loading}
            className="h-10 border-slate-200 px-3 text-slate-700"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={16} />}
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={!canUpdate || saving}
            className="h-10 flex-1 bg-teal-600 px-6 font-semibold text-white hover:bg-teal-700"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={16} />}
            {t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
