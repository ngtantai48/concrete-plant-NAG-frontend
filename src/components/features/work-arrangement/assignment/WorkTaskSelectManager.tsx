"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import { workTaskApi } from "@/services/work-arrangement.service";
import { workApi } from "@/services/work.service";
import type { Work } from "@/types/work";
import type { WorkPersonnel, WorkTaskAssignmentDraft } from "@/types/work-arrangement";
import { DatePicker, message, Modal, Select as AntSelect, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { ChevronLeft, ChevronRight, Loader2, Plus, Save, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chip, filterSelectOptionByLabel } from "./shared";
import { PersonnelPicker } from "./WorkAssignmentSelectManager";

const NONE_VALUE = "__none__";
const EMPTY_HALF_DAY = new Set<number>();

const sortByName = (a: Work, b: Work) =>
  a.work_name.localeCompare(b.work_name, "vi", { numeric: true, sensitivity: "base" });

const uniquePositiveIds = (ids: number[]) =>
  Array.from(new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)));

export default function WorkTaskSelectManager({
  active = true,
  compact = false,
  todayOnly = false,
  selectedDate: controlledSelectedDate,
  onSelectedDateChange,
  hideDateControls = false,
  onDirtyChange,
}: {
  active?: boolean;
  compact?: boolean;
  todayOnly?: boolean;
  selectedDate?: Dayjs;
  onSelectedDateChange?: (date: Dayjs) => void;
  hideDateControls?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("WorkTaskPage");
  const tAssign = useTranslations("WorkAssignmentPage");
  const { hasActionAccess } = usePermissions();
  const canUpdate = hasActionAccess(SIDEBAR.WORKS, PERMISSIONS.WORKS.UPDATE);
  const canCreate = hasActionAccess(SIDEBAR.WORKS, PERMISSIONS.WORKS.CREATE);

  const [internalSelectedDate, setInternalSelectedDate] = useState<Dayjs>(dayjs());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  const [personnel, setPersonnel] = useState<WorkPersonnel[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [draft, setDraft] = useState<WorkTaskAssignmentDraft>({
    work_date: dayjs().format("YYYY-MM-DD"),
    task_assignments: [],
  });
  const [addedParentIds, setAddedParentIds] = useState<Set<number>>(new Set());
  const [selectedParentId, setSelectedParentId] = useState<string>(NONE_VALUE);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<number>(0);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const onDirtyChangeRef = useRef(onDirtyChange);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

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
  const prefilledTitle = draft.prefilled_from_date
    ? t("prefilledFromDate", { date: dayjs(draft.prefilled_from_date).format("DD/MM/YYYY") })
    : "";
  const prefilledTab = draft.prefilled_from_date
    ? t("prefilledTab", { date: dayjs(draft.prefilled_from_date).format("DD/MM") })
    : "";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrap = await workTaskApi.getBootstrap(workDate);
      setPersonnel(bootstrap.personnel);
      setWorks(bootstrap.works);
      setDraft(bootstrap.draft);
      setAddedParentIds(new Set());
      setSelectedParentId(NONE_VALUE);
      setDirtyState(false);
      onDirtyChangeRef.current?.(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("loadFailed")}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [t, workDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
  const worksById = useMemo(() => new Map(works.map((work) => [work.work_id, work])), [works]);
  const parentWorks = useMemo(
    () => works.filter((work) => !work.work_root).sort(sortByName),
    [works]
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<number, Work[]>();
    for (const work of works) {
      if (work.work_root) {
        const list = map.get(work.work_root) || [];
        list.push(work);
        map.set(work.work_root, list);
      }
    }
    for (const list of map.values()) list.sort(sortByName);
    return map;
  }, [works]);

  const usersByWork = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const task of draft.task_assignments) {
      if (task.user_ids.length > 0) map.set(task.work_id, task.user_ids);
    }
    return map;
  }, [draft.task_assignments]);

  const assignedUserIds = useMemo(() => {
    const set = new Set<number>();
    for (const task of draft.task_assignments) for (const id of task.user_ids) set.add(id);
    return set;
  }, [draft.task_assignments]);

  const shownParentIds = useMemo(() => {
    const set = new Set<number>(addedParentIds);
    for (const task of draft.task_assignments) {
      if (task.user_ids.length === 0) continue;
      const work = worksById.get(task.work_id);
      if (work) set.add(work.work_root ? work.work_root : work.work_id);
    }
    return set;
  }, [addedParentIds, draft.task_assignments, worksById]);

  const shownParents = useMemo(
    () => parentWorks.filter((parent) => shownParentIds.has(parent.work_id)),
    [parentWorks, shownParentIds]
  );

  const selectableParents = useMemo(
    () => parentWorks.filter((parent) => !shownParentIds.has(parent.work_id)),
    [parentWorks, shownParentIds]
  );

  const addParent = useCallback(() => {
    const parentId = Number(selectedParentId);
    if (!parentId) return;
    setAddedParentIds((prev) => new Set(prev).add(parentId));
    setSelectedParentId(NONE_VALUE);
  }, [selectedParentId]);

  const removeParent = useCallback(
    (parentId: number) => {
      const childIds = new Set((childrenByParent.get(parentId) || []).map((work) => work.work_id));
      childIds.add(parentId);
      setAddedParentIds((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
      setDraft((current) => ({
        ...current,
        task_assignments: current.task_assignments.filter((task) => !childIds.has(task.work_id)),
      }));
      setDirtyState(true);
    },
    [childrenByParent]
  );

  const setWorkUsers = useCallback((workId: number, nextIdsRaw: number[]) => {
    const current = draftRef.current;
    const currentIds =
      current.task_assignments.find((task) => task.work_id === workId)?.user_ids || [];
    const nextIds = uniquePositiveIds(nextIdsRaw);
    const addedIds = nextIds.filter((id) => !currentIds.includes(id));
    const addedSet = new Set(addedIds);

    const nextAssignments = current.task_assignments
      .map((task) => ({
        ...task,
        user_ids:
          task.work_id === workId
            ? nextIds
            : task.user_ids.filter((userId) => !addedSet.has(userId)),
      }))
      .filter((task) => task.user_ids.length > 0 && task.work_id !== workId);

    if (nextIds.length > 0) {
      nextAssignments.push({
        assignment_id:
          current.task_assignments.find((task) => task.work_id === workId)?.assignment_id ||
          `work:${workId}`,
        work_id: workId,
        user_ids: nextIds,
      });
    }

    setDraft({ ...current, task_assignments: nextAssignments });
    setDirtyState(true);
  }, []);

  const handleQuickCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await workApi.create({ work_name: name, work_root: newParent || null });
      const res = await workApi.list({ limit: 1000 });
      setWorks(res.data.filter((work) => !work.delete_flag));
      setNewName("");
      message.success(t("createSuccess"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("createFailed")}: ${msg}`);
    } finally {
      setCreating(false);
    }
  }, [creating, newName, newParent, t]);

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
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!todayOnly && !hideDateControls && (
        <div className="flex flex-wrap items-center gap-3 border border-slate-300 bg-white px-3 py-2">
          {dateControls}
        </div>
      )}

      <section className="overflow-hidden border border-slate-300 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50 px-2.5 py-1.5">
          <AntSelect
            showSearch
            allowClear
            value={selectedParentId === NONE_VALUE ? undefined : selectedParentId}
            onChange={(value) => setSelectedParentId(value || NONE_VALUE)}
            placeholder={t("selectWorkToAdd")}
            options={selectableParents.map((work) => ({
              value: String(work.work_id),
              label: work.work_name,
            }))}
            filterOption={filterSelectOptionByLabel}
            className="w-[280px] [&_.ant-select-selector]:!rounded-none"
          />
          <Button
            type="button"
            size="sm"
            onClick={addParent}
            disabled={!canUpdate || selectedParentId === NONE_VALUE}
            className="h-8 rounded-none bg-slate-900 font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={15} />
            {t("addWork")}
          </Button>
          {canCreate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setQuickCreateOpen(true)}
              className="h-8 rounded-none border-slate-300 font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Plus size={15} />
              {t("quickCreate")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!canUpdate || saving}
            className="ml-auto h-8 rounded-none bg-teal-600 font-semibold text-white hover:bg-teal-700"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
            {t("save")}
            {prefilledTitle && !saving && (
              <span title={prefilledTitle} aria-label={prefilledTitle}>
                <Star size={13} className="fill-amber-200 text-amber-200" />
              </span>
            )}
            {dirty && !saving && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-white/90" />}
          </Button>
          {prefilledTab && (
            <span
              title={prefilledTitle}
              className="inline-flex h-8 items-center border border-amber-300 bg-amber-50 px-2 text-xs font-extrabold text-amber-700 shadow-sm"
            >
              {prefilledTab}
            </span>
          )}
        </div>

        <Modal
          open={quickCreateOpen}
          onCancel={() => setQuickCreateOpen(false)}
          title={t("quickCreateTitle")}
          footer={null}
          width={440}
        >
          <div className="space-y-3 pt-1">
            <Input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleQuickCreate();
              }}
              placeholder={t("newWorkPlaceholder")}
              className="h-9 rounded-none border-slate-300 bg-white shadow-none focus-visible:ring-teal-500/20"
            />
            <AntSelect
              showSearch
              value={String(newParent)}
              onChange={(value) => setNewParent(Number(value))}
              options={[
                { value: "0", label: t("rootNone") },
                ...parentWorks.map((parent) => ({
                  value: String(parent.work_id),
                  label: parent.work_name,
                })),
              ]}
              filterOption={filterSelectOptionByLabel}
              className="w-full [&_.ant-select-selector]:!rounded-none"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={handleQuickCreate}
                disabled={!newName.trim() || creating}
                className="h-9 rounded-none bg-teal-600 font-semibold text-white hover:bg-teal-700"
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus size={15} />}
                {t("quickCreate")}
              </Button>
            </div>
          </div>
        </Modal>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <th className="w-12 border border-slate-300 px-2 py-1.5 text-center">#</th>
                <th className="w-[280px] border border-slate-300 px-2 py-1.5 text-left">
                  {t("catalogTitle")}
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  {tAssign("selectPersonnel")}
                </th>
                <th className="w-12 border border-slate-300 px-2 py-1.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {shownParents.length === 0 ? (
                <tr>
                  <td className="border border-slate-200 px-2 py-3 text-center text-slate-400">
                    1
                  </td>
                  <td
                    colSpan={3}
                    className="border border-slate-200 px-3 py-3 text-sm text-slate-400"
                  >
                    {t("noWorkGroups")}
                  </td>
                </tr>
              ) : (
                shownParents.flatMap((parent, parentIndex) => {
                  const tasks = (childrenByParent.get(parent.work_id) || []).length
                    ? childrenByParent.get(parent.work_id)!
                    : [parent];
                  return [
                    <tr key={`parent-${parent.work_id}`} className="bg-slate-50">
                      <td className="border border-slate-200 px-2 py-1.5 text-center text-xs font-semibold text-slate-500">
                        {parentIndex + 1}
                      </td>
                      <td
                        colSpan={2}
                        className="border border-slate-200 px-2 py-1.5 font-bold text-slate-900"
                      >
                        <span className="inline-flex items-center gap-2">
                          {parent.work_name}
                          <Chip tone="sky">{tasks.length}</Chip>
                        </span>
                      </td>
                      <td className="border border-slate-200 p-0 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!canUpdate}
                          onClick={() => removeParent(parent.work_id)}
                          className="h-9 rounded-none px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </td>
                    </tr>,
                    ...tasks.map((task, taskIndex) => (
                      <tr key={`task-${task.work_id}`} className="h-10">
                        <td className="border border-slate-200 bg-slate-50 px-2 text-center text-xs text-slate-400">
                          {parentIndex + 1}.{taskIndex + 1}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 font-medium text-slate-700">
                          {task.work_name}
                        </td>
                        <td className="border border-slate-200 p-0">
                          <PersonnelPicker
                            people={personnel}
                            selectedIds={usersByWork.get(task.work_id) || []}
                            assignedUserIds={assignedUserIds}
                            halfDaySet={EMPTY_HALF_DAY}
                            disabled={!canUpdate}
                            placeholder={tAssign("selectPersonnel")}
                            emptyLabel={tAssign("noPersonnelOptions")}
                            onChange={(ids) => setWorkUsers(task.work_id, ids)}
                          />
                        </td>
                        <td className="border border-slate-200 bg-slate-50" />
                      </tr>
                    )),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
