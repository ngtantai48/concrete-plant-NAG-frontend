"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Typography } from "antd";
import { Activity } from "lucide-react";
import dayjs from "dayjs";
import fuelApi from "@/services/fuel.service";
import vehicleApi from "@/services/vehicle.service";
import type { VehicleTankStatus } from "@/types/report";
import type { Vehicle } from "@/types/vehicle";
import TankStatusTab from "./fuel/TankStatusTab";

const { Title } = Typography;
const toVehicleId = (value: any): number | undefined => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : undefined;
};

export default function FuelConsumptionReport() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [focusedVehicleId, setFocusedVehicleId] = useState<number | undefined>();
  const [useVTracking, setUseVTracking] = useState(true);
  const [tankData, setTankData] = useState<VehicleTankStatus[]>([]);
  const [tankLoading, setTankLoading] = useState(false);

  useEffect(() => {
    vehicleApi.getAll({ limit: 100 }).then(r => setVehicles(r.data.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const originalWarn = console.warn;

    console.warn = (...args: unknown[]) => {
      const message = args.map((item) => (typeof item === "string" ? item : "")).join(" ");
      if (message.includes("The width(-1) and height(-1) of chart should be greater than 0")) {
        return;
      }
      originalWarn(...args);
    };

    return () => {
      console.warn = originalWarn;
    };
  }, []);

  const fetchTankData = useCallback((options?: { silent?: boolean }) => {
    const isSilent = options?.silent === true;
    if (!isSilent) setTankLoading(true);
    return fuelApi.getTankStatus({
      to: dayjs().format("YYYY-MM-DD HH:mm:ss"),
      include_vtracking_runtime: 1,
      runtime_concurrency: 1,
    })
      .then(r => {
        const d = r?.data;
        const items = d?.items || (Array.isArray(d) ? d : []);
        setTankData(items);
        setFocusedVehicleId((prev) => {
          if (!items.length) return undefined;
          const normalizedPrev = toVehicleId(prev);
          if (normalizedPrev && items.some((item: VehicleTankStatus) => toVehicleId(item.vehicle_id) === normalizedPrev)) {
            return normalizedPrev;
          }
          return toVehicleId(items[0].vehicle_id);
        });
      })
      .catch(console.error)
      .finally(() => {
        if (!isSilent) setTankLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchTankData();
  }, [fetchTankData]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchTankData({ silent: true });
    }, 60000);
    return () => clearInterval(timer);
  }, [fetchTankData]);

  const focusedVehicleLabel = useMemo(() => {
    const focus = tankData.find((item) => item.vehicle_id === focusedVehicleId);
    if (focus) return `${focus.vehicle_name} — ${focus.vehicle_license_plate}`;
    const veh = vehicles.find((item) => item.vehicle_id === focusedVehicleId);
    return veh ? `${veh.vehicle_name} — ${veh.vehicle_license_plate}` : "";
  }, [tankData, vehicles, focusedVehicleId]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Activity size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Title level={4} className="m-0 font-black text-slate-800">Quản lý Nhiên liệu</Title>
                {focusedVehicleLabel && (
                  <span className="inline-flex items-center rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                    {focusedVehicleLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 text-emerald-600 font-black text-[11px] px-3 py-2 rounded-xl flex items-center gap-2 border border-emerald-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              CHẾ ĐỘ GIÁM SÁT REALTIME
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <TankStatusTab
          tanks={tankData}
          loading={tankLoading}
          useVTracking={useVTracking}
          setUseVTracking={setUseVTracking}
          vehicles={vehicles}
          selectedVehicleId={focusedVehicleId}
          onRequestRefresh={() => fetchTankData({ silent: true })}
          onSelectedVehicleChange={setFocusedVehicleId}
        />
      </div>

      <style jsx global>{`
        .fuel-table .ant-table-thead>tr>th{background:#fff!important;color:#94a3b8!important;font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #f1f5f9!important;padding:14px 20px}
        .fuel-table .ant-table-tbody>tr>td{border-bottom:1px solid #f8fafc!important;padding:16px 20px;font-size:14px}
        .fuel-table .ant-table-tbody>tr:hover>td{background:#f8fafc!important}
      `}</style>
    </div>
  );
}
