"use client";

import { cn } from "@/lib/utils";
import { workAssignmentApi, workMixSlotApi } from "@/services/work-arrangement.service";
import type { WorkMixSlotItem } from "@/types/work-arrangement";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import dayjs from "dayjs";
import { FileSpreadsheet, GripVertical, ListOrdered, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * "Lốt trộn" — danh sách lốt xe (hàng đợi pending), kéo để sắp xếp thứ tự.
 * Mỗi lốt hiển thị người phụ trách lấy từ draft Xe bồn hôm nay (nếu có).
 */
export default function WorkMixSlotBoard({ active = true }: { active?: boolean }) {
  const t = useTranslations("WorkMixSlotPage");

  const [items, setItems] = useState<WorkMixSlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignedByVehicle, setAssignedByVehicle] = useState<Map<number, string>>(new Map());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleReorder = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.order_id === active.id);
      const newIndex = prev.findIndex((item) => item.order_id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await workMixSlotApi.getList();
      setItems(list);
    } catch (error) {
      console.error("[WorkMixSlotBoard] load error:", error);
      setItems([]);
      setAssignedByVehicle(new Map());
      toast.error(t("loadFailed"));
      setLoading(false);
      return;
    }
    setLoading(false);

    // Bổ sung "người phụ trách" từ draft Xe bồn hôm nay (không chặn hiển thị danh sách lốt).
    try {
      const bootstrap = await workAssignmentApi.getBootstrap(dayjs().format("YYYY-MM-DD"));
      const personById = new Map(bootstrap.personnel.map((person) => [person.user_id, person]));
      const map = new Map<number, string>();
      for (const assignment of bootstrap.mixer.draft.mixer_assignments) {
        if (assignment.user_id == null) continue;
        const person = personById.get(assignment.user_id);
        const name = person?.user_short_name || person?.user_full_name || "";
        if (name) map.set(assignment.vehicle_id, name);
      }
      setAssignedByVehicle(map);
    } catch {
      setAssignedByVehicle(new Map());
    }
  }, [t]);

  // Tải khi mở và mỗi lần quay lại (lốt đổi theo hàng đợi).
  useEffect(() => {
    if (active) loadData();
  }, [active, loadData]);

  // Mỗi lốt: ưu tiên người phụ trách từ draft Xe bồn; không có thì dùng tài xế của đơn.
  const decorated = useMemo(
    () =>
      items.map((item) => {
        const person = assignedByVehicle.get(item.vehicle_id) || item.short_name || "";
        return { item, person };
      }),
    [items, assignedByVehicle]
  );

  const isEmpty = !loading && items.length === 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
          <ListOrdered size={20} />
        </div>
        <h2 className="m-0 text-base font-bold text-slate-900">{t("heading")}</h2>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-slate-400">
            <FileSpreadsheet className="h-8 w-8 opacity-30" />
            <p className="m-0 text-sm italic">{t("empty")}</p>
          </div>
        ) : (
          <>
            <p className="m-0 mb-3 flex flex-wrap items-center gap-x-2 text-sm font-medium text-slate-500">
              <span>{t("count", { count: items.length })}</span>
              <span className="text-xs font-normal text-slate-400">· {t("reorderHint")}</span>
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleReorder}
            >
              <SortableContext
                items={decorated.map((entry) => entry.item.order_id)}
                strategy={rectSortingStrategy}
              >
                <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {decorated.map((entry, index) => (
                    <SortableLotChip
                      key={entry.item.order_id}
                      item={entry.item}
                      person={entry.person}
                      index={index}
                      pumpBadge={t("pumpBadge")}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>
    </section>
  );
}

function SortableLotChip({
  item,
  person,
  index,
  pumpBadge,
}: {
  item: WorkMixSlotItem;
  person: string;
  index: number;
  pumpBadge: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.order_id,
  });
  const isPump = item.code === "XB";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "inline-flex touch-none select-none items-center gap-2 rounded-lg border px-2.5 py-1.5",
        isPump ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50",
        isDragging && "z-10 opacity-80 shadow-lg"
      )}
    >
      <button
        type="button"
        className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        aria-label="Kéo để sắp xếp"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
          isPump ? "bg-amber-500" : "bg-teal-600"
        )}
      >
        {index + 1}
      </span>
      {person ? (
        <span className="flex items-baseline gap-1">
          <span className="text-sm font-semibold text-slate-800">{person}</span>
          <span className="text-xs font-medium text-slate-400">{item.code}</span>
        </span>
      ) : (
        <span className="text-sm font-semibold text-slate-800">{item.code}</span>
      )}
      {isPump && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700">
          {pumpBadge}
        </span>
      )}
    </li>
  );
}
