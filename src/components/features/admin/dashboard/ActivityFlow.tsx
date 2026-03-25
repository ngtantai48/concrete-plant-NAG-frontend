import React, { useMemo } from 'react';
import type { Station } from '@/services/station.service';
import type { Vehicle } from '@/services/vehicle.service';
import type { Order } from '@/services/order.service';

interface ActivityFlowProps {
  stations: Station[];
  vehicles: Vehicle[];
  orders: Order[];
}

const getFlowStyle = (order: Order, stations: Station[]) => {
  if (order.order_status === 'pending') {
    return { text: 'ĐANG ĐỢI', color: 'text-amber-500', dot: 'bg-amber-400' };
  }
  if (order.order_status === 'collecting') {
    const station = stations.find(s => s.station_id === order.stations?.station_id);
    if (station?.station_status === 'collecting' && order.vehicles?.vehicle_status === 'collecting') {
      return { text: 'VÀO TRẠM', color: 'text-emerald-600', dot: 'bg-emerald-400' };
    }
    return { text: 'CHUẨN BỊ', color: 'text-cyan-500', dot: 'bg-cyan-400' };
  }
  return { text: order.order_status.toUpperCase(), color: 'text-slate-400', dot: 'bg-slate-300' };
};

export default function ActivityFlow({ stations, vehicles, orders }: ActivityFlowProps) {
  const groupedByStation = useMemo(() => {
    const activeOrders = orders.filter(o => o.order_status === "pending" || o.order_status === "collecting");

    const stationMap: Record<string, { stationName: string; stationId: number; orders: typeof activeOrders }> = {};

    activeOrders.forEach(order => {
      const sName = order.stations?.station_name || "Chưa gán";
      const sId = order.stations?.station_id || 0;
      const key = String(sId);
      if (!stationMap[key]) {
        stationMap[key] = { stationName: sName, stationId: sId, orders: [] };
      }
      stationMap[key].orders.push(order);
    });

    return Object.values(stationMap).sort((a, b) => a.stationName.localeCompare(b.stationName));
  }, [orders]);

  return (
    <div className="border border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
      {groupedByStation.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-slate-400 text-center font-mono text-xs uppercase tracking-widest">- TRỐNG -</p>
        </div>
      ) : (
        <div className="divide-y-2 divide-slate-900">
          {groupedByStation.map((group) => (
            <div key={group.stationId}>
              <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center">
                <span className="font-mono font-black text-sm uppercase tracking-widest">{group.stationName}</span>
                <span className="bg-amber-400 text-black text-[10px] font-black px-2 py-0.5">{group.orders.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.orders.map((order) => {
                  const style = getFlowStyle(order, stations);
                  return (
                    <div key={order.order_id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                      <span className="font-mono font-bold text-slate-800 text-sm min-w-[120px]">
                        {order.vehicles?.vehicle_license_plate || `#${order.order_id}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>
                          {style.text}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 uppercase">
                        {order.users?.user_full_name || "---"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
