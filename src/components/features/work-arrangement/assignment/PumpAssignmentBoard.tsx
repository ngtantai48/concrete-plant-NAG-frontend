"use client";

import { Button } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import { createEmptyPumpRoles, WORK_PUMP_ROLES } from "@/services/work-arrangement.service";
import type {
  WorkAssignmentDraft,
  WorkPersonnel,
  WorkPumpRoleKey,
  WorkVehicle,
} from "@/types/work-arrangement";
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
  ChevronDown,
  ChevronRight,
  Filter,
  GripVertical,
  Loader2,
  Save,
  Search,
  Truck,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  Chip,
  CollapseButton,
  CollapsedSidebar,
  DragPersonPreview,
  getVehicleLabel,
  normalizeSearchText,
  parseDragId,
  PERSONNEL_POOL_ID,
  PersonnelCard,
  SharedPersonnelPool,
  VEHICLE_DRAG_PREFIX,
} from "./shared";

const PUMP_BOARD_ID = "pump_board";
const SLOT_DROP_PREFIX = "slot:";

const removeUserFromAssignments = (
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

const parseSlotId = (id: string) => {
  if (!id.startsWith(SLOT_DROP_PREFIX)) return null;
  const parts = id.slice(SLOT_DROP_PREFIX.length).split(":");
  const role = parts.pop();
  const assignmentId = parts.join(":");

  if (!assignmentId || !WORK_PUMP_ROLES.some((item) => item.key === role)) return null;
  return { assignmentId, role: role as WorkPumpRoleKey };
};

export interface PumpAssignmentBoardProps {
  personnel: WorkPersonnel[];
  assignedUserIds: Set<number>; // union toàn cục (cả 2 board) — để pool dùng chung
  vehicles: WorkVehicle[]; // xe non-X
  halfDaySet: Set<number>;
  draft: WorkAssignmentDraft;
  saving: boolean;
  dirty: boolean;
  onChangeDraft: (updater: (current: WorkAssignmentDraft) => WorkAssignmentDraft) => void;
  onSave: () => void;
}

export default function PumpAssignmentBoard({
  personnel,
  assignedUserIds,
  vehicles,
  halfDaySet,
  draft,
  saving,
  dirty,
  onChangeDraft,
  onSave,
}: PumpAssignmentBoardProps) {
  const t = useTranslations("WorkAssignmentPage");
  const { hasActionAccess } = usePermissions();
  const canUpdate = hasActionAccess(
    SIDEBAR.WORK_ARRANGEMENTS,
    PERMISSIONS.WORK_ARRANGEMENTS.UPDATE
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState<number | "all">("all");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<number | "all">("all");
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState<string | "all">("all");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [vehiclePoolCollapsed, setVehiclePoolCollapsed] = useState(false);
  const [personnelPoolCollapsed, setPersonnelPoolCollapsed] = useState(false);

  const personnelById = useMemo(() => new Map(personnel.map((p) => [p.user_id, p])), [personnel]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.vehicle_id, v])), [vehicles]);

  const assignedVehicleIds = useMemo(
    () => new Set(draft.pump_assignments.map((a) => a.vehicle_id)),
    [draft.pump_assignments]
  );

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

  const vehicleTypeOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const vehicle of vehicles) {
      if (assignedVehicleIds.has(vehicle.vehicle_id)) continue;
      if (vehicle.vehicle_type_id != null) {
        map.set(
          vehicle.vehicle_type_id,
          vehicle.vehicle_type_name || vehicle.vehicle_type_symbol || `#${vehicle.vehicle_type_id}`
        );
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [vehicles, assignedVehicleIds]);

  const vehicleStatusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const vehicle of vehicles) {
      if (assignedVehicleIds.has(vehicle.vehicle_id)) continue;
      if (vehicle.vehicle_status) set.add(vehicle.vehicle_status);
    }
    return Array.from(set);
  }, [vehicles, assignedVehicleIds]);

  const unassignedVehicles = useMemo(() => {
    const keyword = normalizeSearchText(vehicleSearch);
    return vehicles.filter((vehicle) => {
      if (assignedVehicleIds.has(vehicle.vehicle_id)) return false;
      if (vehicleTypeFilter !== "all" && vehicle.vehicle_type_id !== vehicleTypeFilter)
        return false;
      if (vehicleStatusFilter !== "all" && vehicle.vehicle_status !== vehicleStatusFilter)
        return false;
      if (!keyword) return true;
      return normalizeSearchText(
        [
          vehicle.vehicle_license_plate,
          vehicle.vehicle_name,
          vehicle.vehicle_type_name,
          vehicle.vehicle_type_symbol,
          vehicle.vehicle_status,
        ].join(" ")
      ).includes(keyword);
    });
  }, [assignedVehicleIds, vehicleSearch, vehicles, vehicleTypeFilter, vehicleStatusFilter]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const active = parseDragId(String(event.active.id));
      const target = String(event.over?.id || "");
      if (!canUpdate || !active || !target) return;

      onChangeDraft((current) => {
        if (active.type === "vehicle") {
          const canDropVehicle = target === PUMP_BOARD_ID || target.startsWith(SLOT_DROP_PREFIX);
          if (
            !canDropVehicle ||
            current.pump_assignments.some((item) => item.vehicle_id === active.id)
          ) {
            return current;
          }

          return {
            ...current,
            pump_assignments: [
              ...current.pump_assignments,
              {
                assignment_id: `local:${active.id}:${Date.now()}`,
                vehicle_id: active.id,
                roles: createEmptyPumpRoles(),
              },
            ],
          };
        }

        const nextAssignments = removeUserFromAssignments(current.pump_assignments, active.id);
        if (target === PERSONNEL_POOL_ID) {
          return { ...current, pump_assignments: nextAssignments };
        }

        const slot = parseSlotId(target);
        if (!slot) return current;

        return {
          ...current,
          pump_assignments: nextAssignments.map((assignment) =>
            assignment.assignment_id === slot.assignmentId
              ? {
                  ...assignment,
                  roles: {
                    ...assignment.roles,
                    [slot.role]: [...assignment.roles[slot.role], active.id],
                  },
                }
              : assignment
          ),
        };
      });
    },
    [canUpdate, onChangeDraft]
  );

  const removeVehicleAssignment = useCallback(
    (assignmentId: string) => {
      onChangeDraft((current) => ({
        ...current,
        pump_assignments: current.pump_assignments.filter(
          (assignment) => assignment.assignment_id !== assignmentId
        ),
      }));
    },
    [onChangeDraft]
  );

  const removeUser = useCallback(
    (userId: number) => {
      onChangeDraft((current) => ({
        ...current,
        pump_assignments: removeUserFromAssignments(current.pump_assignments, userId),
      }));
    },
    [onChangeDraft]
  );

  const toggleVehicleType = useCallback((typeId?: number | null) => {
    if (typeId == null) return;
    setVehicleTypeFilter((prev) => (prev === typeId ? "all" : typeId));
  }, []);
  const toggleVehicleStatus = useCallback((status?: string | null) => {
    if (!status) return;
    setVehicleStatusFilter((prev) => (prev === status ? "all" : status));
  }, []);
  const toggleSkill = useCallback((skillId?: number | null) => {
    if (skillId == null) return;
    setSkillFilter((prev) => (prev === skillId ? "all" : skillId));
  }, []);

  const hasVehicleFilter = vehicleTypeFilter !== "all" || vehicleStatusFilter !== "all";
  const clearVehicleFilters = useCallback(() => {
    setVehicleTypeFilter("all");
    setVehicleStatusFilter("all");
  }, []);

  const assignedVehiclesCount = draft.pump_assignments.length;
  const assignedPersonnelCount = useMemo(
    () => new Set(draft.pump_assignments.flatMap((a) => Object.values(a.roles).flat())).size,
    [draft.pump_assignments]
  );

  const activeDrag = activeDragId ? parseDragId(activeDragId) : null;
  const dragVehicle = activeDrag?.type === "vehicle" ? vehicleById.get(activeDrag.id) : undefined;
  const dragPerson = activeDrag?.type === "person" ? personnelById.get(activeDrag.id) : undefined;

  const gridColsClass =
    vehiclePoolCollapsed && personnelPoolCollapsed
      ? "lg:grid-cols-[48px_48px_minmax(0,1fr)]"
      : vehiclePoolCollapsed
        ? "lg:grid-cols-[48px_minmax(240px,300px)_minmax(0,1fr)]"
        : personnelPoolCollapsed
          ? "lg:grid-cols-[minmax(220px,260px)_48px_minmax(0,1fr)]"
          : "lg:grid-cols-[minmax(220px,260px)_minmax(240px,300px)_minmax(0,1fr)]";

  return (
    <div className="pb-24 lg:pb-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-teal-500" />
            {t("assignedVehicles")}
            <b className="text-slate-900">{assignedVehiclesCount}</b>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("assignedPersonnel")}
            <b className="text-slate-900">{assignedPersonnelCount}</b>
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
        <div className={`grid grid-cols-1 items-start gap-3 ${gridColsClass}`}>
          {vehiclePoolCollapsed ? (
            <CollapsedSidebar
              title={t("pumpVehiclePool")}
              count={unassignedVehicles.length}
              onExpand={() => setVehiclePoolCollapsed(false)}
            />
          ) : (
            <VehiclePool
              title={t("pumpVehiclePool")}
              emptyLabel={t("emptyVehicles")}
              vehicles={unassignedVehicles}
              disabled={!canUpdate}
              searchValue={vehicleSearch}
              searchPlaceholder={t("vehicleSearchPlaceholder")}
              onSearchChange={setVehicleSearch}
              typeFilter={vehicleTypeFilter}
              statusFilter={vehicleStatusFilter}
              typeOptions={vehicleTypeOptions}
              statusOptions={vehicleStatusOptions}
              onToggleType={toggleVehicleType}
              onToggleStatus={toggleVehicleStatus}
              hasActiveFilter={hasVehicleFilter}
              onClearFilters={clearVehicleFilters}
              clearFilterLabel={t("clearFilter")}
              onCollapse={() => setVehiclePoolCollapsed(true)}
            />
          )}

          {personnelPoolCollapsed ? (
            <CollapsedSidebar
              title={t("pool")}
              count={availablePersonnel.length}
              onExpand={() => setPersonnelPoolCollapsed(false)}
              droppableId={PERSONNEL_POOL_ID}
            />
          ) : (
            <SharedPersonnelPool
              title={t("pool")}
              emptyLabel={t("emptyPool")}
              people={availablePersonnel}
              halfDaySet={halfDaySet}
              disabled={!canUpdate}
              search={personnelSearch}
              searchPlaceholder={t("personnelSearchPlaceholder")}
              onSearchChange={setPersonnelSearch}
              skillFilter={skillFilter}
              skillOptions={skillOptions}
              allSkillsLabel={t("allSkills")}
              onSkillFilterChange={setSkillFilter}
              onToggleSkill={toggleSkill}
              onCollapse={() => setPersonnelPoolCollapsed(true)}
            />
          )}

          <PumpBoardColumn
            title={t("pumpBoard")}
            dropHint={t("vehicleDropHint")}
            assignments={draft.pump_assignments}
            vehicleById={vehicleById}
            personnelById={personnelById}
            halfDaySet={halfDaySet}
            disabled={!canUpdate}
            onRemoveVehicle={removeVehicleAssignment}
            onRemoveUser={removeUser}
          />
        </div>

        <DragOverlay>
          {dragVehicle ? (
            <div className="rounded-md border border-slate-300 bg-white p-2.5 shadow-xl">
              <div className="text-sm font-semibold text-slate-800">
                {getVehicleLabel(dragVehicle)}
              </div>
              {dragVehicle.vehicle_type_name && (
                <div className="mt-0.5 text-xs text-slate-500">{dragVehicle.vehicle_type_name}</div>
              )}
            </div>
          ) : dragPerson ? (
            <DragPersonPreview person={dragPerson} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function VehiclePool({
  title,
  emptyLabel,
  vehicles,
  disabled,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  typeFilter,
  statusFilter,
  onToggleType,
  onToggleStatus,
  typeOptions,
  statusOptions,
  hasActiveFilter,
  onClearFilters,
  clearFilterLabel,
  onCollapse,
}: {
  title: string;
  emptyLabel: string;
  vehicles: WorkVehicle[];
  disabled: boolean;
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  typeFilter: number | "all";
  statusFilter: string | "all";
  onToggleType: (typeId?: number | null) => void;
  onToggleStatus: (status?: string | null) => void;
  typeOptions: { value: number; label: string }[];
  statusOptions: string[];
  hasActiveFilter: boolean;
  onClearFilters: () => void;
  clearFilterLabel: string;
  onCollapse?: () => void;
}) {
  return (
    <section className="flex max-h-[480px] flex-col rounded-lg border border-slate-200 bg-white p-3 lg:max-h-[600px]">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        <div className="flex items-center gap-2">
          {hasActiveFilter && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={12} />
              {clearFilterLabel}
            </button>
          )}
          <Chip tone={vehicles.length > 0 ? "teal" : "slate"}>{vehicles.length}</Chip>
          {onCollapse && <CollapseButton title={title} onClick={onCollapse} />}
        </div>
      </div>

      <div className="mb-3 shrink-0 space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-2">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <ShadcnInput
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 border-slate-200 bg-white pl-9 text-sm shadow-none focus-visible:ring-teal-500/20"
          />
        </div>
        {(typeOptions.length > 1 || statusOptions.length > 1) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter size={13} className="shrink-0 text-slate-400" />
            {typeOptions.length > 1 &&
              typeOptions.map((option) => (
                <FilterPill
                  key={option.value}
                  tone="indigo"
                  active={typeFilter === option.value}
                  onClick={() => onToggleType(option.value)}
                >
                  {option.label}
                </FilterPill>
              ))}
            {typeOptions.length > 1 && statusOptions.length > 1 && (
              <span className="mx-0.5 h-4 w-px bg-slate-200" />
            )}
            {statusOptions.length > 1 &&
              statusOptions.map((status) => (
                <FilterPill
                  key={status}
                  tone="slate"
                  active={statusFilter === status}
                  onClick={() => onToggleStatus(status)}
                >
                  {status}
                </FilterPill>
              ))}
          </div>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        {vehicles.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyLabel} />
          </div>
        ) : (
          <div className="space-y-2">
            {vehicles.map((vehicle) => (
              <VehicleCard
                key={vehicle.vehicle_id}
                vehicle={vehicle}
                disabled={disabled}
                typeFilter={typeFilter}
                statusFilter={statusFilter}
                onToggleType={onToggleType}
                onToggleStatus={onToggleStatus}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PumpBoardColumn({
  title,
  dropHint,
  assignments,
  vehicleById,
  personnelById,
  halfDaySet,
  disabled,
  onRemoveVehicle,
  onRemoveUser,
}: {
  title: string;
  dropHint: string;
  assignments: WorkAssignmentDraft["pump_assignments"];
  vehicleById: Map<number, WorkVehicle>;
  personnelById: Map<number, WorkPersonnel>;
  halfDaySet: Set<number>;
  disabled: boolean;
  onRemoveVehicle: (assignmentId: string) => void;
  onRemoveUser: (userId: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: PUMP_BOARD_ID, disabled });

  return (
    <section
      ref={setNodeRef}
      className={`flex max-h-[480px] flex-col rounded-lg border bg-white p-3 lg:max-h-[600px] ${
        isOver ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200"
      }`}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-slate-500" />
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {title}
          </div>
        </div>
        <Chip tone={assignments.length > 0 ? "teal" : "slate"}>{assignments.length}</Chip>
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        {assignments.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-400">
            {dropHint}
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <PumpAssignmentRow
                key={assignment.assignment_id}
                assignment={assignment}
                vehicle={vehicleById.get(assignment.vehicle_id)}
                personnelById={personnelById}
                halfDaySet={halfDaySet}
                disabled={disabled}
                onRemoveVehicle={() => onRemoveVehicle(assignment.assignment_id)}
                onRemoveUser={onRemoveUser}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PumpAssignmentRow({
  assignment,
  vehicle,
  personnelById,
  halfDaySet,
  disabled,
  onRemoveVehicle,
  onRemoveUser,
}: {
  assignment: WorkAssignmentDraft["pump_assignments"][number];
  vehicle?: WorkVehicle;
  personnelById: Map<number, WorkPersonnel>;
  halfDaySet: Set<number>;
  disabled: boolean;
  onRemoveVehicle: () => void;
  onRemoveUser: (userId: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const peopleCount = WORK_PUMP_ROLES.reduce(
    (sum, role) => sum + (assignment.roles[role.key]?.length || 0),
    0
  );

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <Chip tone="indigo">{vehicle?.vehicle_type_symbol || "B"}</Chip>
          <div className="truncate font-semibold text-slate-900">
            {vehicle ? getVehicleLabel(vehicle) : `#${assignment.vehicle_id}`}
          </div>
          {collapsed && peopleCount > 0 && <Chip tone="emerald">{peopleCount}</Chip>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemoveVehicle}
          disabled={disabled}
          className="h-8 px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <X size={16} />
        </Button>
      </div>

      {!collapsed && (
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
          {WORK_PUMP_ROLES.map((role) => (
            <RoleSlot
              key={role.key}
              assignmentId={assignment.assignment_id}
              role={role}
              people={(assignment.roles[role.key] || [])
                .map((userId) => personnelById.get(userId))
                .filter((person): person is WorkPersonnel => Boolean(person))}
              halfDaySet={halfDaySet}
              disabled={disabled}
              onRemoveUser={onRemoveUser}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleSlot({
  assignmentId,
  role,
  people,
  halfDaySet,
  disabled,
  onRemoveUser,
}: {
  assignmentId: string;
  role: (typeof WORK_PUMP_ROLES)[number];
  people: WorkPersonnel[];
  halfDaySet: Set<number>;
  disabled: boolean;
  onRemoveUser: (userId: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${SLOT_DROP_PREFIX}${assignmentId}:${role.key}`,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[112px] rounded-md border p-2 transition-colors ${
        isOver ? "border-teal-500 bg-teal-50" : "border-dashed border-slate-200 bg-slate-50/60"
      }`}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {role.label}
      </div>
      {people.length === 0 ? (
        <div className="flex min-h-[64px] items-center justify-center text-lg font-light text-slate-300">
          +
        </div>
      ) : (
        <div className="space-y-2">
          {people.map((person) => (
            <PersonnelCard
              key={`${role.key}-${person.user_id}`}
              person={person}
              halfDay={halfDaySet.has(person.user_id)}
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

function FilterPill({
  children,
  tone,
  active,
  onClick,
}: {
  children: ReactNode;
  tone: "indigo" | "slate";
  active: boolean;
  onClick: () => void;
}) {
  const activeClass =
    tone === "indigo"
      ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
      : "border-slate-600 bg-slate-600 text-white shadow-sm";
  const idleClass =
    tone === "indigo"
      ? "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-none transition-colors ${
        active ? activeClass : idleClass
      }`}
    >
      {children}
    </button>
  );
}

function VehicleCard({
  vehicle,
  disabled,
  typeFilter,
  statusFilter,
  onToggleType,
  onToggleStatus,
}: {
  vehicle: WorkVehicle;
  disabled: boolean;
  typeFilter: number | "all";
  statusFilter: string | "all";
  onToggleType: (typeId?: number | null) => void;
  onToggleStatus: (status?: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${VEHICLE_DRAG_PREFIX}${vehicle.vehicle_id}`,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border border-slate-200 bg-white p-2.5 transition ${
        isDragging ? "opacity-40" : "hover:border-slate-300"
      }`}
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
          <div className="truncate font-semibold text-slate-800">{getVehicleLabel(vehicle)}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip
              tone="indigo"
              active={typeFilter === vehicle.vehicle_type_id}
              onClick={
                vehicle.vehicle_type_id != null
                  ? () => onToggleType(vehicle.vehicle_type_id)
                  : undefined
              }
              title={vehicle.vehicle_type_name || undefined}
            >
              {vehicle.vehicle_type_symbol || "B"}
            </Chip>
            {vehicle.vehicle_status && (
              <Chip
                tone="slate"
                active={statusFilter === vehicle.vehicle_status}
                onClick={() => onToggleStatus(vehicle.vehicle_status)}
              >
                {vehicle.vehicle_status}
              </Chip>
            )}
          </div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {vehicle.vehicle_type_name || "-"}
          </div>
        </div>
      </div>
    </div>
  );
}
