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
import { ArrowRight, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
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
  onManualStationChange?: (stationId: string) => void;
  isDropTarget?: boolean;
  t: (key: string) => string;
}

export function SortableVehicleItem({
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
  onManualStationChange,
  isDropTarget = false,
  t,
}: SortableVehicleItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: order.order_id,
    data: {
      type: 'order',
      orderId: order.order_id,
      stationId,
    },
  });

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.18 : 1,
    scale: isDragging ? 0.98 : 1,
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
      className={`relative overflow-hidden rounded-2xl px-4 py-3 transition-all group shadow-sm ${isSelected ? 'ring-2 ring-sky-500/20' : ''} ${isDragging ? 'cursor-grabbing shadow-lg' : 'cursor-default'}`}
      onMouseEnter={e => {
        if (!isDragging && !isDropTarget) {
          e.currentTarget.style.borderColor = 'var(--dd-border-hover)';
          e.currentTarget.style.background = 'var(--dd-bg-card-hover)';
        }
      }}
      onMouseLeave={e => {
        if (!isDragging && !isDropTarget) {
          e.currentTarget.style.borderColor = 'var(--dd-border)';
          e.currentTarget.style.background = 'var(--dd-bg-card)';
        }
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: style.dot, opacity: 0.8 }} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4 pl-2">
          {isManualMode && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelect?.(checked === true)}
              onClick={(event) => event.stopPropagation()}
              aria-label={t('manualSelectVehicle')}
            />
          )}

          <div
            {...(isManualMode ? {} : attributes)}
            {...(isManualMode ? {} : listeners)}
            className={`p-1 -ml-1 transition-colors ${isManualMode ? 'cursor-not-allowed text-slate-300' : 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-sky-500'}`}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold tracking-[0.05em] shadow-sm" style={{ color: 'var(--dd-text-secondary)', border: '1px solid var(--dd-border)' }}>
            #{(displayIndex ?? actualIndex) + 1}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-black tracking-widest" style={{ color: 'var(--dd-text-primary)' }}>
              {order.vehicles?.vehicle_license_plate || `ĐƠN: ${order.order_id}`}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pl-2 md:pl-0">
          <div className="flex flex-wrap items-center gap-3">
            {stationName && (
              <div
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: isDropTarget ? 'var(--dd-sky)' : 'var(--dd-text-muted)' }}
              >
                <ArrowRight className="h-3.5 w-3.5 text-sky-500" />
                <span style={{ color: 'var(--dd-text-primary)' }}>
                  {stationName}
                </span>
              </div>
            )}

            {isManualMode && isSelected && (
              <Select value={manualStationValue} onValueChange={onManualStationChange}>
                <SelectTrigger
                  size="sm"
                  className="w-[190px] bg-white text-xs font-bold uppercase tracking-[0.08em]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <SelectValue placeholder={t('manualChooseStation')} />
                </SelectTrigger>
                <SelectContent>
                  {manualStationOptions.map((station) => (
                    <SelectItem key={station.station_id} value={String(station.station_id)}>
                      {station.station_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        </div>
      </div>
    </div>
  );
}
