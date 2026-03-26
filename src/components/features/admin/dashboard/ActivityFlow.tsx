import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Station } from '@/services/station.service';
import type { Vehicle } from '@/services/vehicle.service';
import orderApi, { type Order } from '@/services/order.service';

interface ActivityFlowProps {
  stations: Station[];
  vehicles: Vehicle[];
  orders: Order[];
  onOrdersUpdated?: () => Promise<void> | void;
}

const getFlowStyle = (order: Order, isFirstPending: boolean, t: (key: string) => string) => {
  if (order.order_status === 'pending') {
    if (isFirstPending) {
      return { text: t('preparing'), color: 'text-sky-600', dot: 'bg-sky-500', chip: 'bg-sky-50 border-sky-200' };
    }

    return { text: t('waitingStatus'), color: 'text-amber-600', dot: 'bg-amber-500', chip: 'bg-amber-50 border-amber-200' };
  }

  return { text: order.order_status.toUpperCase(), color: 'text-slate-500', dot: 'bg-slate-400', chip: 'bg-slate-50 border-slate-200' };
};

export default function ActivityFlow({ stations: _stations, vehicles, orders, onOrdersUpdated }: ActivityFlowProps) {
  const t = useTranslations('DashboardPage');
  const [expandedStations, setExpandedStations] = useState<Record<number, boolean>>({});
  const [reorderingKey, setReorderingKey] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);

  const groupedByStation = useMemo(() => {
    const activeOrders = orders.filter((order) => order.order_status === 'pending');
    const stationMap: Record<string, { stationName: string; stationId: number; orders: typeof activeOrders }> = {};

    activeOrders.forEach((order) => {
      const stationName = order.stations?.station_name || t('unassigned');
      const stationId = order.stations?.station_id || 0;
      const key = String(stationId);

      if (!stationMap[key]) {
        stationMap[key] = { stationName, stationId, orders: [] };
      }

      stationMap[key].orders.push(order);
    });

    return Object.values(stationMap)
      .map((group) => ({
        ...group,
        orders: [...group.orders].sort((a, b) => a.order_number - b.order_number),
      }))
      .sort((a, b) => a.stationName.localeCompare(b.stationName));
  }, [orders, t]);

  const toggleExpanded = (stationId: number) => {
    setExpandedStations((prev) => ({ ...prev, [stationId]: !prev[stationId] }));
  };

  const handleReorder = async (groupStationId: number, index: number, direction: 'up' | 'down') => {
    const group = groupedByStation.find((item) => item.stationId === groupStationId);
    if (!group) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= group.orders.length) return;

    const currentOrder = group.orders[index];
    const swapOrder = group.orders[targetIndex];
    const busyKey = `${groupStationId}-${currentOrder.order_id}`;
    setReorderingKey(busyKey);

    try {
      await Promise.all([
        orderApi.update(currentOrder.order_id, { order_number: swapOrder.order_number }),
        orderApi.update(swapOrder.order_id, { order_number: currentOrder.order_number }),
      ]);

      toast.success(t('reorderSuccess'), { position: 'top-right' });
      await onOrdersUpdated?.();
    } catch {
      toast.error(t('reorderFailed'), { position: 'top-right' });
    } finally {
      setReorderingKey(null);
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!window.confirm(t('confirmDeleteOrder'))) {
      return;
    }

    setDeletingOrderId(orderId);

    try {
      await orderApi.delete(orderId);
      toast.success(t('deleteOrderSuccess'), { position: 'top-right' });
      await onOrdersUpdated?.();
    } catch {
      toast.error(t('deleteOrderFailed'), { position: 'top-right' });
    } finally {
      setDeletingOrderId(null);
    }
  };

  void vehicles;

  return (
    <div className="overflow-hidden rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(250,250,250,0.98))] shadow-[0_0_0_1px_rgba(51,65,85,0.18),0_10px_24px_rgba(15,23,42,0.04)]">
      {groupedByStation.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-center text-sm font-medium text-slate-400">{t('noVehiclesInFlow')}</p>
        </div>
      ) : (
        <div className="space-y-3 bg-slate-100/70 p-3">
          {groupedByStation.map((group) => {
            const expanded = expandedStations[group.stationId] ?? false;
            const visibleOrders = expanded ? group.orders : group.orders.slice(0, 3);

            return (
              <div key={group.stationId} className="overflow-hidden rounded-[18px] bg-white">
                <div className="flex items-center justify-between bg-slate-50 px-5 py-3">
                  <span className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">{group.stationName}</span>
                  <span className="bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {group.orders.length} {t('vehicleCount')}
                  </span>
                </div>

                <div className="space-y-2 bg-white px-3 pb-3">
                  {visibleOrders.map((order, index) => {
                    const actualIndex = expanded ? index : index;
                    const isFirstPending = actualIndex === 0;
                    const style = getFlowStyle(order, isFirstPending, t);
                    const busyKey = `${group.stationId}-${order.order_id}`;
                    const isBusy = reorderingKey === busyKey;
                    const isDeleting = deletingOrderId === order.order_id;

                    return (
                      <div key={order.order_id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100">
                        <div className="min-w-[150px]">
                          <div className="text-sm font-semibold text-slate-900">
                            {order.vehicles?.vehicle_license_plate || `#${order.order_id}`}
                          </div>
                          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                            #{order.order_number}
                          </div>
                        </div>

                        <div className={`flex items-center gap-2 rounded-lg border px-3 py-1 ${style.chip}`}>
                          {isFirstPending && order.order_status === 'pending' && (
                            <ArrowRight className="h-3.5 w-3.5 animate-flow-arrow" />
                          )}
                          <div className={`h-2 w-2 rounded-full ${style.dot}`} />
                          <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${style.color}`}>
                            {style.text}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* <span className="text-xs font-medium text-slate-500">
                            {order.users?.user_full_name || '---'}
                          </span> */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReorder(group.stationId, actualIndex, 'up')}
                              disabled={isBusy || isDeleting || actualIndex === 0}
                              title={t('moveUp')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-500 shadow-[0_0_0_1px_rgba(148,163,184,0.25)] transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorder(group.stationId, actualIndex, 'down')}
                              disabled={isBusy || isDeleting || actualIndex === group.orders.length - 1}
                              title={t('moveDown')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-500 shadow-[0_0_0_1px_rgba(148,163,184,0.25)] transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order.order_id)}
                              disabled={isBusy || isDeleting}
                              title={t('deleteOrder')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500 shadow-[0_0_0_1px_rgba(248,113,113,0.22)] transition-colors hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {group.orders.length > 3 && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group.stationId)}
                      className="flex items-center gap-2 px-2 pt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-slate-600"
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {expanded ? t('hideMoreVehicles') : `+${group.orders.length - 3} ${t('moreVehicles')}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
