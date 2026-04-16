import orderApi, { type OrderUpdatePayload } from '@/services/order.service';
import type { Order } from '@/types/order';
import type { Station } from '@/types/station';
import type { Vehicle } from '@/types/vehicle';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRight, ChevronDown, ChevronUp, Clock, GripVertical, Loader2, X, ChevronUp as ChevronUpIcon, ChevronDown as ChevronDownIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
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
  dispatchMode: DispatchMode;
  layout?: ActivityFlowLayout;
  orderStatusFilter?: Order['order_status'][];
  onOrdersUpdated?: () => Promise<void> | void;
}

interface FlowStyle {
  text: string;
  chipClass: string;
  dot: string;
  icon: ReactNode;
}

interface StationFlowGroup {
  stationId: number;
  stationName: string;
  stationStatus?: string;
  orders: Order[];
}

interface MergedFlowOrder {
  group: StationFlowGroup;
  order: Order;
  actualIndex: number;
}

export type DispatchMode = 'auto' | 'manual';
export type ActivityFlowLayout = 'merged' | 'board';

interface StationQueueDropZoneProps {
  group: StationFlowGroup;
  visibleOrders: Order[];
  expanded: boolean;
  activeOrder: Order | null;
  activeOrderId: number | null;
  dragOverOrderId: number | null;
  placeholderIndex: number | null;
  sourceStationId: number | null;
  hoveredStationId: number | null;
  reorderingKey: string | null;
  onReorder: (index: number, direction: 'up' | 'down') => void;
  onToggleExpanded: () => void;
  isManualMode: boolean;
  t: ReturnType<typeof useTranslations>;
}

const FLOW_STATION_TYPE_ID = 1;
const STATION_DROP_PREFIX = 'station-drop-';
const getStationDropId = (stationId: number) => `${STATION_DROP_PREFIX}${stationId}`;
const getOrderStationId = (order: Order) => order.stations?.station_id ?? 0;

const isFlowStation = (station: Station) =>
  (station.station_types?.station_type_id ?? station.station_type_id) === FLOW_STATION_TYPE_ID;

const getFlowStyle = (order: Order, isTopPriority: boolean): FlowStyle => {
  if (order.order_status === 'init' || order.order_status === 'pending') {
    if (isTopPriority) {
      return {
        text: 'LƯỢT TIẾP THEO',
        chipClass: 'dd-chip dd-chip-sky animate-pulse',
        dot: '#0ea5e9',
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
      };
    }

    return {
      text: 'CHỜ ĐẾN LƯỢT',
      chipClass: 'dd-chip dd-chip-amber opacity-80',
      dot: '#f59e0b',
      icon: <Clock className="h-3 w-3" />,
    };
  }

  if (order.order_status === 'canceled') {
    return {
      text: 'CHỜ LỐT',
      chipClass: 'dd-chip dd-chip-amber opacity-80',
      dot: '#f59e0b',
      icon: <Clock className="h-3 w-3" />,
    };
  }

  return {
    text: order.order_status.toUpperCase(),
    chipClass: 'dd-chip dd-chip-slate',
    dot: '#64748b',
    icon: <ArrowRight className="h-3 w-3" />,
  };
};

const getStationStatusMeta = (status: string | undefined, t: ReturnType<typeof useTranslations>) => {
  switch (status) {
    case 'operating':
      return {
        label: t('operating'),
        chipClass: 'dd-chip dd-chip-emerald',
      };
    case 'stopped':
      return {
        label: t('stationStopped'),
        chipClass: 'dd-chip dd-chip-amber',
      };
    case 'incident':
      return {
        label: t('stationIncident'),
        chipClass: 'dd-chip dd-chip-red',
      };
    default:
      return {
        label: t('unknown'),
        chipClass: 'dd-chip dd-chip-slate',
      };
  }
};

function StationDropTargetCard({
  group,
  activeOrderId,
  sourceStationId,
  hoveredStationId,
  t,
}: {
  group: StationFlowGroup;
  activeOrderId: number | null;
  sourceStationId: number | null;
  hoveredStationId: number | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: getStationDropId(group.stationId),
    data: {
      type: 'station',
      stationId: group.stationId,
    },
  });

  const isDragMode = activeOrderId != null;
  const isSourceStation = sourceStationId === group.stationId;
  const isActiveDropTarget = hoveredStationId === group.stationId || isOver;
  const isEligibleTarget = isDragMode && !isSourceStation;
  const headerBadgeText = isActiveDropTarget
    ? t('dropHereBadge')
    : isSourceStation
      ? t('dragSourceStationBadge')
      : isEligibleTarget
        ? t('dragTargetStationBadge')
        : null;
  const headerBadgeClass = isActiveDropTarget
    ? 'dd-chip dd-chip-sky'
    : isSourceStation
      ? 'dd-chip dd-chip-amber'
      : 'dd-chip dd-chip-slate';
  const helperText = isSourceStation
    ? t('dragSourceStationBadge')
    : isActiveDropTarget
      ? t('dropZoneActive', { stationName: group.stationName })
      : t('dropZoneHint', { stationName: group.stationName });

  return (
    <div
      ref={setNodeRef}
      className="min-w-[220px] rounded-lg border px-4 py-3"
      style={{
        background: isActiveDropTarget
          ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(125, 211, 252, 0.04))'
          : 'var(--dd-bg-surface)',
        borderColor: isActiveDropTarget
          ? 'rgba(14, 165, 233, 0.35)'
          : isSourceStation
            ? 'rgba(245, 158, 11, 0.28)'
            : isEligibleTarget
              ? 'rgba(14, 165, 233, 0.22)'
              : 'var(--dd-border)',
        boxShadow: isActiveDropTarget
          ? '0 0 0 3px rgba(14, 165, 233, 0.08)'
          : isSourceStation
            ? '0 0 0 2px rgba(245, 158, 11, 0.06)'
            : 'none',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className="truncate text-sm font-bold uppercase"
          style={{ color: 'var(--dd-text-primary)' }}
        >
          {group.stationName}
        </div>

        {headerBadgeText && (
          <span className={headerBadgeClass}>
            {headerBadgeText}
          </span>
        )}
      </div>

      <div
        className="mt-2 text-[11px] font-bold uppercase"
        style={{ color: isSourceStation ? 'var(--dd-text-muted)' : isActiveDropTarget ? 'var(--dd-sky)' : 'var(--dd-text-accent)' }}
      >
        {helperText}
      </div>
    </div>
  );
}

function StationQueueDropZone({
  group,
  visibleOrders,
  expanded,
  activeOrder,
  activeOrderId,
  dragOverOrderId,
  placeholderIndex,
  sourceStationId,
  hoveredStationId,
  reorderingKey,
  onReorder,
  onToggleExpanded,
  isManualMode,
  t,
}: StationQueueDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: getStationDropId(group.stationId),
    data: {
      type: 'station',
      stationId: group.stationId,
    },
  });

  const isDragMode = activeOrderId != null;
  const isSourceStation = sourceStationId === group.stationId;
  const isActiveDropTarget = hoveredStationId === group.stationId || isOver;
  const showDropCue = activeOrderId != null && isActiveDropTarget;
  const showDropPad = isDragMode && !isSourceStation;
  const showCrossStationPlaceholder =
    showDropPad && isActiveDropTarget && typeof placeholderIndex === 'number';
  const dropPadText = showDropCue
    ? t('dropZoneActive', { stationName: group.stationName })
    : t('dropZoneHint', { stationName: group.stationName });
  const activeVehicleLabel = activeOrder?.vehicles?.vehicle_license_plate ? `${activeOrder.vehicles.vehicle_license_plate}${activeOrder.vehicles.vehicle_name ? ` | ${activeOrder.vehicles.vehicle_name}` : ''}` : `#${activeOrder?.order_id ?? ''}`;
  const placeholderCard = (
    <div
      className="relative overflow-hidden rounded-lg border border-dashed px-4 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(125, 211, 252, 0.04))',
        borderColor: 'rgba(14, 165, 233, 0.35)',
        boxShadow: '0 0 0 3px rgba(14, 165, 233, 0.08)',
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-sky-500/80" />

      <div className="mb-2 flex min-w-0 items-center gap-2 pl-2 text-[10px] font-bold uppercase text-sky-600/85">
        <ArrowRight className="h-3 w-3 shrink-0" />
        <span className="truncate">{t('dropBetweenVehicles', { stationName: group.stationName })}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-[150px] items-center gap-4 pl-2">
          <div className="p-1 text-sky-500">
            <GripVertical className="h-4 w-4" />
          </div>
          <div
            className="flex h-10 min-w-[40px] items-center justify-center rounded-full bg-slate-100 px-2 text-[14px] font-bold shadow-sm"
            style={{ color: 'var(--dd-text-secondary)', border: '1px solid var(--dd-border)' }}
          >
            ...
          </div>
          <div className="text-base font-black" style={{ color: 'var(--dd-text-primary)' }}>
            {activeVehicleLabel}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase text-sky-600">
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          <span className="dd-chip dd-chip-sky whitespace-nowrap">
            {t('dropHereBadge')}
          </span>
        </div>
      </div>
    </div>
  );

  const renderOrders = visibleOrders.flatMap((order, index) => {
    const actualIndex = index;
    const style = getFlowStyle(order, actualIndex < 3);
    const isBusy = reorderingKey === String(order.order_id);
    const orderItem = (
      <SortableVehicleItem
        key={order.order_id}
        order={order}
        stationId={group.stationId}
        index={index}
        actualIndex={actualIndex}
        style={style}
        isBusy={isBusy}
        onReorder={(direction) => onReorder(actualIndex, direction)}
        canMoveUp={actualIndex > 0}
        canMoveDown={actualIndex < group.orders.length - 1}
        isDropTarget={dragOverOrderId === order.order_id && activeOrderId !== order.order_id}
        isManualMode={isManualMode}
        t={t}
      />
    );

    if (showCrossStationPlaceholder && placeholderIndex === index) {
      return [
        <div key={`placeholder-${group.stationId}-${index}`}>
          {placeholderCard}
        </div>,
        orderItem,
      ];
    }

    return [orderItem];
  });

  return (
    <div
      ref={setNodeRef}
      className="space-y-2 px-3 pb-3 pt-3"
      style={{
        background: showDropCue ? 'rgba(14, 165, 233, 0.04)' : 'var(--dd-bg-surface)',
      }}
    >
      {showDropPad && (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-3 text-[11px] font-bold uppercase"
          style={{
            background: showDropCue ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.04)',
            borderColor: showDropCue ? 'rgba(14, 165, 233, 0.4)' : 'rgba(14, 165, 233, 0.18)',
            color: showDropCue ? 'var(--dd-sky)' : 'var(--dd-text-accent)',
            boxShadow: showDropCue ? '0 0 0 3px rgba(14, 165, 233, 0.1)' : 'none',
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{dropPadText}</span>
          </div>
          <span className="dd-chip dd-chip-sky whitespace-nowrap">
            {activeOrder?.vehicles?.vehicle_license_plate ? `${activeOrder.vehicles.vehicle_license_plate}${activeOrder.vehicles.vehicle_name ? ` | ${activeOrder.vehicles.vehicle_name}` : ''}` : `#${activeOrder?.order_id ?? ''}`}
          </span>
        </div>
      )}

      <SortableContext
        items={visibleOrders.map((order) => order.order_id)}
        strategy={verticalListSortingStrategy}
      >
        {renderOrders}
        {showCrossStationPlaceholder && placeholderIndex === visibleOrders.length && (
          <div key={`placeholder-${group.stationId}-tail`}>
            {placeholderCard}
          </div>
        )}
      </SortableContext>

      {group.orders.length === 0 && !showCrossStationPlaceholder && (
        <div
          className="rounded-lg border border-dashed px-4 py-8 text-center"
          style={{
            background: showDropCue ? 'rgba(14, 165, 233, 0.08)' : showDropPad ? 'rgba(14, 165, 233, 0.04)' : 'rgba(255, 255, 255, 0.8)',
            borderColor: showDropCue
              ? 'rgba(14, 165, 233, 0.35)'
              : showDropPad
                ? 'rgba(14, 165, 233, 0.18)'
                : 'rgba(148, 163, 184, 0.28)',
            color: showDropCue || showDropPad ? 'var(--dd-text-accent)' : 'var(--dd-text-muted)',
          }}
        >
          <div className="text-xs font-bold uppercase">
            {showCrossStationPlaceholder ? t('dropIntoStation', { stationName: group.stationName }) : showDropPad ? dropPadText : t('stationNoVehicle')}
          </div>
        </div>
      )}

      {group.orders.length > 3 && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex items-center gap-2 px-2 pt-1 text-xs font-bold uppercase transition-colors"
          style={{ color: 'var(--dd-text-muted)' }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = 'var(--dd-text-accent)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = 'var(--dd-text-muted)';
          }}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? t('hideMoreVehicles') : `+${group.orders.length - 3} ${t('moreVehicles')}`}
        </button>
      )}
    </div>
  );
}

const MemoStationQueueDropZone = React.memo(StationQueueDropZone);

function DraggedVehiclePreview({
  order,
  actualIndex,
  style,
}: {
  order: Order;
  actualIndex: number;
  style: FlowStyle;
}) {
  return (
    <div
      className="relative flex min-w-[520px] items-center justify-between gap-3 overflow-hidden rounded-lg border px-4 py-3"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))',
        borderColor: 'rgba(14, 165, 233, 0.22)',
        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18), 0 10px 24px rgba(14, 165, 233, 0.12), 0 0 0 1px rgba(255,255,255,0.7) inset',
        transform: 'scale(1.03) rotate(-0.35deg)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: style.dot, opacity: 0.8 }} />
      <div className="absolute inset-x-0 top-0 h-px bg-white/80" />
      <div className="absolute -inset-6 -z-10 rounded-lg bg-sky-200/20 blur-2xl" />

      <div className="flex min-w-[150px] items-center gap-4 pl-2">
        <div className="p-1 text-sky-500">
          <GripVertical className="h-4 w-4" />
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-[14px] font-bold shadow-sm"
          style={{ color: 'var(--dd-text-secondary)', border: '1px solid var(--dd-border)' }}
        >
          #{actualIndex + 1}
        </div>
        <div className="min-w-0 flex-1 flex items-center gap-3">
          <div className="text-base font-black truncate" style={{ color: 'var(--dd-text-primary)' }}>
            {order.vehicles?.vehicle_license_plate ? `${order.vehicles.vehicle_license_plate}${order.vehicles.vehicle_name ? ` | ${order.vehicles.vehicle_name}` : ''}` : `ĐƠN: ${order.order_id}`}
          </div>
          {order.order_init_datetime && (
            <div className="flex items-center gap-1 text-sm font-bold shrink-0" style={{ color: 'var(--dd-text-muted)' }}>
              <Clock size={14} />
              <span>
                <span className="opacity-75">Vào lúc: </span>
                <span style={{ color: 'var(--dd-text-primary)' }}>
                  {`${new Date(order.order_init_datetime).getHours()}h${new Date(order.order_init_datetime).getMinutes().toString().padStart(2, '0')}p`}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={style.chipClass}>
        {style.icon}
        {style.text}
      </div>

      <div className="flex items-center gap-1 opacity-80">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(148, 163, 184, 0.24)',
            color: 'var(--dd-text-secondary)',
          }}
        >
          <ChevronUpIcon className="h-4 w-4" />
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(148, 163, 184, 0.24)',
            color: 'var(--dd-text-secondary)',
          }}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

const ActivityFlow = ({
  stations,
  vehicles,
  orders,
  dispatchMode,
  layout = 'merged',
  orderStatusFilter = ['pending'],
  onOrdersUpdated,
}: ActivityFlowProps) => {
  const t = useTranslations('DashboardPage');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [manualStationId, setManualStationId] = useState<string>('');
  const [manualOrderStationMap, setManualOrderStationMap] = useState<Record<number, string>>({});
  const [reorderingKey, setReorderingKey] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [dragOverOrderId, setDragOverOrderId] = useState<number | null>(null);
  const [hoveredStationId, setHoveredStationId] = useState<number | null>(null);
  const [expandedStationIds, setExpandedStationIds] = useState<Record<number, boolean>>({});
  const [optimisticOrders, setOptimisticOrders] = useState<Order[] | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const hoveredStationRef = useRef<number | null>(null);

  const effectiveOrders = optimisticOrders ?? orders;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const groupedByStation = useMemo(() => {
    const pendingOrders = effectiveOrders
      .filter((order) => orderStatusFilter.includes(order.order_status))
      .sort((a, b) => (a.order_number || 0) - (b.order_number || 0));

    const ordersByStation = new Map<number, Order[]>();

    pendingOrders.forEach((order) => {
      const stationId = getOrderStationId(order);
      const stationOrders = ordersByStation.get(stationId) ?? [];
      stationOrders.push(order);
      ordersByStation.set(stationId, stationOrders);
    });

    const stationGroups: StationFlowGroup[] = stations
      .filter((station) => isFlowStation(station) || ordersByStation.has(station.station_id))
      .sort((a, b) => a.station_name.localeCompare(b.station_name))
      .map((station) => ({
        stationId: station.station_id,
        stationName: station.station_name,
        stationStatus: station.station_status,
        orders: ordersByStation.get(station.station_id) ?? [],
      }));

    const presentStationIds = new Set(stationGroups.map((group) => group.stationId));
    const missingGroups = Array.from(ordersByStation.entries())
      .filter(([stationId]) => stationId !== 0 && !presentStationIds.has(stationId))
      .map(([stationId, stationOrders]) => ({
        stationId,
        stationName: stationOrders[0]?.stations?.station_name || `${t('stationLabelWord')} ${stationId}`,
        stationStatus: stationOrders[0]?.stations?.station_status,
        orders: stationOrders,
      }))
      .sort((a, b) => a.stationName.localeCompare(b.stationName));

    const unassignedGroup = ordersByStation.has(0)
      ? [
        {
          stationId: 0,
          stationName: t('unassigned'),
          stationStatus: undefined,
          orders: ordersByStation.get(0) ?? [],
        },
      ]
      : [];

    return [...unassignedGroup, ...stationGroups, ...missingGroups];
  }, [effectiveOrders, orderStatusFilter, stations, t]);

  const flowStationOptions = useMemo(
    () => stations
      .filter((station) => isFlowStation(station))
      .sort((a, b) => a.station_name.localeCompare(b.station_name)),
    [stations],
  );

  const flowStationNameById = useMemo(
    () => new Map(flowStationOptions.map((station) => [String(station.station_id), station.station_name])),
    [flowStationOptions],
  );

  const activeOrder = useMemo(
    () => effectiveOrders.find((order) => order.order_id === activeOrderId) ?? null,
    [activeOrderId, effectiveOrders],
  );

  const hasPendingOrders = useMemo(
    () => groupedByStation.some((group) => group.orders.length > 0),
    [groupedByStation],
  );

  const mergedFlowOrders = useMemo<MergedFlowOrder[]>(() => {
    const allPendingOrders: { group: StationFlowGroup; order: Order }[] = [];

    groupedByStation.forEach((group) => {
      group.orders.forEach((order) => {
        allPendingOrders.push({ group, order });
      });
    });

    allPendingOrders.sort((a, b) => (a.order.order_number || 0) - (b.order.order_number || 0));

    return allPendingOrders.map(({ group, order }, index) => ({
      group,
      order,
      actualIndex: index,
    }));
  }, [groupedByStation]);

  const selectedCount = selectedOrderIds.length;
  const selectedAssignedCount = selectedOrderIds.filter((orderId) => Boolean(manualOrderStationMap[orderId])).length;

  useEffect(() => {
    const validOrderIds = new Set(mergedFlowOrders.map(({ order }) => order.order_id));
    setSelectedOrderIds((previous) => {
      const filtered = previous.filter((orderId) => validOrderIds.has(orderId));
      return filtered.length === previous.length ? previous : filtered;
    });
    setManualOrderStationMap((previous) => {
      const entries = Object.entries(previous);
      const filtered = entries.filter(([orderId]) => validOrderIds.has(Number(orderId)));
      return filtered.length === entries.length ? previous : Object.fromEntries(filtered);
    });
  }, [mergedFlowOrders]);

  useEffect(() => {
    if (dispatchMode === 'auto') {
      setSelectedOrderIds([]);
      setManualStationId('');
      setManualOrderStationMap({});
    }
  }, [dispatchMode]);

  useEffect(() => {
    const validStationIds = new Set(groupedByStation.map((group) => group.stationId));
    setExpandedStationIds((previous) => {
      const entries = Object.entries(previous);
      const filtered = entries.filter(([stationId]) => validStationIds.has(Number(stationId)));
      return filtered.length === entries.length ? previous : Object.fromEntries(filtered);
    });
  }, [groupedByStation]);

  const activeOrderMeta = useMemo(() => {
    if (!activeOrder) {
      return null;
    }

    const sourceGroup = groupedByStation.find((group) => group.stationId === getOrderStationId(activeOrder));
    const actualIndex = Math.max(
      0,
      sourceGroup?.orders.findIndex((order) => order.order_id === activeOrder.order_id) ?? 0,
    );
    const style = getFlowStyle(activeOrder, actualIndex < 3);

    return {
      actualIndex,
      style,
    };
  }, [activeOrder, groupedByStation]);

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }

    return closestCorners(args);
  }, []);

  const resetDragState = useCallback(() => {
    setActiveOrderId(null);
    setDragOverOrderId(null);
    setHoveredStationId(null);
  }, []);

  const sourceGroup = useMemo(() => {
    if (!activeOrder) {
      return null;
    }

    return groupedByStation.find((group) => group.stationId === getOrderStationId(activeOrder)) ?? null;
  }, [activeOrder, groupedByStation]);

  const hoveredGroup = useMemo(
    () => groupedByStation.find((group) => group.stationId === hoveredStationId) ?? null,
    [groupedByStation, hoveredStationId],
  );

  const boardGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(groupedByStation.length, 1)}, minmax(320px, 1fr))`,
      minWidth: `${Math.max(groupedByStation.length, 1) * 320}px`,
    }),
    [groupedByStation.length],
  );

  const resolveTargetStationId = useCallback((event: DragOverEvent | DragEndEvent) => {
    const overData = event.over?.data.current;
    if (!overData) {
      return null;
    }

    if (typeof overData.stationId === 'number') {
      return overData.stationId;
    }

    return null;
  }, []);

  const toggleOrderSelection = useCallback((orderId: number, checked: boolean) => {
    setSelectedOrderIds((previous) => {
      if (checked) {
        return previous.includes(orderId) ? previous : [...previous, orderId];
      }

      return previous.filter((currentId) => currentId !== orderId);
    });

    if (!checked) {
      setManualOrderStationMap((previous) => {
        const next = { ...previous };
        delete next[orderId];
        return next;
      });
    }
  }, []);

  const handleManualOrderStationChange = useCallback((orderId: number, stationId: string) => {
    setManualStationId('');
    setManualOrderStationMap((previous) => ({
      ...previous,
      [orderId]: stationId,
    }));
  }, []);

  const clearManualOrderStation = useCallback((orderId: number) => {
    setManualOrderStationMap((previous) => {
      const next = { ...previous };
      delete next[orderId];
      return next;
    });
  }, []);

  const toggleStationExpanded = useCallback((stationId: number) => {
    setExpandedStationIds((previous) => ({
      ...previous,
      [stationId]: !previous[stationId],
    }));
  }, []);

  const handleManualAssign = useCallback(async () => {
    if (selectedOrderIds.length === 0) {
      toast.error(t('manualSelectionRequired'), { position: 'top-right' });
      return;
    }

    if (!manualStationId && selectedAssignedCount < selectedOrderIds.length) {
      toast.error(t('manualIncompleteAssignments', {
        selectedCount: selectedOrderIds.length,
        assignedCount: selectedAssignedCount,
      }), { position: 'top-right' });
      return;
    }

    const selectedOrders = mergedFlowOrders
      .filter(({ order }) => selectedOrderIds.includes(order.order_id))
      .map(({ order }) => order);

    if (selectedOrders.length === 0) {
      toast.error(t('manualSelectionRequired'), { position: 'top-right' });
      return;
    }

    const stationAssignments = new Map<number, Order[]>();

    for (const order of selectedOrders) {
      const targetStationValue = manualOrderStationMap[order.order_id] || manualStationId;
      if (!targetStationValue) {
        toast.error(t('manualTargetRequired'), { position: 'top-right' });
        return;
      }

      const targetStationId = Number(targetStationValue);
      const assignmentGroup = stationAssignments.get(targetStationId) ?? [];
      assignmentGroup.push(order);
      stationAssignments.set(targetStationId, assignmentGroup);
    }

    setReorderingKey(`manual-${Date.now()}`);

    const optimistic = effectiveOrders.map((o) => {
      const targetStationValue = manualOrderStationMap[o.order_id] || manualStationId;
      if (!selectedOrderIds.includes(o.order_id) || !targetStationValue) return o;
      const targetStationId = Number(targetStationValue);
      const targetStation = flowStationOptions.find((s) => s.station_id === targetStationId);
      return {
        ...o,
        stations: { ...o.stations, station_id: targetStationId, station_name: targetStation?.station_name ?? '' },
      };
    });
    setOptimisticOrders(optimistic);

    try {
      for (const [targetStationId, ordersToMove] of stationAssignments.entries()) {
        const targetGroup = groupedByStation.find((group) => group.stationId === targetStationId);
        const targetStation = flowStationOptions.find((station) => station.station_id === targetStationId);

        if (!targetStation) {
          throw new Error('Target station not found');
        }

        const firstNonSelectedTargetOrder = targetGroup?.orders.find(
          (order) => !selectedOrderIds.includes(order.order_id),
        );
        const targetHeadOrderNumber = firstNonSelectedTargetOrder?.order_number ?? targetGroup?.orders[0]?.order_number;
        const updateQueue = typeof targetHeadOrderNumber === 'number'
          ? [...ordersToMove].reverse()
          : ordersToMove;
        let nextOrderNumber = targetGroup?.orders[targetGroup.orders.length - 1]?.order_number ?? 0;

        for (const order of updateQueue) {
          const payload: OrderUpdatePayload = {
            station_id: targetStationId,
            order_number: typeof targetHeadOrderNumber === 'number'
              ? targetHeadOrderNumber
              : ++nextOrderNumber,
          };

          await orderApi.update(order.order_id, payload);
        }
      }

      if (stationAssignments.size === 1) {
        const [targetStationId] = stationAssignments.keys();
        const targetStation = flowStationOptions.find((station) => station.station_id === targetStationId);

        toast.success(t('moveMultipleToStationSuccess', {
          count: selectedOrders.length,
          stationName: targetStation?.station_name || t('unassigned'),
        }), { position: 'top-right' });
      } else {
        toast.success(t('moveMultipleToStationsSuccess', {
          count: selectedOrders.length,
        }), { position: 'top-right' });
      }

      setSelectedOrderIds([]);
      setManualOrderStationMap({});
      await onOrdersUpdated?.();
    } catch {
      toast.error(t('moveMultipleToStationsFailed'), { position: 'top-right' });
    } finally {
      setOptimisticOrders(null);
      setReorderingKey(null);
    }
  }, [effectiveOrders, flowStationOptions, groupedByStation, manualOrderStationMap, manualStationId, mergedFlowOrders, onOrdersUpdated, selectedAssignedCount, selectedOrderIds, t]);

  const handleReorder = useCallback(async (groupStationId: number, index: number, direction: 'up' | 'down') => {
    const group = groupedByStation.find((item) => item.stationId === groupStationId);
    if (!group) {
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= group.orders.length) {
      return;
    }

    const currentOrder = group.orders[index];
    const swapOrder = group.orders[targetIndex];
    setReorderingKey(String(currentOrder.order_id));

    const optimistic = effectiveOrders.map((o) => {
      if (o.order_id === currentOrder.order_id) return { ...o, order_number: swapOrder.order_number };
      if (o.order_id === swapOrder.order_id) return { ...o, order_number: currentOrder.order_number };
      return o;
    });
    setOptimisticOrders(optimistic);

    try {
      await orderApi.update(currentOrder.order_id, { order_number: targetIndex + 1 });
      await onOrdersUpdated?.();
    } catch {
      toast.error(t('reorderFailed'), { position: 'top-right' });
    } finally {
      setOptimisticOrders(null);
      setReorderingKey(null);
    }
  }, [effectiveOrders, groupedByStation, onOrdersUpdated, t]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveOrderId(Number(event.active.id));
    setDragOverOrderId(null);
    const stationId = event.active.data.current?.stationId;
    setHoveredStationId(typeof stationId === 'number' ? stationId : null);
  };

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overData = event.over?.data.current;
    const nextDragOver = overData?.type === 'order' && typeof overData.orderId === 'number'
      ? overData.orderId
      : null;
    const nextStation = resolveTargetStationId(event);

    if (dragOverRef.current !== nextDragOver) {
      dragOverRef.current = nextDragOver;
      setDragOverOrderId(nextDragOver);
    }
    if (hoveredStationRef.current !== nextStation) {
      hoveredStationRef.current = nextStation;
      setHoveredStationId(nextStation);
    }
  }, [resolveTargetStationId]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const sourceStationId = event.active.data.current?.stationId;
    const targetStationId = resolveTargetStationId(event);
    const overData = event.over?.data.current;

    resetDragState();

    if (typeof sourceStationId !== 'number' || typeof targetStationId !== 'number') {
      return;
    }

    const sourceGroup = groupedByStation.find((group) => group.stationId === sourceStationId);
    const targetGroup = groupedByStation.find((group) => group.stationId === targetStationId);
    if (!sourceGroup || !targetGroup) {
      return;
    }

    const currentOrder = sourceGroup.orders.find((order) => order.order_id === event.active.id);
    if (!currentOrder) {
      return;
    }

    const isSameStation = sourceStationId === targetStationId;
    const isTargetOrder = overData?.type === 'order' && typeof overData.orderId === 'number';

    if (!isSameStation) {
      return;
    }

    if (isSameStation && !isTargetOrder) {
      return;
    }

    const targetOrderIndex = overData?.orderId != null
      ? targetGroup.orders.findIndex((order) => order.order_id === overData.orderId)
      : -1;
    const targetOrder = targetOrderIndex >= 0 ? targetGroup.orders[targetOrderIndex] : null;

    if (!targetOrder || targetOrder.order_id === currentOrder.order_id) {
      return;
    }

    setReorderingKey(String(currentOrder.order_id));

    const optimistic = effectiveOrders.map((o) => {
      if (o.order_id === currentOrder.order_id) return { ...o, order_number: targetOrder.order_number };
      if (o.order_id === targetOrder.order_id) return { ...o, order_number: currentOrder.order_number };
      return o;
    });
    setOptimisticOrders(optimistic);

    try {
      await orderApi.update(currentOrder.order_id, { order_number: targetOrderIndex + 1 });
      await onOrdersUpdated?.();
    } catch {
      toast.error(t('reorderFailed'), {
        position: 'top-right',
      });
    } finally {
      setOptimisticOrders(null);
      setReorderingKey(null);
    }
  };

  void vehicles;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={resetDragState}
    >
      <div className="h-full w-full">
        {!hasPendingOrders ? (
          <div className="flex w-full min-h-[200px] items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full animate-pulse"
                style={{ background: 'var(--dd-bg-surface)', border: '1px dashed var(--dd-border)' }}
              >
                <ArrowRight className="h-6 w-6 text-sky-500/80" />
              </div>
              <span
                className="text-xs font-bold uppercase"
                style={{ color: 'var(--dd-text-muted)' }}
              >
                {t('noVehiclesInFlow')}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-3 bg-transparent">
            {layout === 'merged' && dispatchMode === 'manual' && (
              <div
                className="rounded-lg border px-4 py-3"
                style={{
                  background: 'var(--dd-bg-surface)',
                  borderColor: 'var(--dd-border)',
                }}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <span className="dd-chip dd-chip-sky">
                    {t('manualSelectedVehicles', { count: selectedCount })}
                  </span>

                  <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center md:justify-end">
                    <div className="flex w-full items-center gap-2 md:w-auto">
                      <Select
                        value={manualStationId}
                        onValueChange={(value) => {
                          setManualStationId(value);
                          setManualOrderStationMap({});
                        }}
                      >
                        <SelectTrigger className="w-full bg-white md:w-[130px]">
                          <SelectValue placeholder={t('manualChooseStation')} />
                        </SelectTrigger>
                        <SelectContent>
                          {flowStationOptions.map((station) => (
                            <SelectItem key={station.station_id} value={String(station.station_id)}>
                              {station.station_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {manualStationId && (
                        <button
                          type="button"
                          onClick={() => setManualStationId('')}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-all hover:text-slate-700"
                          title={t('manualClearStation')}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleManualAssign}
                      disabled={selectedCount === 0 || reorderingKey?.startsWith('manual-')}
                    >
                      {t('manualAssignAction')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeOrder && (
              <div
                className="rounded-lg border px-4 py-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(125, 211, 252, 0.04))',
                  borderColor: 'rgba(14, 165, 233, 0.2)',
                  boxShadow: '0 10px 24px rgba(14, 165, 233, 0.06)',
                }}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div
                      className="text-[11px] font-bold uppercase"
                      style={{ color: 'var(--dd-text-muted)' }}
                    >
                      {t('draggingVehicleLabel')}
                    </div>
                    <div
                      className="mt-1 truncate text-lg font-black uppercase"
                      style={{ color: 'var(--dd-text-primary)' }}
                    >
                      {activeOrder.vehicles?.vehicle_license_plate ? `${activeOrder.vehicles.vehicle_license_plate}${activeOrder.vehicles.vehicle_name ? ` | ${activeOrder.vehicles.vehicle_name}` : ''}` : `#${activeOrder.order_id}`}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 text-[11px] font-bold uppercase md:items-end">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="dd-chip dd-chip-amber">
                        {t('dragSourceStationBadge')}
                      </span>
                      <span style={{ color: 'var(--dd-text-primary)' }}>
                        {sourceGroup?.stationName || t('unassigned')}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-sky-500" />
                      <span className="dd-chip dd-chip-sky">
                        {hoveredGroup ? t('dropHereBadge') : t('dragTargetStationBadge')}
                      </span>
                      <span style={{ color: hoveredGroup ? 'var(--dd-sky)' : 'var(--dd-text-muted)' }}>
                        {hoveredGroup?.stationName || t('dragTargetStationHint')}
                      </span>
                    </div>
                    <span style={{ color: 'var(--dd-text-muted)' }}>
                      {t('dragAcrossStationsHint')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {layout === 'merged' && activeOrder && (
              <div className="flex flex-wrap gap-3">
                {groupedByStation.map((group) => (
                  <StationDropTargetCard
                    key={group.stationId}
                    group={group}
                    activeOrderId={activeOrderId}
                    sourceStationId={sourceGroup?.stationId ?? null}
                    hoveredStationId={hoveredStationId}
                    t={t}
                  />
                ))}
              </div>
            )}

            {layout === 'board' ? (
              <div className="overflow-x-auto pb-2">
                <div className="grid items-start gap-4" style={boardGridStyle}>
                  {groupedByStation.map((group) => {
                    const expanded = Boolean(expandedStationIds[group.stationId]);
                    const visibleOrders = expanded ? group.orders : group.orders.slice(0, 3);
                    const hoveredOrderIndex = group.orders.findIndex((order) => order.order_id === dragOverOrderId);
                    const placeholderIndex = activeOrderId != null && hoveredStationId === group.stationId
                      ? hoveredOrderIndex >= 0
                        ? Math.min(hoveredOrderIndex, visibleOrders.length)
                        : visibleOrders.length
                      : null;
                    const stationStatus = getStationStatusMeta(group.stationStatus, t);

                    return (
                      <div
                        key={group.stationId}
                        className="overflow-hidden rounded-lg border shadow-sm"
                        style={{
                          background: 'rgba(255, 255, 255, 0.92)',
                          borderColor: hoveredStationId === group.stationId
                            ? 'rgba(14, 165, 233, 0.26)'
                            : 'var(--dd-border)',
                          boxShadow: hoveredStationId === group.stationId
                            ? '0 20px 40px rgba(14, 165, 233, 0.08)'
                            : '0 10px 30px rgba(15, 23, 42, 0.04)',
                        }}
                      >
                        <div
                          className="border-b px-4 py-4"
                          style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.96))',
                            borderColor: 'var(--dd-border)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div
                                className="truncate text-sm font-black uppercase"
                                style={{ color: 'var(--dd-text-primary)' }}
                              >
                                {group.stationName}
                              </div>
                              <div
                                className="mt-2 text-[11px] font-bold uppercase"
                                style={{ color: 'var(--dd-text-muted)' }}
                              >
                                {group.orders.length} {t('vehicleCount')}
                              </div>
                            </div>

                            <span className={stationStatus.chipClass}>
                              {stationStatus.label}
                            </span>
                          </div>
                        </div>

                        <MemoStationQueueDropZone
                          group={group}
                          visibleOrders={visibleOrders}
                          expanded={expanded}
                          activeOrder={activeOrder}
                          activeOrderId={activeOrderId}
                          dragOverOrderId={dragOverOrderId}
                          placeholderIndex={placeholderIndex}
                          sourceStationId={sourceGroup?.stationId ?? null}
                          hoveredStationId={hoveredStationId}
                          reorderingKey={reorderingKey}
                          onReorder={(index, direction) => handleReorder(group.stationId, index, direction)}
                          onToggleExpanded={() => toggleStationExpanded(group.stationId)}
                          isManualMode={dispatchMode === 'manual'}
                          t={t}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <SortableContext
                items={mergedFlowOrders.map(({ order }) => order.order_id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {mergedFlowOrders.map(({ group, order, actualIndex }, displayIndex) => (
                    <SortableVehicleItem
                      key={order.order_id}
                      order={order}
                      stationId={group.stationId}
                      actualIndex={actualIndex}
                      style={getFlowStyle(order, actualIndex < 3)}
                      isBusy={reorderingKey === String(order.order_id)}
                      onReorder={(direction) => handleReorder(group.stationId, actualIndex, direction)}
                      canMoveUp={actualIndex > 0}
                      canMoveDown={actualIndex < group.orders.length - 1}
                      displayIndex={displayIndex}
                      stationName={group.stationName}
                      isManualMode={dispatchMode === 'manual'}
                      isSelected={selectedOrderIds.includes(order.order_id)}
                      onToggleSelect={(checked: boolean) => toggleOrderSelection(order.order_id, checked)}
                      manualStationOptions={flowStationOptions}
                      manualStationValue={manualOrderStationMap[order.order_id]}
                      manualTargetStationName={flowStationNameById.get(
                        manualOrderStationMap[order.order_id] || manualStationId,
                      )}
                      onManualStationChange={(stationId: string) => handleManualOrderStationChange(order.order_id, stationId)}
                      onManualStationClear={() => clearManualOrderStation(order.order_id)}
                      isDropTarget={dragOverOrderId === order.order_id && activeOrderId !== order.order_id}
                      t={t}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
        {activeOrder && activeOrderMeta ? (
          <DraggedVehiclePreview
            order={activeOrder}
            actualIndex={activeOrderMeta.actualIndex}
            style={activeOrderMeta.style}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default React.memo(ActivityFlow);
