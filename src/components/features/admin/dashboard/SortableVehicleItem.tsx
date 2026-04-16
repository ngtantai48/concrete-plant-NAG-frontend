"use client";

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowRight, ChevronUp, ChevronDown, GripVertical, X, Clock } from 'lucide-react';
import type { Order } from '@/types/order';
import type { Station } from '@/types/station';

interface SortableVehicleItemProps {
  order: Order;
  stationId: number;
  index?: number;
  actualIndex: number;
  style: {
    text: string;
    chipClass: string;
    dot: string;
    icon: React.ReactNode;
  };
  isBusy: boolean;
  onReorder: (direction: 'up' | 'down') => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  displayIndex?: number;
  stationName?: string;
  isManualMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (checked: boolean) => void;
  manualStationOptions?: Station[];
  manualStationValue?: string;
  manualTargetStationName?: string;
  onManualStationChange?: (stationId: string) => void;
  onManualStationClear?: () => void;
  isDropTarget?: boolean;
  t: (key: string) => string;
}

function SortableVehicleItemBase({
  order,
  stationId,
  actualIndex,
  style,
  isBusy,
  onReorder,
  canMoveUp,
  canMoveDown,
  displayIndex,
  stationName,
  isManualMode = false,
  isSelected = false,
  onToggleSelect,
  manualStationOptions = [],
  manualStationValue,
  manualTargetStationName,
  onManualStationChange,
  onManualStationClear,
  isDropTarget = false,
  t,
}: SortableVehicleItemProps) {
  const displayedStationName = isManualMode && isSelected
    ? (manualTargetStationName || stationName)
    : stationName;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({
    id: order.order_id,
    data: {
      type: 'order',
      orderId: order.order_id,
      stationId,
    },
  });

  const dndStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.18 : 1,
    willChange: isDragging ? 'transform' : undefined,
    background: isDropTarget
      ? 'linear-gradient(180deg, rgba(14, 165, 233, 0.08), rgba(125, 211, 252, 0.04))'
      : 'var(--dd-bg-card)',
    border: isDropTarget ? '1px solid rgba(14, 165, 233, 0.35)' : '1px solid var(--dd-border)',
    boxShadow: isDropTarget ? '0 0 0 3px rgba(14, 165, 233, 0.08)' : '0 6px 18px rgba(15, 23, 42, 0.04)',
  };

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={`sortable-vehicle-item relative overflow-hidden rounded-lg px-4 py-3 group shadow-sm ${isSelected ? 'ring-2 ring-sky-500/20' : ''} ${isDragging ? 'cursor-grabbing shadow-lg is-dragging' : 'cursor-default'}`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: style.dot, opacity: 0.8 }} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {isManualMode && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelect?.(checked === true)}
              onClick={(event) => event.stopPropagation()}
              aria-label={t('manualSelectVehicle')}
            />
          )}

          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-extrabold"
            style={{ color: 'var(--dd-text-secondary)', border: '1px solid var(--dd-border)' }}
          >
            {(displayIndex ?? actualIndex) + 1}
          </div>

          <div className="min-w-0 flex-1 flex items-center gap-3">
            <div className="truncate text-base font-black" style={{ color: 'var(--dd-text-primary)' }}>
              {order.vehicles?.vehicle_license_plate ? `${order.vehicles.vehicle_license_plate}${order.vehicles.vehicle_name ? ` | ${order.vehicles.vehicle_name}` : ''}` : `ĐƠN: ${order.order_id}`}
            </div>
            {order.order_init_datetime && (
              <div className="flex items-center gap-1 text-[11px] uppercase font-bold" style={{ color: 'var(--dd-text-muted)' }}>
                <Clock className="h-3 w-3" />
                <span><span className="opacity-75">Vào lúc:</span> <span style={{ color: 'var(--dd-text-primary)' }}>{`${new Date(order.order_init_datetime).getHours()} giờ ${new Date(order.order_init_datetime).getMinutes().toString().padStart(2, '0')} phút`}</span></span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-2 pl-2 md:pl-0 shrink-0">
          <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
            {/* {displayedStationName && (
              <div
                className="flex items-center text-[14px] font-bold"
                style={{ color: isDropTarget ? 'var(--dd-sky)' : 'var(--dd-text-muted)' }}
              >
                <ArrowRight className="h-3.5 w-3.5 text-sky-500" />
                <span style={{ color: 'var(--dd-text-primary)' }}>
                  {displayedStationName}
                </span>
              </div>
            )} */}

            {isManualMode && isSelected && (
              <div className="flex items-center gap-2">
                <Select key={manualStationValue ?? 'manual-empty'} value={manualStationValue} onValueChange={onManualStationChange}>
                  <SelectTrigger
                    size="sm"
                    className="w-[120px] h-8 bg-white text-[11px] font-bold uppercase"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <SelectValue placeholder={t('manualChooseStation')} />
                  </SelectTrigger>
                  <SelectContent >
                    {manualStationOptions.map((station) => (
                      <SelectItem key={station.station_id} value={String(station.station_id)}>
                        {station.station_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {manualStationValue && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onManualStationClear?.();
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-all hover:text-slate-700"
                    title={t('manualClearStation')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            <div className={style.chipClass}>
              {style.icon}
              {style.text}
            </div>

            {isDropTarget && (
              <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--dd-sky)' }}>
                {t('dropHereBadge')}
              </span>
            )}
          </div>

          {isManualMode && (
            <div className="flex items-center gap-1 md:ml-auto">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReorder('up'); }}
                disabled={isBusy || !canMoveUp}
                title={t('moveUp')}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: 'var(--dd-bg-surface)',
                  border: '1px solid var(--dd-border)',
                  color: 'var(--dd-text-secondary)',
                }}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReorder('down'); }}
                disabled={isBusy || !canMoveDown}
                title={t('moveDown')}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: 'var(--dd-bg-surface)',
                  border: '1px solid var(--dd-border)',
                  color: 'var(--dd-text-secondary)',
                }}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const SortableVehicleItem = React.memo(SortableVehicleItemBase);
