"use client";

import { Button } from "@/components/ui/button";
import { Input as ShadcnInput } from "@/components/ui/input";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { usePermissions } from "@/hooks/use-permissions";
import type {
  WorkMixerAssignmentDraft,
  WorkPersonnel,
  WorkVehicle,
} from "@/types/work-arrangement";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Empty } from "antd";
import { ChevronDown, ChevronRight, Loader2, Save, Search, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Chip,
  CollapsedSidebar,
  DragPersonPreview,
  getVehicleLabel,
  normalizeSearchText,
  parseDragId,
  PERSONNEL_POOL_ID,
  PersonnelCard,
  SharedPersonnelPool,
} from "./shared";

const MIXER_SLOT_PREFIX = "mixer-slot:";

export interface MixerAssignmentBoardProps {
  personnel: WorkPersonnel[];
  assignedUserIds: Set<number>;
  vehicles: WorkVehicle[]; // xe X
  halfDaySet: Set<number>;
  draft: WorkMixerAssignmentDraft;
  saving: boolean;
  dirty: boolean;
  onChangeDraft: (updater: (current: WorkMixerAssignmentDraft) => WorkMixerAssignmentDraft) => void;
  onSave: () => void;
}

export default function MixerAssignmentBoard({
  personnel,
  assignedUserIds,
  vehicles,
  halfDaySet,
  draft,
  saving,
  dirty,
  onChangeDraft,
  onSave,
}: MixerAssignmentBoardProps) {
  const t = useTranslations("WorkAssignmentPage");
  const { hasActionAccess } = usePermissions();
  const canUpdate = hasActionAccess(
    SIDEBAR.WORK_ARRANGEMENTS,
    PERMISSIONS.WORK_ARRANGEMENTS.UPDATE
  );
  const disabled = !canUpdate;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string | "all">("all");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [personnelPoolCollapsed, setPersonnelPoolCollapsed] = useState(false);

  const personnelById = useMemo(() => new Map(personnel.map((p) => [p.user_id, p])), [personnel]);

  const driverByVehicle = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of draft.mixer_assignments) {
      if (a.user_id != null) map.set(a.vehicle_id, a.user_id);
    }
    return map;
  }, [draft.mixer_assignments]);

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

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of vehicles) if (v.vehicle_status) set.add(v.vehicle_status);
    return Array.from(set);
  }, [vehicles]);

  const visibleVehicles = useMemo(() => {
    const keyword = normalizeSearchText(vehicleSearch);
    return vehicles
      .filter((vehicle) => {
        if (statusFilter !== "all" && vehicle.vehicle_status !== statusFilter) return false;
        if (!keyword) return true;
        return normalizeSearchText(
          [vehicle.vehicle_license_plate, vehicle.vehicle_name, vehicle.vehicle_status].join(" ")
        ).includes(keyword);
      })
      .sort((a, b) =>
        // Sắp theo mã X tự nhiên: X1 < X2 < ... < X10 < ... < X21 (numeric collation)
        String(a.vehicle_name || a.vehicle_license_plate || "").localeCompare(
          String(b.vehicle_name || b.vehicle_license_plate || ""),
          "en",
          { numeric: true, sensitivity: "base" }
        )
      );
  }, [vehicles, vehicleSearch, statusFilter]);

  const assignDriver = useCallback(
    (vehicleId: number, userId: number) => {
      onChangeDraft((current) => {
        const others = current.mixer_assignments.filter(
          (a) => a.user_id !== userId && a.vehicle_id !== vehicleId
        );
        return {
          ...current,
          mixer_assignments: [
            ...others,
            { assignment_id: `mixer:${vehicleId}`, vehicle_id: vehicleId, user_id: userId },
          ],
        };
      });
    },
    [onChangeDraft]
  );

  const unassignUser = useCallback(
    (userId: number) => {
      onChangeDraft((current) => ({
        ...current,
        mixer_assignments: current.mixer_assignments.filter((a) => a.user_id !== userId),
      }));
    },
    [onChangeDraft]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const dragged = parseDragId(String(event.active.id));
      const target = String(event.over?.id || "");
      if (disabled || !dragged || dragged.type !== "person") return;

      if (target === PERSONNEL_POOL_ID) {
        unassignUser(dragged.id);
        return;
      }
      if (target.startsWith(MIXER_SLOT_PREFIX)) {
        const vehicleId = Number(target.slice(MIXER_SLOT_PREFIX.length));
        if (vehicleId > 0) assignDriver(vehicleId, dragged.id);
      }
    },
    [assignDriver, disabled, unassignUser]
  );

  const assignedCount = driverByVehicle.size;
  const activeDrag = activeDragId ? parseDragId(activeDragId) : null;
  const dragPerson = activeDrag?.type === "person" ? personnelById.get(activeDrag.id) : undefined;

  const gridColsClass = personnelPoolCollapsed
    ? "lg:grid-cols-[48px_minmax(0,1fr)]"
    : "lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]";

  return (
    <div className="pb-24 lg:pb-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-teal-500" />
            {t("mixerAssignedVehicles")}
            <b className="text-slate-900">{assignedCount}</b>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            {t("mixerTotalVehicles")}
            <b className="text-slate-900">{vehicles.length}</b>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={disabled || saving}
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
              disabled={disabled}
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
              onCollapse={() => setPersonnelPoolCollapsed(true)}
            />
          )}

          <section className="flex max-h-[480px] flex-col rounded-lg border border-slate-200 bg-white p-3 lg:max-h-[600px]">
            <div className="mb-3 flex shrink-0 items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-slate-500" />
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {t("mixerBoard")}
                </div>
              </div>
              <Chip tone={visibleVehicles.length > 0 ? "teal" : "slate"}>
                {visibleVehicles.length}
              </Chip>
            </div>

            <div className="mb-3 shrink-0 space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-2">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <ShadcnInput
                  value={vehicleSearch}
                  onChange={(event) => setVehicleSearch(event.target.value)}
                  placeholder={t("mixerVehicleSearchPlaceholder")}
                  className="h-10 border-slate-200 bg-white pl-9 text-sm shadow-none focus-visible:ring-teal-500/20"
                />
              </div>
              {statusOptions.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {statusOptions.map((status) => (
                    <Chip
                      key={status}
                      tone="slate"
                      active={statusFilter === status}
                      onClick={() => setStatusFilter((prev) => (prev === status ? "all" : status))}
                    >
                      {status}
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              {visibleVehicles.length === 0 ? (
                <div className="flex min-h-[280px] items-center justify-center">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t("mixerEmptyVehicles")}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleVehicles.map((vehicle) => (
                    <MixerVehicleRow
                      key={vehicle.vehicle_id}
                      vehicle={vehicle}
                      driver={
                        driverByVehicle.has(vehicle.vehicle_id)
                          ? personnelById.get(driverByVehicle.get(vehicle.vehicle_id)!)
                          : undefined
                      }
                      halfDaySet={halfDaySet}
                      disabled={disabled}
                      driverLabel={t("mixerDriver")}
                      dropHint={t("mixerDropHint")}
                      onRemoveDriver={unassignUser}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <DragOverlay>{dragPerson ? <DragPersonPreview person={dragPerson} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function MixerVehicleRow({
  vehicle,
  driver,
  halfDaySet,
  disabled,
  driverLabel,
  dropHint,
  onRemoveDriver,
}: {
  vehicle: WorkVehicle;
  driver?: WorkPersonnel;
  halfDaySet: Set<number>;
  disabled: boolean;
  driverLabel: string;
  dropHint: string;
  onRemoveDriver: (userId: number) => void;
}) {
  // Xe đã có tài xế → tự thu gọn (kéo gán xong là co lại); gỡ tài xế → tự mở để sẵn sàng thả tiếp.
  const driverId = driver?.user_id;
  const [collapsed, setCollapsed] = useState(Boolean(driverId));
  useEffect(() => {
    setCollapsed(Boolean(driverId));
  }, [driverId]);
  const { setNodeRef, isOver } = useDroppable({
    id: `${MIXER_SLOT_PREFIX}${vehicle.vehicle_id}`,
    disabled: disabled || collapsed,
  });

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
          <Chip tone="indigo">{vehicle.vehicle_type_symbol || "X"}</Chip>
          <div className="truncate font-semibold text-slate-900">{getVehicleLabel(vehicle)}</div>
          {collapsed && driver && (
            <Chip tone="emerald">{driver.user_short_name || driver.user_full_name}</Chip>
          )}
        </div>
        {vehicle.vehicle_status && <Chip tone="slate">{vehicle.vehicle_status}</Chip>}
      </div>

      {!collapsed && (
        <div
          ref={setNodeRef}
          className={`m-2 rounded-md border p-2 transition-colors ${
            isOver ? "border-teal-500 bg-teal-50" : "border-dashed border-slate-200 bg-slate-50/60"
          }`}
        >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {driverLabel}
          </div>
          {driver ? (
            <PersonnelCard
              person={driver}
              halfDay={halfDaySet.has(driver.user_id)}
              disabled={disabled}
              compact
              onRemove={() => onRemoveDriver(driver.user_id)}
            />
          ) : (
            <div className="flex min-h-[56px] items-center justify-center text-center text-xs text-slate-400">
              {dropHint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
