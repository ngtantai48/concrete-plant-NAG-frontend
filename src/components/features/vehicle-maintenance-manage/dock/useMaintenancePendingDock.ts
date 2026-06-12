"use client";

import { useCallback, useEffect, useState } from "react";
import { PERMISSIONS } from "@/constants/permissions";
import { SIDEBAR } from "@/constants/route";
import { useSocket } from "@/context/socket-context";
import { useMaintenanceDockStore } from "@/hooks/use-maintenance-dock-store";
import { usePermissions } from "@/hooks/use-permissions";
import { useSocketEventListener } from "@/hooks/useSocketEventListener";
import { SocketManager } from "@/lib/socket";
import vehicleMaintenanceApi from "@/services/vehicle-maintenance.service";
import type { PendingMaintenanceCard, VehicleMaintenanceWorkflowAction } from "@/types/vehicle";

const POLL_INTERVAL_MS = 60_000;

function hasAbnormalFlag(card: PendingMaintenanceCard): boolean {
  return (card.ai_insight?.flags ?? []).some(
    (flag) => ["cost_anomaly", "repeat_issue"].includes(flag.code) && flag.severity === "high"
  );
}

export function isUrgentCard(card: PendingMaintenanceCard): boolean {
  const rank = card.ai_insight?.suggested_rank ?? card.vehicle_maintenance_rank;
  return rank >= 3 || hasAbnormalFlag(card);
}

function sortCards(cards: PendingMaintenanceCard[]): PendingMaintenanceCard[] {
  return [...cards].sort((a, b) => {
    const abnormal = Number(hasAbnormalFlag(b)) - Number(hasAbnormalFlag(a));
    if (abnormal !== 0) return abnormal;
    const rankA = a.ai_insight?.suggested_rank ?? a.vehicle_maintenance_rank;
    const rankB = b.ai_insight?.suggested_rank ?? b.vehicle_maintenance_rank;
    if (rankB !== rankA) return rankB - rankA;
    return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
  });
}

function extractErrorCode(error: unknown): string {
  const data = (error as { response?: { data?: { message?: string; code?: string } } })?.response
    ?.data;
  return data?.message || data?.code || (error instanceof Error ? error.message : "");
}

export function useMaintenancePendingDock() {
  const { hasActionAccess } = usePermissions();
  const canModerate =
    hasActionAccess(SIDEBAR.VEHICLE_MAINTENANCES, PERMISSIONS.VEHICLE_MAINTENANCES.DISPATCH_REVIEW) ||
    hasActionAccess(
      SIDEBAR.VEHICLE_MAINTENANCES,
      PERMISSIONS.VEHICLE_MAINTENANCES.PRODUCTION_APPROVE
    );

  const { isConnected } = useSocket();
  const [items, setItems] = useState<PendingMaintenanceCard[]>([]);
  const [processingIds, setProcessingIds] = useState<number[]>([]);
  // Bỏ qua cục bộ (phiên hiện tại) — chỉ ẩn khỏi dock, KHÔNG đổi trạng thái phiếu.
  // Tải lại trang là hiện lại; vẫn nhận realtime upsert/remove bình thường.
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());

  // Gỡ id khỏi tập đã-bỏ-qua khi phiếu rời pool (tránh phình theo phiên). Giữ nguyên ref nếu không có → không re-render thừa.
  const dropSkipped = useCallback((id: number) => {
    setSkippedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Subscribe mỗi lần socket connect/reconnect → server join room + trả snapshot.
  // Chỉ lấy instance khi isConnected=true: lúc đó SocketProvider đã tạo instance với
  // config đúng, tránh race tự tạo instance "notifications" với config mặc định sai.
  useEffect(() => {
    if (!canModerate || !isConnected) return;
    try {
      SocketManager.getInstance("notifications").emit("maintenance:subscribe_pending");
    } catch {
      /* provider chưa khởi tạo — sẽ thử lại ở lần reconnect sau */
    }
  }, [canModerate, isConnected]);

  useSocketEventListener(
    "maintenance:pending_snapshot",
    (payload) => {
      const data = payload as { items?: PendingMaintenanceCard[] };
      setItems(sortCards(data?.items ?? []));
    },
    "notifications",
    canModerate && isConnected
  );

  useSocketEventListener(
    "maintenance:pending_upsert",
    (payload) => {
      const data = payload as { item?: PendingMaintenanceCard };
      const item = data?.item;
      if (!item) return;
      setItems((prev) =>
        sortCards([
          ...prev.filter((c) => c.vehicle_maintenance_id !== item.vehicle_maintenance_id),
          item,
        ])
      );
    },
    "notifications",
    canModerate && isConnected
  );

  useSocketEventListener(
    "maintenance:pending_remove",
    (payload) => {
      const data = payload as { vehicle_maintenance_id?: number };
      const removeId = data?.vehicle_maintenance_id;
      if (!removeId) return;
      setItems((prev) => prev.filter((c) => c.vehicle_maintenance_id !== removeId));
      dropSkipped(removeId);
    },
    "notifications",
    canModerate && isConnected
  );

  // Fallback: socket rớt → polling 60s, lỗi giữ dữ liệu cũ và thử lại tick sau
  useEffect(() => {
    if (!canModerate || isConnected) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await vehicleMaintenanceApi.getPendingActions();
        if (!cancelled) setItems(sortCards(res.data.items ?? []));
      } catch {
        /* giữ dữ liệu cũ, thử lại tick sau */
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [canModerate, isConnected]);

  const skipCard = useCallback((id: number) => {
    setSkippedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Optimistic: khóa thẻ khi đang gọi; thành công gỡ ngay (pending_remove xác nhận với mọi người)
  const runAction = useCallback(
    async (
      card: PendingMaintenanceCard,
      action: VehicleMaintenanceWorkflowAction,
      reason?: string
    ): Promise<{ ok: boolean; alreadyHandled: boolean }> => {
      const id = card.vehicle_maintenance_id;
      setProcessingIds((prev) => [...prev, id]);
      try {
        await vehicleMaintenanceApi.runWorkflowAction(id, action, { reason: reason ?? null });
        setItems((prev) => prev.filter((c) => c.vehicle_maintenance_id !== id));
        dropSkipped(id);
        return { ok: true, alreadyHandled: false };
      } catch (error: unknown) {
        const alreadyHandled = extractErrorCode(error).includes("INVALID_TRANSITION");
        if (alreadyHandled) {
          setItems((prev) => prev.filter((c) => c.vehicle_maintenance_id !== id));
          dropSkipped(id);
        }
        return { ok: false, alreadyHandled };
      } finally {
        setProcessingIds((prev) => prev.filter((x) => x !== id));
      }
    },
    [dropSkipped]
  );

  const visibleItems = items.filter((c) => !skippedIds.has(c.vehicle_maintenance_id));

  // Đẩy trạng thái hiển thị của dock ra store dùng chung: dock hiện iff có quyền
  // duyệt + còn phiếu chưa ẩn. Nút quick voice trên dashboard đọc để hiện/ẩn theo.
  const setHasPending = useMaintenanceDockStore((s) => s.setHasPending);
  useEffect(() => {
    setHasPending(canModerate && visibleItems.length > 0);
    return () => setHasPending(false);
  }, [canModerate, visibleItems.length, setHasPending]);

  return { canModerate, isConnected, items: visibleItems, processingIds, runAction, skipCard };
}
