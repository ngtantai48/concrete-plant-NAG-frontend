"use client";

import { ChevronDown, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SIDEBAR } from "@/constants/route";
import { useAppSelector } from "@/hooks/use-app-selector";
import type { PendingMaintenanceCard, VehicleMaintenanceWorkflowAction } from "@/types/vehicle";
import MaintenancePendingCardItem from "./MaintenancePendingCardItem";
import { isUrgentCard, useMaintenancePendingDock } from "./useMaintenancePendingDock";

const EXPANDED_KEY = "nag.maintenance.dock.expanded";
const MAX_VISIBLE = 3;

export default function MaintenanceActionDock() {
  const t = useTranslations("MaintenanceDock");
  const router = useRouter();
  const authUser = useAppSelector((state) => state.auth.user);
  const myUserId = authUser?.id ?? 0;

  const { canModerate, isConnected, items, processingIds, runAction, skipCard } =
    useMaintenancePendingDock();
  const [expanded, setExpanded] = useState(false);
  const knownIdsRef = useRef<Set<number>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    setExpanded(typeof window !== "undefined" && localStorage.getItem(EXPANDED_KEY) === "1");
  }, []);

  const persistExpanded = (value: boolean) => {
    setExpanded(value);
    localStorage.setItem(EXPANDED_KEY, value ? "1" : "0");
  };

  // Auto-expand (collapsed -> expanded only) when a NEW urgent card arrives.
  // The first non-empty snapshot only seeds knownIdsRef — it must NOT auto-expand,
  // otherwise every reload would override the user's persisted collapsed preference.
  useEffect(() => {
    const known = knownIdsRef.current;
    if (!seededRef.current) {
      items.forEach((card) => known.add(card.vehicle_maintenance_id));
      if (items.length > 0) seededRef.current = true;
      return;
    }
    const fresh = items.filter((card) => !known.has(card.vehicle_maintenance_id));
    items.forEach((card) => known.add(card.vehicle_maintenance_id));
    if (!expanded && fresh.some(isUrgentCard)) persistExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (!canModerate || items.length === 0) return null;

  const handleAction = async (
    card: PendingMaintenanceCard,
    action: VehicleMaintenanceWorkflowAction,
    reason?: string
  ) => {
    const result = await runAction(card, action, reason);
    if (result.ok) toast.success(t("actionSuccess"));
    else if (result.alreadyHandled) toast.info(t("alreadyHandled"));
    else toast.error(t("actionFailed"));
  };

  const visible = items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - visible.length;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => persistExpanded(true)}
        aria-label={t("title")}
        className="fixed bottom-6 right-6 z-[150] flex size-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg hover:bg-zinc-800"
      >
        <Wrench className="size-5" />
        <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold">
          {items.length}
        </span>
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[149] bg-black/30 md:hidden"
        onClick={() => persistExpanded(false)}
        aria-hidden
      />
      <div className="fixed bottom-0 left-0 right-0 z-[150] flex max-h-[70vh] flex-col gap-2 rounded-t-2xl bg-slate-50 p-3 shadow-xl md:bottom-6 md:left-auto md:right-6 md:top-auto md:max-h-[80vh] md:w-[360px] md:rounded-2xl md:bg-transparent md:p-0 md:shadow-none">
        <div className="flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Wrench className="size-3.5" />
            {t("title")} · {items.length}
            <span
              className={`size-1.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-amber-500"}`}
              title={isConnected ? t("online") : t("offline")}
            />
          </span>
          <button
            type="button"
            onClick={() => persistExpanded(false)}
            aria-label={t("close")}
            className="rounded p-1 text-slate-400 hover:text-slate-600"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto">
          {visible.map((card) => (
            <MaintenancePendingCardItem
              key={card.vehicle_maintenance_id}
              card={card}
              isMine={card.created_by_user.user_id === myUserId}
              processing={processingIds.includes(card.vehicle_maintenance_id)}
              onAction={(action, reason) => void handleAction(card, action, reason)}
              onDetail={() => router.push(`${SIDEBAR.VEHICLE_MAINTENANCES}/${card.vehicle_maintenance_id}`)}
              onSkip={() => skipCard(card.vehicle_maintenance_id)}
            />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => router.push(SIDEBAR.VEHICLE_MAINTENANCES)}
              className="self-end text-xs text-sky-600 hover:underline"
            >
              {t("moreTickets", { count: hiddenCount })}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
