"use client";

import { Button } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import type { Work } from "@/types/work";
import type { WorkPersonnel, WorkTaskAssignmentDraft } from "@/types/work-arrangement";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Empty } from "antd";
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Chip,
  DragPersonPreview,
  parseDragId,
  PERSONNEL_POOL_ID,
  PersonnelCard,
  SharedPersonnelPool,
} from "./shared";

const WORK_DRAG_PREFIX = "work:";
const TASK_SLOT_PREFIX = "task:";
const WORKTASK_BOARD_ID = "worktask_board";

const EMPTY_HALF_DAY = new Set<number>();

const sortByName = (a: Work, b: Work) =>
  a.work_name.localeCompare(b.work_name, "vi", { numeric: true, sensitivity: "base" });

export interface WorkTaskBoardProps {
  works: Work[];
  personnel: WorkPersonnel[];
  draft: WorkTaskAssignmentDraft;
  saving: boolean;
  dirty: boolean;
  creating: boolean;
  onChangeDraft: (updater: (current: WorkTaskAssignmentDraft) => WorkTaskAssignmentDraft) => void;
  onSave: () => void;
  onCreateWork: (payload: { work_name: string; work_root: number | null }) => void;
}

export default function WorkTaskBoard({
  works,
  personnel,
  draft,
  saving,
  dirty,
  creating,
  onChangeDraft,
  onSave,
  onCreateWork,
}: WorkTaskBoardProps) {
  const t = useTranslations("WorkTaskPage");
  const { hasActionAccess } = usePermissions();
  const canUpdate = hasActionAccess(SIDEBAR.WORKS, PERMISSIONS.WORKS.UPDATE);
  const canCreate = hasActionAccess(SIDEBAR.WORKS, PERMISSIONS.WORKS.CREATE);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState<number | "all">("all");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [addedParentIds, setAddedParentIds] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<number>(0);

  // Đổi ngày → bỏ các "công việc cha" đã kéo vào của ngày trước (group có dữ liệu vẫn hiện theo draft mới).
  useEffect(() => {
    setAddedParentIds(new Set());
  }, [draft.work_date]);

  const worksById = useMemo(() => new Map(works.map((w) => [w.work_id, w])), [works]);
  const personnelById = useMemo(() => new Map(personnel.map((p) => [p.user_id, p])), [personnel]);

  const parentWorks = useMemo(() => works.filter((w) => !w.work_root).sort(sortByName), [works]);

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

  const availablePersonnel = useMemo(
    () => personnel.filter((p) => !assignedUserIds.has(p.user_id)),
    [personnel, assignedUserIds]
  );

  const skillOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const person of personnel) {
      if (person.skill_id && person.skill_name) map.set(person.skill_id, person.skill_name);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [personnel]);

  // Parent có việc đã gán (hoặc chính nó được gán) → luôn hiện; cộng parent user kéo vào.
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

  const assignUserToWork = useCallback(
    (workId: number, userId: number) => {
      onChangeDraft((current) => {
        const others = current.task_assignments
          .map((task) => ({ ...task, user_ids: task.user_ids.filter((id) => id !== userId) }))
          .filter((task) => task.user_ids.length > 0 && task.work_id !== workId);
        const target = current.task_assignments.find((task) => task.work_id === workId);
        const targetUsers = (target ? target.user_ids.filter((id) => id !== userId) : []).concat(
          userId
        );
        return {
          ...current,
          task_assignments: [
            ...others,
            {
              assignment_id: target?.assignment_id || `${WORK_DRAG_PREFIX}${workId}`,
              work_id: workId,
              user_ids: targetUsers,
            },
          ],
        };
      });
    },
    [onChangeDraft]
  );

  const removeUserFromWork = useCallback(
    (userId: number) => {
      onChangeDraft((current) => ({
        ...current,
        task_assignments: current.task_assignments
          .map((task) => ({ ...task, user_ids: task.user_ids.filter((id) => id !== userId) }))
          .filter((task) => task.user_ids.length > 0),
      }));
    },
    [onChangeDraft]
  );

  const removeParentGroup = useCallback(
    (parentId: number) => {
      const childIds = new Set((childrenByParent.get(parentId) || []).map((w) => w.work_id));
      childIds.add(parentId);
      setAddedParentIds((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
      onChangeDraft((current) => ({
        ...current,
        task_assignments: current.task_assignments.filter((task) => !childIds.has(task.work_id)),
      }));
    },
    [childrenByParent, onChangeDraft]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const target = String(event.over?.id || "");
      if (!canUpdate) return;

      if (activeId.startsWith(WORK_DRAG_PREFIX)) {
        const workId = Number(activeId.slice(WORK_DRAG_PREFIX.length));
        if (workId > 0 && target === WORKTASK_BOARD_ID) {
          setAddedParentIds((prev) => (prev.has(workId) ? prev : new Set(prev).add(workId)));
        }
        return;
      }

      const person = parseDragId(activeId);
      if (!person || person.type !== "person") return;
      if (target === PERSONNEL_POOL_ID) {
        removeUserFromWork(person.id);
        return;
      }
      if (target.startsWith(TASK_SLOT_PREFIX)) {
        const workId = Number(target.slice(TASK_SLOT_PREFIX.length));
        if (workId > 0) assignUserToWork(workId, person.id);
      }
    },
    [assignUserToWork, canUpdate, removeUserFromWork]
  );

  const handleQuickCreate = () => {
    const name = newName.trim();
    if (!name || creating) return;
    onCreateWork({ work_name: name, work_root: newParent || null });
    setNewName("");
  };

  const activeWorkId =
    activeDragId && activeDragId.startsWith(WORK_DRAG_PREFIX)
      ? Number(activeDragId.slice(WORK_DRAG_PREFIX.length))
      : 0;
  const dragWork = activeWorkId ? worksById.get(activeWorkId) : undefined;
  const activePerson = activeDragId ? parseDragId(activeDragId) : null;
  const dragPerson =
    activePerson?.type === "person" ? personnelById.get(activePerson.id) : undefined;

  return (
    <div className="pb-24 lg:pb-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-teal-500" />
            {t("assignedTasks")}
            <b className="text-slate-900">{usersByWork.size}</b>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("assignedPersonnel")}
            <b className="text-slate-900">{assignedUserIds.size}</b>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={!canUpdate || saving}
            className="h-9 bg-teal-600 font-semibold text-white hover:bg-teal-700"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save size={15} />}
            {t("save")}
            {dirty && !saving && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-white/90" />}
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(event) => setActiveDragId(String(event.active.id))}
        onDragEnd={(event) => {
          handleDragEnd(event);
          setActiveDragId(null);
        }}
        onDragCancel={() => setActiveDragId(null)}
      >
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(220px,280px)_minmax(240px,300px)_minmax(0,1fr)]">
          <section className="flex max-h-[480px] flex-col rounded-lg border border-slate-200 bg-white p-3 lg:max-h-[600px]">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("catalogTitle")}
              </div>
              <Chip>{parentWorks.length}</Chip>
            </div>

            {canCreate && (
              <div className="mb-3 shrink-0 space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-2">
                <ShadcnInput
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleQuickCreate();
                  }}
                  placeholder={t("newWorkPlaceholder")}
                  className="h-9 border-slate-200 bg-white text-sm shadow-none focus-visible:ring-teal-500/20"
                />
                <Select
                  value={String(newParent)}
                  onValueChange={(value) => setNewParent(Number(value))}
                >
                  <SelectTrigger className="h-9 w-full border-slate-200 bg-white text-slate-700 shadow-none focus:ring-teal-500/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("rootNone")}</SelectItem>
                    {parentWorks.map((parent) => (
                      <SelectItem key={parent.work_id} value={String(parent.work_id)}>
                        {parent.work_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleQuickCreate}
                  disabled={!newName.trim() || creating}
                  className="h-9 w-full bg-teal-600 font-semibold text-white hover:bg-teal-700"
                >
                  {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus size={15} />}
                  {t("quickCreate")}
                </Button>
              </div>
            )}

            <div className="min-h-0 overflow-y-auto pr-1">
              {parentWorks.length === 0 ? (
                <div className="flex min-h-[160px] items-center justify-center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("catalogEmpty")} />
                </div>
              ) : (
                <div className="space-y-2">
                  {parentWorks.map((work) => (
                    <WorkCatalogCard
                      key={work.work_id}
                      work={work}
                      childCount={(childrenByParent.get(work.work_id) || []).length}
                      added={shownParentIds.has(work.work_id)}
                      addedLabel={t("added")}
                      disabled={!canUpdate}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <SharedPersonnelPool
            title={t("pool")}
            emptyLabel={t("emptyPool")}
            people={availablePersonnel}
            halfDaySet={EMPTY_HALF_DAY}
            disabled={!canUpdate}
            search={personnelSearch}
            searchPlaceholder={t("personnelSearchPlaceholder")}
            onSearchChange={setPersonnelSearch}
            skillFilter={skillFilter}
            skillOptions={skillOptions}
            allSkillsLabel={t("allSkills")}
            onSkillFilterChange={setSkillFilter}
            onToggleSkill={(skillId) =>
              setSkillFilter((prev) => (prev === skillId ? "all" : (skillId ?? "all")))
            }
          />

          <WorkTaskBoardColumn
            title={t("boardTitle")}
            dropHint={t("workDropHint")}
            taskDropHint={t("personDropHint")}
            parents={shownParents}
            childrenByParent={childrenByParent}
            usersByWork={usersByWork}
            personnelById={personnelById}
            disabled={!canUpdate}
            onRemoveParent={removeParentGroup}
            onRemoveUser={removeUserFromWork}
          />
        </div>

        <DragOverlay>
          {dragWork ? (
            <div className="rounded-md border border-slate-300 bg-white p-2.5 shadow-xl">
              <div className="text-sm font-semibold text-slate-800">{dragWork.work_name}</div>
            </div>
          ) : dragPerson ? (
            <DragPersonPreview person={dragPerson} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function WorkCatalogCard({
  work,
  childCount,
  added,
  addedLabel,
  disabled,
}: {
  work: Work;
  childCount: number;
  added: boolean;
  addedLabel: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${WORK_DRAG_PREFIX}${work.work_id}`,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border bg-white p-2.5 transition ${
        added ? "border-teal-300 bg-teal-50/40" : "border-slate-200 hover:border-slate-300"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab border-0 bg-transparent p-0 text-slate-300 hover:text-slate-500"
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-800">{work.work_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {childCount > 0 && <Chip tone="sky">{childCount}</Chip>}
            {added && <Chip tone="teal">{addedLabel}</Chip>}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkTaskBoardColumn({
  title,
  dropHint,
  taskDropHint,
  parents,
  childrenByParent,
  usersByWork,
  personnelById,
  disabled,
  onRemoveParent,
  onRemoveUser,
}: {
  title: string;
  dropHint: string;
  taskDropHint: string;
  parents: Work[];
  childrenByParent: Map<number, Work[]>;
  usersByWork: Map<number, number[]>;
  personnelById: Map<number, WorkPersonnel>;
  disabled: boolean;
  onRemoveParent: (parentId: number) => void;
  onRemoveUser: (userId: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: WORKTASK_BOARD_ID, disabled });

  return (
    <section
      ref={setNodeRef}
      className={`flex max-h-[480px] flex-col rounded-lg border bg-white p-3 lg:max-h-[600px] ${
        isOver ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200"
      }`}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Briefcase size={16} className="text-slate-500" />
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {title}
          </div>
        </div>
        <Chip tone={parents.length > 0 ? "teal" : "slate"}>{parents.length}</Chip>
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        {parents.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-400">
            {dropHint}
          </div>
        ) : (
          <div className="space-y-3">
            {parents.map((parent) => (
              <WorkTaskParentGroup
                key={parent.work_id}
                parent={parent}
                childWorks={childrenByParent.get(parent.work_id) || []}
                usersByWork={usersByWork}
                personnelById={personnelById}
                disabled={disabled}
                taskDropHint={taskDropHint}
                onRemoveParent={onRemoveParent}
                onRemoveUser={onRemoveUser}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function WorkTaskParentGroup({
  parent,
  childWorks,
  usersByWork,
  personnelById,
  disabled,
  taskDropHint,
  onRemoveParent,
  onRemoveUser,
}: {
  parent: Work;
  childWorks: Work[];
  usersByWork: Map<number, number[]>;
  personnelById: Map<number, WorkPersonnel>;
  disabled: boolean;
  taskDropHint: string;
  onRemoveParent: (parentId: number) => void;
  onRemoveUser: (userId: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const tasks = childWorks.length > 0 ? childWorks : [parent];
  const assignedCount = tasks.reduce(
    (sum, task) => sum + (usersByWork.get(task.work_id)?.length || 0),
    0
  );

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <div className="truncate font-semibold text-slate-900">{parent.work_name}</div>
          {collapsed && assignedCount > 0 && <Chip tone="emerald">{assignedCount}</Chip>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemoveParent(parent.work_id)}
          disabled={disabled}
          className="h-8 px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <X size={16} />
        </Button>
      </div>
      {!collapsed && (
        <div className="space-y-2 p-3">
          {tasks.map((task) => (
            <TaskSlot
              key={task.work_id}
              work={task}
              showLabel={childWorks.length > 0}
              people={(usersByWork.get(task.work_id) || [])
                .map((id) => personnelById.get(id))
                .filter((person): person is WorkPersonnel => Boolean(person))}
              disabled={disabled}
              dropHint={taskDropHint}
              onRemoveUser={onRemoveUser}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskSlot({
  work,
  showLabel,
  people,
  disabled,
  dropHint,
  onRemoveUser,
}: {
  work: Work;
  showLabel: boolean;
  people: WorkPersonnel[];
  disabled: boolean;
  dropHint: string;
  onRemoveUser: (userId: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${TASK_SLOT_PREFIX}${work.work_id}`,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border p-2 transition-colors ${
        isOver ? "border-teal-500 bg-teal-50" : "border-dashed border-slate-200 bg-slate-50/60"
      }`}
    >
      {showLabel && (
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {work.work_name}
        </div>
      )}
      {people.length === 0 ? (
        <div className="flex min-h-[44px] items-center justify-center text-center text-xs text-slate-400">
          {dropHint}
        </div>
      ) : (
        <div className="space-y-2">
          {people.map((person) => (
            <PersonnelCard
              key={person.user_id}
              person={person}
              halfDay={false}
              disabled={disabled}
              compact
              onRemove={() => onRemoveUser(person.user_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
