import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
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
      return { text: `[ ${t('preparing')} ]`, color: 'text-sky-700', dot: 'bg-sky-500', chip: 'bg-sky-50 border-sky-500' };
    }

    return { text: `[ ${t('waitingStatus')} ]`, color: 'text-amber-700', dot: 'bg-amber-500', chip: 'bg-amber-50 border-amber-500' };
  }

  return { text: `[ ${order.order_status.toUpperCase()} ]`, color: 'text-slate-500', dot: 'bg-slate-400', chip: 'bg-white border-slate-300' };
};

export default function ActivityFlow({ stations: _stations, vehicles, orders, onOrdersUpdated }: ActivityFlowProps) {
  const t = useTranslations('DashboardPage');
  const [expandedStations, setExpandedStations] = useState<Record<number, boolean>>({});
  const [reorderingKey, setReorderingKey] = useState<string | null>(null);

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
      await orderApi.update(currentOrder.order_id, { order_number: swapOrder.order_number });

      toast.success(t('reorderSuccess'), { position: 'top-right' });
      await onOrdersUpdated?.();
    } catch {
      toast.error(t('reorderFailed'), { position: 'top-right' });
    } finally {
      setReorderingKey(null);
    }
  };

  void vehicles;

  return (
    <div className="border border-slate-300 bg-white">
      {groupedByStation.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-center text-sm font-bold text-slate-400">{t('noVehiclesInFlow')}</p>
        </div>
      ) : (
        <div className="space-y-3 bg-slate-50 p-3">
          {groupedByStation.map((group) => {
            const expanded = expandedStations[group.stationId] ?? false;
            const visibleOrders = expanded ? group.orders : group.orders.slice(0, 3);

            return (
              <div key={group.stationId} className="border border-slate-300 bg-white">
                <div className="flex items-center justify-between border-b border-slate-300 bg-slate-100 px-5 py-3">
                  <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-900">{group.stationName}</span>
                  <span className="border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-900">
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

                    return (
                      <div key={order.order_id} className="flex items-center justify-between gap-3 border border-slate-300 bg-white px-4 py-3 transition-colors hover:border-slate-900">
                        <div className="flex min-w-[150px] items-center gap-2">
                          <div className="text-[11px] font-bold tracking-[0.14em] text-slate-500">
                            #{actualIndex + 1}
                          </div>
                          <div className="text-sm font-black text-slate-900">
                            {order.vehicles?.vehicle_license_plate || `#${order.order_id}`}
                          </div>
                        </div>

                        <div className={`flex items-center gap-2 border px-3 py-1 ${style.chip}`}>
                          {isFirstPending && order.order_status === 'pending' && (
                            <ArrowRight className="h-3.5 w-3.5" />
                          )}
                          <div className={`h-2 w-2 ${style.dot}`} />
                          <span className={`text-[11px] font-bold uppercase tracking-[0.16em] ${style.color}`}>
                            {style.text}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReorder(group.stationId, actualIndex, 'up')}
                              disabled={isBusy || actualIndex === 0}
                              title={t('moveUp')}
                              className="flex h-8 w-8 items-center justify-center border border-slate-300 bg-white text-slate-900 transition-colors hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorder(group.stationId, actualIndex, 'down')}
                              disabled={isBusy || actualIndex === group.orders.length - 1}
                              title={t('moveDown')}
                              className="flex h-8 w-8 items-center justify-center border border-slate-300 bg-white text-slate-900 transition-colors hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronDown className="h-4 w-4" />
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
                      className="flex items-center gap-2 px-2 pt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 transition-colors hover:text-slate-900"
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
