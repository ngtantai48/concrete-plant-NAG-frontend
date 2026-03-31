import orderApi from '@/services/order.service';
import type { Order } from '@/types/order';
import type { Station } from '@/types/station';
import type { Vehicle } from '@/types/vehicle';
import { ArrowRight, ChevronDown, ChevronUp, Clock, FileWarning, Hourglass, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableVehicleItem } from './SortableVehicleItem';

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    let sourceGroupIndex = -1;
    let targetGroupIndex = -1;
    let oldIndex = -1;
    let newIndex = -1;

    for (let i = 0; i < groupedByStation.length; i++) {
        const group = groupedByStation[i];
        const aIndex = group.orders.findIndex(o => o.order_id === active.id);
        const oIndex = group.orders.findIndex(o => o.order_id === over.id);
        
        if (aIndex !== -1) {
            sourceGroupIndex = i;
            oldIndex = aIndex;
        }
        if (oIndex !== -1) {
            targetGroupIndex = i;
            newIndex = oIndex;
        }
    }

    if (sourceGroupIndex === -1 || targetGroupIndex === -1) return;
    
    if (sourceGroupIndex !== targetGroupIndex) {
        toast.error('Giao diện hiện tại chỉ hỗ trợ kéo thả trong cùng 1 trạm!');
        return;
    }

    const group = groupedByStation[sourceGroupIndex];
    const currentOrder = group.orders[oldIndex];
    const swapOrder = group.orders[newIndex];

    const busyKey = `${group.stationId}-${currentOrder.order_id}`;
    setReorderingKey(busyKey);

    try {
      await orderApi.update(currentOrder.order_id, { order_number: swapOrder.order_number });
      toast.success(t('reorderSuccess') || 'Đã đổi vị trí luồng xe', { position: 'top-right' });
      await onOrdersUpdated?.();
    } catch {
      toast.error(t('reorderFailed') || 'Lỗi khi đổi vị trí', { position: 'top-right' });
    } finally {
      setReorderingKey(null);
    }
  };

  void vehicles;

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full w-full">
      {groupedByStation.length === 0 ? (
        <div className="flex h-full min-h-[400px] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full flex items-center justify-center animate-pulse" style={{ background: 'var(--dd-bg-surface)', border: '1px dashed var(--dd-border)' }}>
              <ArrowRight className="h-6 w-6 text-sky-500/80" />
            </div>
            <span className="text-sm font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>
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
                  <span className="text-base font-bold uppercase" style={{ color: 'var(--dd-text-primary)' }}>
                    {group.stationName}
                  </span>
                  <span className="dd-chip dd-chip-sky">
                    {group.orders.length} {t('vehicleCount')}
                  </span>
                </div>

                {/* Order Rows */}
                <div className="space-y-2 px-3 pb-3 pt-3" style={{ background: 'var(--dd-bg-surface)' }}>
                  <SortableContext 
                    items={visibleOrders.map(o => o.order_id)} 
                    strategy={verticalListSortingStrategy}
                  >
                    {visibleOrders.map((order, index) => {
                      const actualIndex = expanded ? index : index;
                      const isFirstPending = actualIndex === 0;
                      const style = getFlowStyle(order, isFirstPending, t);
                      const busyKey = `${group.stationId}-${order.order_id}`;
                      const isBusy = reorderingKey === busyKey;

                      return (
                        <SortableVehicleItem
                          key={order.order_id}
                          order={order}
                          index={index}
                          actualIndex={actualIndex}
                          style={style}
                          isBusy={isBusy}
                          onReorder={(dir) => handleReorder(group.stationId, actualIndex, dir)}
                          canMoveUp={actualIndex > 0}
                          canMoveDown={actualIndex < group.orders.length - 1}
                          t={t}
                        />
                      );
                    })}
                  </SortableContext>

                  {group.orders.length > 3 && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group.stationId)}
                      className="flex items-center gap-2 px-2 text-sm font-bold uppercase transition-colors"
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
    </DndContext>
  );
}
