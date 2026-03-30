import orderApi from '@/services/order.service';
import type { Order } from '@/types/order';
import type { Station } from '@/types/station';
import type { Vehicle } from '@/types/vehicle';
import { ArrowRight, ChevronDown, ChevronUp, Clock, FileWarning, Hourglass, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ActivityFlowProps {
  stations: Station[];
  vehicles: Vehicle[];
  orders: Order[];
  onOrdersUpdated?: () => Promise<void> | void;
}

const getFlowStyle = (order: Order, isFirstPending: boolean, t: (key: string) => string) => {
  if (order.order_status === 'pending') {
    if (isFirstPending) {
      return {
        text: `LƯỢT TIẾP THEO...`,
        chipClass: 'dd-chip dd-chip-sky animate-pulse',
        dot: '#0ea5e9',
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
      };
    }

    return {
      text: `CHỜ ĐẾN LƯỢT`,
      chipClass: 'dd-chip dd-chip-amber opacity-80',
      dot: '#f59e0b',
      icon: <Clock className="h-3 w-3" />,
    };
  }

  return {
    text: order.order_status.toUpperCase(),
    chipClass: 'dd-chip dd-chip-slate',
    dot: '#64748b',
    icon: <ArrowRight className="h-3 w-3" />
  };
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
    <div className="h-full w-full">
      {groupedByStation.length === 0 ? (
        <div className="flex h-full min-h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full flex items-center justify-center animate-pulse" style={{ background: 'var(--dd-bg-surface)', border: '1px dashed var(--dd-border)' }}>
              <ArrowRight className="h-6 w-6 text-sky-500/80" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--dd-text-muted)' }}>
              {t('noVehiclesInFlow') || 'CHƯA CÓ DỮ LIỆU LUỒNG XE'}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-3 bg-transparent">
          {groupedByStation.map((group) => {
            const expanded = expandedStations[group.stationId] ?? false;
            const visibleOrders = expanded ? group.orders : group.orders.slice(0, 3);

            return (
              <div key={group.stationId} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--dd-border)' }}>
                {/* Station Header */}
                <div className="flex items-center justify-between px-5 py-3"
                  style={{ background: 'var(--dd-bg-header)', borderBottom: '1px solid var(--dd-border)' }}>
                  <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--dd-text-primary)' }}>
                    {group.stationName}
                  </span>
                  <span className="dd-chip dd-chip-sky">
                    {group.orders.length} {t('vehicleCount')}
                  </span>
                </div>

                {/* Order Rows */}
                <div className="space-y-2 px-3 pb-3 pt-3" style={{ background: 'var(--dd-bg-surface)' }}>
                  {visibleOrders.map((order, index) => {
                    const actualIndex = expanded ? index : index;
                    const isFirstPending = actualIndex === 0;
                    const style = getFlowStyle(order, isFirstPending, t);
                    const busyKey = `${group.stationId}-${order.order_id}`;
                    const isBusy = reorderingKey === busyKey;

                    return (
                      <div key={order.order_id}
                        className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-all relative overflow-hidden group shadow-sm"
                        style={{
                          background: 'var(--dd-bg-card)',
                          border: '1px solid var(--dd-border)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--dd-border-hover)';
                          e.currentTarget.style.background = 'var(--dd-bg-card-hover)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--dd-border)';
                          e.currentTarget.style.background = 'var(--dd-bg-card)';
                        }}
                      >
                        {/* Status scanline indicator */}
                        <div className="absolute left-0 top-0 bottom-0 w-[3px]"
                          style={{ background: style.dot, opacity: 0.8 }} />

                        <div className="flex min-w-[150px] items-center gap-4 pl-2">
                          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold tracking-[0.05em] shadow-sm" style={{ color: 'var(--dd-text-secondary)', border: '1px solid var(--dd-border)' }}>
                            #{actualIndex + 1}
                          </div>
                          <div className="text-base font-black tracking-widest" style={{ color: 'var(--dd-text-primary)' }}>
                            {order.vehicles?.vehicle_license_plate || `ĐƠN: ${order.order_id}`}
                          </div>
                        </div>

                        <div className={style.chipClass}>
                          {style.icon}
                          {style.text}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReorder(group.stationId, actualIndex, 'up')}
                              disabled={isBusy || actualIndex === 0}
                              title={t('moveUp')}
                              className="flex h-8 w-8 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40"
                              style={{
                                background: 'var(--dd-bg-surface)',
                                border: '1px solid var(--dd-border)',
                                color: 'var(--dd-text-secondary)',
                              }}
                              onMouseEnter={e => {
                                if (!e.currentTarget.disabled) {
                                  e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.3)';
                                  e.currentTarget.style.color = '#22d3ee';
                                }
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'var(--dd-border)';
                                e.currentTarget.style.color = 'var(--dd-text-secondary)';
                              }}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorder(group.stationId, actualIndex, 'down')}
                              disabled={isBusy || actualIndex === group.orders.length - 1}
                              title={t('moveDown')}
                              className="flex h-8 w-8 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40"
                              style={{
                                background: 'var(--dd-bg-surface)',
                                border: '1px solid var(--dd-border)',
                                color: 'var(--dd-text-secondary)',
                              }}
                              onMouseEnter={e => {
                                if (!e.currentTarget.disabled) {
                                  e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.3)';
                                  e.currentTarget.style.color = '#22d3ee';
                                }
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'var(--dd-border)';
                                e.currentTarget.style.color = 'var(--dd-text-secondary)';
                              }}
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
                      className="flex items-center gap-2 px-2 pt-1 text-xs font-bold uppercase tracking-[0.16em] transition-colors"
                      style={{ color: 'var(--dd-text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--dd-text-accent)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--dd-text-muted)'}
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
