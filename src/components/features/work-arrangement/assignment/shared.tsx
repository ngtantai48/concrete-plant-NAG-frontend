"use client";

import { Input as ShadcnInput } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { WorkPersonnel, WorkVehicle } from "@/types/work-arrangement";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Empty } from "antd";
import { GripVertical, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import type { ReactNode } from "react";

export const PERSONNEL_POOL_ID = "personnel_pool";
export const VEHICLE_DRAG_PREFIX = "vehicle:";
export const PERSON_DRAG_PREFIX = "person:";

export const parseDragId = (id: string) => {
  if (id.startsWith(VEHICLE_DRAG_PREFIX)) {
    return { type: "vehicle" as const, id: Number(id.slice(VEHICLE_DRAG_PREFIX.length)) };
  }
  if (id.startsWith(PERSON_DRAG_PREFIX)) {
    return { type: "person" as const, id: Number(id.slice(PERSON_DRAG_PREFIX.length)) };
  }
  return null;
};

export const getVehicleLabel = (vehicle: WorkVehicle) =>
  [vehicle.vehicle_license_plate, vehicle.vehicle_name].filter(Boolean).join(" | ") ||
  `#${vehicle.vehicle_id}`;

/** So sánh xe theo thứ tự tự nhiên: X1, X2, ... X10 (không phải X1, X10, X2). */
export const compareVehicleByName = (a: WorkVehicle, b: WorkVehicle) => {
  const key = (v: WorkVehicle) => v.vehicle_name || v.vehicle_license_plate || `#${v.vehicle_id}`;
  return key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: "base" });
};

export const normalizeSearchText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();

// Lọc option của antd Select theo label, không phân biệt dấu/hoa thường.
export const filterSelectOptionByLabel = (input: string, option?: { label?: unknown }) =>
  normalizeSearchText(option?.label).includes(normalizeSearchText(input));

export type ChipTone = "slate" | "teal" | "amber" | "emerald" | "sky" | "violet" | "indigo";

export function Chip({
  children,
  tone = "slate",
  active = false,
  onClick,
  title,
}: {
  children: ReactNode;
  tone?: ChipTone;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const base = "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium";
  const staticTones: Record<ChipTone, string> = {
    slate: "bg-slate-100 text-slate-600",
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };

  if (!onClick) {
    return (
      <span className={`${base} ${staticTones[tone]}`} title={title}>
        {children}
      </span>
    );
  }

  const activeTones: Record<ChipTone, string> = {
    slate: "bg-slate-600 text-white",
    teal: "bg-teal-600 text-white",
    amber: "bg-amber-600 text-white",
    emerald: "bg-emerald-600 text-white",
    sky: "bg-sky-600 text-white",
    violet: "bg-violet-600 text-white",
    indigo: "bg-indigo-600 text-white",
  };
  const hoverTones: Record<ChipTone, string> = {
    slate: "bg-slate-100 text-slate-600 hover:bg-slate-200",
    teal: "bg-teal-50 text-teal-700 hover:bg-teal-100",
    amber: "bg-amber-100 text-amber-700 hover:bg-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    sky: "bg-sky-50 text-sky-700 hover:bg-sky-100",
    violet: "bg-violet-50 text-violet-700 hover:bg-violet-100",
    indigo: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  };

  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`${base} cursor-pointer transition-colors ${active ? activeTones[tone] : hoverTones[tone]}`}
    >
      {children}
    </button>
  );
}

export function PersonnelCard({
  person,
  halfDay,
  disabled,
  compact = false,
  onRemove,
  skillFilter,
  onToggleSkill,
}: {
  person: WorkPersonnel;
  halfDay: boolean;
  disabled: boolean;
  compact?: boolean;
  onRemove?: () => void;
  skillFilter?: number | "all";
  onToggleSkill?: (skillId?: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PERSON_DRAG_PREFIX}${person.user_id}`,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border border-slate-200 bg-white ${compact ? "p-2" : "p-2.5"} transition ${
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
          <div className="truncate font-medium text-slate-800">{person.user_full_name}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {person.user_short_name && <Chip>{person.user_short_name}</Chip>}
            {person.department_name && <Chip tone="sky">{person.department_name}</Chip>}
            {!compact && person.skill_name && (
              <Chip
                tone="violet"
                active={skillFilter != null && skillFilter === person.skill_id}
                onClick={
                  onToggleSkill && person.skill_id != null
                    ? () => onToggleSkill(person.skill_id)
                    : undefined
                }
              >
                {person.skill_name}
              </Chip>
            )}
            {halfDay && <Chip tone="amber">1/2</Chip>}
          </div>
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={disabled}
            className="h-7 px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <X size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}

export function DragPersonPreview({ person }: { person: WorkPersonnel }) {
  return (
    <div className="rounded-md border border-slate-300 bg-white p-2.5 shadow-xl">
      <div className="text-sm font-medium text-slate-800">{person.user_full_name}</div>
      {person.department_name && (
        <div className="mt-0.5 text-xs text-slate-500">{person.department_name}</div>
      )}
    </div>
  );
}

/**
 * Pool nhân sự dùng chung cho cả Xe bơm & Xe bồn.
 * - Bỏ lọc Bộ phận (chip bộ phận chỉ hiển thị, không click).
 * - Giữ lọc Tay nghề.
 * - Thêm tìm theo tên + tên viết tắt.
 */
export function CollapseButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
    >
      <PanelLeftClose size={15} />
    </button>
  );
}

/** Dải dọc mỏng khi panel bị thu gọn; nếu truyền droppableId thì vẫn nhận thả (để kéo trả về pool). */
export function CollapsedSidebar({
  title,
  count,
  onExpand,
  droppableId,
}: {
  title: string;
  count: number;
  onExpand: () => void;
  droppableId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId ?? "__collapsed_noop__",
    disabled: !droppableId,
  });

  return (
    <section
      ref={setNodeRef}
      className={`flex max-h-[480px] flex-col items-center gap-2 rounded-lg border bg-white p-1.5 lg:max-h-[600px] ${
        isOver ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={onExpand}
        title={title}
        aria-label={title}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
      >
        <PanelLeftOpen size={16} />
      </button>
      <Chip>{count}</Chip>
      <div className="mt-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-slate-500 [writing-mode:vertical-rl]">
        {title}
      </div>
    </section>
  );
}

export function SharedPersonnelPool({
  title,
  emptyLabel,
  people,
  halfDaySet,
  disabled,
  search,
  searchPlaceholder,
  onSearchChange,
  skillFilter,
  skillOptions,
  allSkillsLabel,
  onSkillFilterChange,
  onToggleSkill,
  onCollapse,
}: {
  title: string;
  emptyLabel: string;
  people: WorkPersonnel[];
  halfDaySet: Set<number>;
  disabled: boolean;
  search: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  skillFilter: number | "all";
  skillOptions: { value: number; label: string }[];
  allSkillsLabel: string;
  onSkillFilterChange: (value: number | "all") => void;
  onToggleSkill: (skillId?: number | null) => void;
  onCollapse?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: PERSONNEL_POOL_ID, disabled });
  const keyword = normalizeSearchText(search);

  const visible = people.filter((person) => {
    if (skillFilter !== "all" && person.skill_id !== skillFilter) return false;
    if (!keyword) return true;
    return normalizeSearchText([person.user_full_name, person.user_short_name].join(" ")).includes(
      keyword
    );
  });

  return (
    <section
      ref={setNodeRef}
      className={`flex max-h-[480px] flex-col rounded-lg border bg-white p-3 lg:max-h-[600px] ${
        isOver ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200"
      }`}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
        <div className="flex items-center gap-1.5">
          <Chip>{visible.length}</Chip>
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
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 border-slate-200 bg-white pl-9 text-sm shadow-none focus-visible:ring-teal-500/20"
          />
        </div>
        {skillOptions.length > 0 && (
          <Select
            value={String(skillFilter)}
            onValueChange={(value) => onSkillFilterChange(value === "all" ? "all" : Number(value))}
          >
            <SelectTrigger className="h-10 w-full border-slate-200 bg-white text-slate-700 shadow-none focus:ring-teal-500/20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{allSkillsLabel}</SelectItem>
              {skillOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyLabel} />
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((person) => (
              <PersonnelCard
                key={person.user_id}
                person={person}
                halfDay={halfDaySet.has(person.user_id)}
                disabled={disabled}
                skillFilter={skillFilter}
                onToggleSkill={onToggleSkill}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
