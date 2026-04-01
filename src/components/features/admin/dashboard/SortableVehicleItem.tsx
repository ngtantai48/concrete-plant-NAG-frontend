"use client";

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import type { Order } from '@/types/order';

interface SortableVehicleItemProps {
  order: Order;
  stationId: number;
  index: number;
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
    background: 'var(--dd-bg-card)',
    border: '1px solid var(--dd-border)',
  };

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-all relative overflow-hidden group shadow-sm ${isDragging ? 'cursor-grabbing shadow-lg' : 'cursor-default'}`}
      onMouseEnter={e => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = 'var(--dd-border-hover)';
          e.currentTarget.style.background = 'var(--dd-bg-card-hover)';
        }
      }}
      onMouseLeave={e => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = 'var(--dd-border)';
          e.currentTarget.style.background = 'var(--dd-bg-card)';
        }
      }}
    >
      {/* Status scanline indicator */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: style.dot, opacity: 0.8 }} />

      <div className="flex min-w-[150px] items-center gap-4 pl-2">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-400 hover:text-sky-500 transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </div>

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
  );
}
