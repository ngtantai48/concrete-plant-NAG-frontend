"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { Input, Spin, Empty, Switch, DatePicker, Button } from "antd";
import { Search, Route, Clock, AlertTriangle, Settings, Droplets, TrendingUp, CheckCircle2, Activity, MapPin, MoreHorizontal, Download, RefreshCw, Zap } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ReferenceDot } from "recharts";
import dayjs from "dayjs";
import dynamic from "next/dynamic";
import type { FuelVehicleSummary, VehicleTankStatus, VehicleFuelProfile, FuelEvent } from "@/types/report";
import { useNearbyVehicles } from "@/hooks/useNearbyVehicles";
import FuelMetricsTab from "./FuelMetricsTab";
import FuelProfilesTab from "./FuelProfilesTab";
import DashboardTab from "./DashboardTab";
import FuelEventsTab from "./FuelEventsTab";
import type { Vehicle } from "@/types/vehicle";
import fuelApi from "@/services/fuel.service";

const StationMap = dynamic(
  () => import("@/components/features/admin/dashboard/StationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <RefreshCw className="w-8 h-8 mb-3 animate-spin text-blue-400" />
        <span className="font-bold text-sm">Đang tải bản đồ...</span>
      </div>
    )
  }
);

const N = (v: any) => Number(v || 0);
const dec = (v: any) => N(v).toFixed(1);
const fmt = (v: any) => N(v) ? Math.round(N(v)).toLocaleString("vi-VN") : "0";
const formatVtrackingTime = (value: any) => {
  const ts = N(value);
  if (!ts) return "—";
  const ms = ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const parsed = dayjs(ms);
  return parsed.isValid() ? parsed.format("HH:mm:ss DD/MM") : "—";
};
const kmValue = (tank: VehicleTankStatus) => N((tank as any).odometer_delta_km ?? tank.total_distance_km);
const hasConfiguredBaseline = (tank: VehicleTankStatus) =>
  Boolean(
    tank.configured_opening_fuel_at &&
    (tank.configured_opening_fuel_liters !== undefined && tank.configured_opening_fuel_liters !== null ||
      tank.configured_opening_balance_liters !== undefined && tank.configured_opening_balance_liters !== null)
  );
const canComputeBaseline = (tank: VehicleTankStatus) => tank.can_compute_balance === true || hasConfiguredBaseline(tank);
const openingBaselineLiters = (tank: VehicleTankStatus) =>
  tank.period_opening_balance_liters ??
  tank.opening_balance_liters ??
  tank.configured_opening_balance_liters ??
  tank.configured_opening_fuel_liters ??
  0;

function GaugeCircle({ percent, size = 160, strokeWidth = 14 }: { percent: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, percent)) / 100) * circ;
  const color = percent < 20 ? "#ef4444" : percent < 50 ? "#f59e0b" : "#10b981";
  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90 drop-shadow-md">
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        {/* Glow behind */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="opacity-20 blur-sm transition-all duration-1000 ease-out" />
        {/* Main stroke */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
      </svg>
      {/* Center glowing pulse if low */}
      {percent < 20 && (
        <div className="absolute w-24 h-24 bg-rose-500/10 rounded-full animate-ping pointer-events-none" />
      )}
    </div>
  );
}


export default function TankStatusTab({ tanks, loading, useVTracking, setUseVTracking, vehicles, selectedVehicleId, onRequestRefresh, onSelectedVehicleChange }: { tanks: VehicleTankStatus[], loading: boolean, useVTracking: boolean, setUseVTracking: (v: boolean) => void, vehicles?: Vehicle[], selectedVehicleId?: number, onRequestRefresh?: () => void, onSelectedVehicleChange?: (vehicleId: number) => void }) {
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const fromDateTime = dateRange[0].startOf("day").format("YYYY-MM-DD HH:mm:ss");
  const toDateTime = useMemo(() => {
    const now = dayjs();
    const rangeEnd = dateRange[1].endOf("day");
    return (rangeEnd.isAfter(now) ? now : rangeEnd).format("YYYY-MM-DD HH:mm:ss");
  }, [dateRange]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(selectedVehicleId || null);
  const [activeTab, setActiveTab] = useState("Tổng quan");
  const [refreshTick, setRefreshTick] = useState(0);
  const [snapshotAt, setSnapshotAt] = useState(dayjs().format("YYYY-MM-DD HH:mm:ss"));
  const detailReqIdRef = useRef(0);
  const todayReqIdRef = useRef(0);
  const timeseriesReqIdRef = useRef(0);

  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [loadingTimeseries, setLoadingTimeseries] = useState(false);
  const [events, setEvents] = useState<FuelEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [activeProfile, setActiveProfile] = useState<VehicleFuelProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [detailedTank, setDetailedTank] = useState<VehicleTankStatus | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [todaySnapshot, setTodaySnapshot] = useState<VehicleTankStatus | null>(null);
  const [loadingTodaySnapshot, setLoadingTodaySnapshot] = useState(false);
  const baseTank = useMemo(() => tanks.find(t => t.vehicle_id === selectedId) || tanks[0], [tanks, selectedId]);

  // The "active" tank is the detailed one if available and VTracking is on, otherwise the base one
  const activeTank = (useVTracking && detailedTank && detailedTank.vehicle_id === baseTank.vehicle_id) ? detailedTank : baseTank;
  const displayTanks = useMemo(
    () => tanks.map((tank) => (tank.vehicle_id === activeTank?.vehicle_id ? { ...tank, ...activeTank } : tank)),
    [tanks, activeTank]
  );

  const triggerDataRefresh = () => {
    setSnapshotAt(dayjs().format("YYYY-MM-DD HH:mm:ss"));
    setRefreshTick(v => v + 1);
    onRequestRefresh?.();
  };

  useEffect(() => {
    setSnapshotAt(dayjs().format("YYYY-MM-DD HH:mm:ss"));
    setRefreshTick(v => v + 1);
  }, [tanks]);

  // Fetch Detailed Runtime for selected vehicle
  useEffect(() => {
    if (!baseTank?.vehicle_id || !useVTracking) {
      setDetailedTank(null);
      return;
    }
    const reqId = ++detailReqIdRef.current;
    setLoadingDetail(true);
    // Realtime overview must always anchor to configured opening date, not UI date filter.
    const baselineFrom = baseTank.configured_opening_fuel_at
      ? dayjs(baseTank.configured_opening_fuel_at).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      : undefined;
    const realtimeTo = snapshotAt;

    const params: any = {
      vehicle_id: baseTank.vehicle_id,
      to: realtimeTo,
      include_vtracking_runtime: 1,
      runtime_concurrency: 1
    };
    if (baselineFrom) params.from = baselineFrom;

    fuelApi.getTankStatus(params)
      .then(res => {
        if (reqId !== detailReqIdRef.current) return;
        const item = res.data?.items?.[0] || (Array.isArray(res.data) ? res.data[0] : null);
        if (item) setDetailedTank(item);
      })
      .catch(console.error)
      .finally(() => {
        if (reqId === detailReqIdRef.current) setLoadingDetail(false);
      });
  }, [baseTank?.vehicle_id, baseTank?.configured_opening_fuel_at, useVTracking, refreshTick, snapshotAt]);

  useEffect(() => {
    if (!baseTank?.vehicle_id) {
      setTodaySnapshot(null);
      return;
    }
    const reqId = ++todayReqIdRef.current;
    setLoadingTodaySnapshot(true);
    fuelApi.getTankStatus({
      vehicle_id: baseTank.vehicle_id,
      from: dayjs().startOf("day").format("YYYY-MM-DD HH:mm:ss"),
      to: snapshotAt,
      include_vtracking_runtime: 1,
      runtime_concurrency: 1,
    })
      .then((res) => {
        if (reqId !== todayReqIdRef.current) return;
        const item = res.data?.items?.[0] || (Array.isArray(res.data) ? res.data[0] : null);
        setTodaySnapshot(item || null);
      })
      .catch(console.error)
      .finally(() => {
        if (reqId === todayReqIdRef.current) setLoadingTodaySnapshot(false);
      });
  }, [baseTank?.vehicle_id, refreshTick, snapshotAt]);

  // Fetch Fuel Profile for selected vehicle to compare
  useEffect(() => {
    if (!baseTank?.vehicle_id) return;
    setLoadingProfile(true);
    fuelApi.getProfiles({ vehicle_id: baseTank.vehicle_id, limit: 1 })
      .then(res => {
        const p = Array.isArray(res.data) ? res.data[0] : (res.data as any)?.data?.[0];
        setActiveProfile(p || null);
      })
      .catch(console.error)
      .finally(() => setLoadingProfile(false));
  }, [baseTank?.vehicle_id]);

  const filtered = useMemo(() => {
    let list = displayTanks;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.vehicle_name?.toLowerCase().includes(s) || t.vehicle_license_plate?.toLowerCase().includes(s));
    }
    return list;
  }, [displayTanks, search]);

  useEffect(() => {
    if (selectedVehicleId && selectedVehicleId !== selectedId) {
      setSelectedId(selectedVehicleId);
    }
  }, [selectedVehicleId, selectedId]);

  useEffect(() => {
    if (activeTank?.vehicle_id) {
      onSelectedVehicleChange?.(activeTank.vehicle_id);
    }
  }, [activeTank?.vehicle_id, onSelectedVehicleChange]);

  useEffect(() => {
    if (!activeTank?.vehicle_id) return;
    const reqId = ++timeseriesReqIdRef.current;
    setLoadingTimeseries(true);
    const realtimeFrom = dayjs(snapshotAt).startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const realtimeTo = snapshotAt;
    fuelApi.getTankTimeseries({ vehicle_id: activeTank.vehicle_id, from: realtimeFrom, to: realtimeTo, step_minutes: 30 })
      .then(res => {
        if (reqId !== timeseriesReqIdRef.current) return;
        const sorted = [...(res.data.timeseries || [])].sort(
          (left, right) => dayjs(left.time).valueOf() - dayjs(right.time).valueOf()
        );
        const nowPoint = {
          time: realtimeTo,
          fuel_liters: N(activeTank.current_fuel_liters),
          is_event: false,
        };
        const withRealtimeTail = sorted.length > 0
          ? [...sorted, nowPoint]
          : [nowPoint];
        setTimeseries(withRealtimeTail);
      })
      .catch(console.error)
      .finally(() => {
        if (reqId === timeseriesReqIdRef.current) setLoadingTimeseries(false);
      });
  }, [activeTank?.vehicle_id, activeTank?.current_fuel_liters, refreshTick, snapshotAt]);

  // Fetch vtracking data for map with a dummy center (Da Nang) and large radius
  // Reduced interval to 60s and radius to 500km to avoid heavy processing
  const { vehicles: vtrackingVehicles } = useNearbyVehicles(108.2022, 16.0544, 500000, 60000);

  // Generate real alerts from tanks
  const systemAlerts = useMemo(() => {
    const alerts: { id: string, name: string, plate: string, msg: string, color: string }[] = [];
    displayTanks.forEach(t => {
      if (!canComputeBaseline(t)) alerts.push({ id: `base_${t.vehicle_id}`, name: t.vehicle_name, plate: t.vehicle_license_plate, msg: 'Thiếu mốc tồn đầu kỳ', color: 'rose' });
      if (Math.abs(N(t.variance_percent)) > 15) alerts.push({ id: `var_${t.vehicle_id}`, name: t.vehicle_name, plate: t.vehicle_license_plate, msg: `Chênh lệch hao hụt ${t.variance_percent.toFixed(1)}%`, color: 'amber' });
      if (N(t.tank_capacity_liters) <= 0) alerts.push({ id: `cap_${t.vehicle_id}`, name: t.vehicle_name, plate: t.vehicle_license_plate, msg: 'Chưa cấu hình dung tích bình', color: 'slate' });
    });
    return alerts;
  }, [displayTanks]);

  // Match vtracking vehicle
  const vtVehicle = useMemo(() => {
    if (!activeTank) return undefined;
    return vtrackingVehicles.find(v => v.license_plate?.replace(/[-.]/g, '') === activeTank.vehicle_license_plate?.replace(/[-.]/g, '') || v.vehicle_name === activeTank.vehicle_name);
  }, [vtrackingVehicles, activeTank]);

  // Fetch Events - Only refetch if vehicle_id actually changes
  React.useEffect(() => {
    if (!activeTank?.vehicle_id) return;
    setLoadingEvents(true);
    fuelApi.getEvents({ vehicle_id: activeTank.vehicle_id, page: 1, limit: 5 })
      .then(res => setEvents(res.data?.data || []))
      .catch(console.error)
      .finally(() => setLoadingEvents(false));
  }, [activeTank?.vehicle_id, refreshTick]);

  if (loading) return <div className="flex justify-center items-center h-64"><Spin size="large" /></div>;
  if (!tanks.length) return <Empty description="Không có dữ liệu" className="mt-10" />;
  if (!activeTank) return null;

  // Active tank stats
  const pct = N(activeTank.current_fuel_percent);
  const noBaseline = !canComputeBaseline(activeTank);
  const noConfig = N(activeTank.tank_capacity_liters) <= 0;
  const displayDistanceKm = N(activeTank.odometer_delta_km ?? activeTank.total_distance_km);
  const displayIdleMinutes = N(activeTank.engine_on_idle_minutes ?? activeTank.total_idle_minutes);
  const idleH = (displayIdleMinutes / 60).toFixed(1);
  const displayEngineHours = N(activeTank.engine_on_minutes_total ?? displayIdleMinutes) / 60;
  const todayDistanceKm = N(todaySnapshot?.odometer_delta_km ?? todaySnapshot?.total_distance_km);
  const todayIdleMinutes = N(todaySnapshot?.engine_on_idle_minutes ?? todaySnapshot?.total_idle_minutes);
  const todayIdleHours = (todayIdleMinutes / 60).toFixed(1);
  const todayDriveEstimatedLiters = N(
    todaySnapshot?.distance_component_liters ??
    (todayDistanceKm * N(activeProfile?.default_l_per_100km) / 100)
  );
  const todayIdleEstimatedLiters = N(
    todaySnapshot?.idle_component_liters ??
    ((todayIdleMinutes / 60) * N(activeProfile?.idle_l_per_hour))
  );
  const todayEstimatedLiters = N(todaySnapshot?.estimated_used_liters);
  const estPctDrive = N(activeTank.estimated_used_liters) > 0 ? ((N(activeTank.distance_component_liters) / N(activeTank.estimated_used_liters)) * 100).toFixed(1) : "0";
  const estPctIdle = N(activeTank.estimated_used_liters) > 0 ? ((N(activeTank.idle_component_liters) / N(activeTank.estimated_used_liters)) * 100).toFixed(1) : "0";
  const estimatedBalanceNow = openingBaselineLiters(activeTank) + N(activeTank.refuel_in_liters) - N(activeTank.estimated_used_liters);
  const fuelSourceLabel =
    activeTank.fuel_estimation_source === "vtracking_engine_runtime"
      ? "VTracking Engine runtime"
      : activeTank.fuel_estimation_source === "vtracking_motion_runtime"
        ? "VTracking Motion runtime"
        : "Order metrics";
  const vtrackingLastSeenLabel = formatVtrackingTime(vtVehicle?.timestamp);

  return (
    <div className="flex flex-col gap-3 bg-slate-50 min-h-screen p-3 -mt-4 -mx-4 scale-[0.98] origin-top">
      {/* ─── TOP STATS ROW ─── */}
      <div className="flex items-stretch justify-between gap-3">
        <div className="grid grid-cols-5 gap-3 flex-1 min-w-0">
          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Droplets size={16} /></div>
              <div className="text-[11px] font-black text-slate-500 uppercase">Mức dầu realtime</div>
            </div>
            <div className="text-xl font-black text-slate-900">
              {noBaseline ? "N/A" : `${dec(activeTank.current_fuel_liters)} L`}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-1">
              {noBaseline ? "Thiếu mốc chốt để tính tồn" : `${pct.toFixed(0)}% bình · cập nhật ${dayjs(snapshotAt).format("HH:mm:ss")}`}
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><Route size={16} /></div>
              <div className="text-[11px] font-black text-slate-500 uppercase">Hoạt động hôm nay</div>
            </div>
            <div className="text-xl font-black text-slate-900">{dec(todayDistanceKm)} km</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1">{todayIdleHours}h nổ máy chờ</div>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center"><TrendingUp size={16} /></div>
              <div className="text-[11px] font-black text-slate-500 uppercase">Ước tính hôm nay</div>
            </div>
            <div className="text-xl font-black text-violet-700">{dec(todayEstimatedLiters)} L</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1">{dec(todayDriveEstimatedLiters)} chạy + {dec(todayIdleEstimatedLiters)} chờ</div>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center"><Clock size={16} /></div>
              <div className="text-[11px] font-black text-slate-500 uppercase">Tồn theo mốc chốt</div>
            </div>
            <div className="text-xl font-black text-slate-900">{noBaseline ? "N/A" : `${dec(estimatedBalanceNow)} L`}</div>
            <div className="text-[10px] font-bold text-slate-400 mt-1">
              {noBaseline ? "Cần cấu hình mốc đầu kỳ" : `${dec(openingBaselineLiters(activeTank))} + ${dec(activeTank.refuel_in_liters)} - ${dec(activeTank.estimated_used_liters)}`}
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center"><Settings size={16} /></div>
              <div className="text-[11px] font-black text-slate-500 uppercase">Xe đang hiển thị</div>
            </div>
            <div className="text-xl font-black text-slate-900">
              {activeTank.vehicle_name}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-1">
              Biển số: {activeTank.vehicle_license_plate}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 border border-slate-200 min-w-[200px] flex flex-col justify-between">
          <div className="text-[11px] font-black text-slate-500 uppercase mb-2">Nguồn dữ liệu</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600">Ưu tiên VTracking</span>
            <Switch checked={useVTracking} onChange={setUseVTracking} className={useVTracking ? "bg-emerald-500" : "bg-slate-300"} />
          </div>
          <div className="text-[11px] font-black text-emerald-600">{fuelSourceLabel}</div>
          <div className="text-[10px] font-bold text-slate-400 mt-1">GPS cập nhật: {vtrackingLastSeenLabel}</div>
        </div>
      </div>

      {/* ─── MAIN 3 COLUMNS ─── */}
      <div className="flex gap-4 items-start" style={{ height: 'calc(100vh - 160px)' }}>

        {/* LEFT COLUMN: Vehicle List */}
        <div className="w-72 flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex-shrink-0">
            <div className="text-xs font-black text-slate-400 uppercase mb-2">Danh sách xe ({tanks.length})</div>
            <Input prefix={<Search size={14} className="text-slate-400" />} placeholder="Tìm xe, biển số..." value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg text-sm bg-slate-50 border-slate-200" />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.map(t => {
              const isSel = t.vehicle_id === activeTank.vehicle_id;
              const tNoBase = !canComputeBaseline(t);
              return (
                <div key={t.vehicle_id} onClick={() => setSelectedId(t.vehicle_id)}
                  className={`flex items-center p-3 border-b border-slate-50 cursor-pointer transition-colors ${isSel ? 'bg-blue-600 text-white' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${isSel ? 'bg-white' : tNoBase ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                    <div>
                      <div className={`font-black text-sm leading-tight ${isSel ? 'text-white' : 'text-slate-800'}`}>{t.vehicle_name}</div>
                      <div className={`font-bold text-[11px] mt-1 leading-tight ${isSel ? 'text-blue-100' : 'text-slate-500'}`}>{t.vehicle_license_plate}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* MIDDLE COLUMN: Detail Main */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 flex flex-col h-full overflow-hidden p-4 relative" id="fuel-report-detail">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <div className="text-xl font-black text-slate-800">{activeTank.vehicle_name} - {activeTank.vehicle_license_plate}</div>
              {loadingDetail && <Spin size="small" className="ml-2" />}
            </div>
            <div className="flex items-center gap-2">
              <DatePicker.RangePicker
                value={dateRange}
                onChange={(v) => v && setDateRange(v as any)}
                format="DD/MM/YYYY"
                className="rounded-lg border-slate-200 font-bold w-[240px]"
                size="small"
              />
              <Button
                icon={<Download size={14} />}
                size="small"
                className="rounded-lg font-bold border-slate-200 flex items-center gap-2 h-[24px] text-xs"
                onClick={() => window.print()}
              >
                Xuất báo cáo
              </Button>
            </div>
          </div>

          <div className="flex border-b border-slate-100 mb-4 gap-6">
            {['Tổng quan', 'Báo cáo', 'Chi tiết', 'Lịch sử', 'Đổ nhiên liệu', 'Theo chuyến', 'Cấu hình'].map((tab) => (
              <div key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-bold border-b-2 cursor-pointer transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {tab}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {activeTab === 'Tổng quan' ? (
              <>
                {/* Hero Gauge */}
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-10">
                    <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
                      {noBaseline ? (
                        <div className="w-32 h-32 bg-rose-50 rounded-full flex flex-col items-center justify-center border-4 border-dashed border-rose-200">
                          <AlertTriangle size={24} className="text-rose-400 mb-2" />
                          <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest text-center px-4">Thiếu mốc tồn kỳ</span>
                        </div>
                      ) : noConfig ? (
                        <div className="w-36 h-36 bg-slate-50 rounded-full flex flex-col items-center justify-center border-4 border-dashed border-slate-200">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest text-center leading-tight">Chưa cấu<br />hình bình</span>
                        </div>
                      ) : (
                        <>
                          <GaugeCircle percent={pct} size={130} />
                          <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                            <span className="font-black text-3xl text-slate-800 tracking-tighter">{pct.toFixed(0)}%</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Còn lại</span>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Mức nhiên liệu hiện tại</div>
                      <div className="font-black text-3xl text-slate-900 flex items-baseline gap-2 mb-2">
                        {noBaseline ? <span className="text-amber-500">N/A</span> : dec(activeTank.current_fuel_liters)}
                        <span className="text-base font-bold text-slate-300">/ {noConfig ? '—' : `${N(activeTank.tank_capacity_liters)} Lít`}</span>
                      </div>
                      {noBaseline ? (
                        <div className="text-xs font-bold text-amber-600 mb-4 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 max-w-fit">⚠ Cần cập nhật mốc tồn kỳ để tính toán</div>
                      ) : (
                        <div className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-slate-300" />
                          Số lít thực tế trong bình / Dung tích tối đa
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="bg-slate-900 text-white px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm"><Route size={14} className="text-blue-400" /> {dec(displayDistanceKm)} km</div>
                        <div className="bg-amber-100 text-amber-800 px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm border border-amber-200/50"><Clock size={14} className="text-amber-500" /> {idleH}h chờ</div>
                      </div>
                    </div>
                  </div>

                  {/* Visual Tank (Matched to Image) */}
                  {!noBaseline && !noConfig && (
                    <div className="flex items-center h-28 gap-3">
                      {/* The Tank */}
                      <div className="relative w-16 h-full rounded-[1.25rem] border-[3px] border-slate-200 overflow-hidden bg-white shadow-sm flex-shrink-0">
                        <style>{`
                    @keyframes flow-x { 0% { background-position-x: 0px; } 100% { background-position-x: 100px; } }
                    @keyframes bubble-rise {
                      0% { transform: translateY(10px) scale(0.5); opacity: 0; }
                      20% { opacity: 0.6; }
                      80% { opacity: 0.6; }
                      100% { transform: translateY(-150px) scale(1.2); opacity: 0; }
                    }
                  `}</style>

                        {/* Liquid Master Container */}
                        <div
                          className="absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out"
                          style={{ height: `${pct}%` }}
                        >
                          {/* Solid body + Internal waves + Bubbles (Clipped) */}
                          <div className="absolute inset-0 bg-emerald-500 overflow-hidden">
                            {/* Internal flowing lines */}
                            <div
                              className="absolute inset-0 opacity-40 mix-blend-multiply"
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 15 Q 25 30, 50 15 T 100 15' fill='none' stroke='%23047857' stroke-width='2' stroke-opacity='0.5'/%3E%3C/svg%3E")`,
                                backgroundSize: '100px 30px',
                                animation: 'flow-x 3s linear infinite'
                              }}
                            />
                            {/* Bubbles */}
                            {[
                              { left: '20%', size: '5px', dur: '3s', delay: '0s' },
                              { left: '45%', size: '3px', dur: '4s', delay: '1.2s' },
                              { left: '70%', size: '4px', dur: '3.5s', delay: '0.5s' },
                              { left: '85%', size: '3px', dur: '2.5s', delay: '2s' },
                              { left: '35%', size: '4px', dur: '4.5s', delay: '0.8s' },
                            ].map((b, i) => (
                              <div
                                key={i}
                                className="absolute -bottom-2 bg-white/60 rounded-full"
                                style={{ left: b.left, width: b.size, height: b.size, animation: `bubble-rise ${b.dur} ease-in infinite ${b.delay}` }}
                              />
                            ))}
                          </div>

                          {/* Top Surface Wave (Not clipped) */}
                          <div
                            className="absolute left-0 w-[200px] h-3"
                            style={{
                              top: '-11px',
                              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 20' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 20 L0 10 Q 25 20, 50 10 T 100 10 L100 20 Z' fill='%2310b981'/%3E%3C/svg%3E")`,
                              backgroundSize: '100px 100%',
                              animation: 'flow-x 2s linear infinite'
                            }}
                          />
                        </div>
                      </div>

                      {/* Scale and Ticks outside */}
                      <div className="relative h-[90%] flex flex-col justify-between w-8 flex-shrink-0">
                        {/* Vertical Line */}
                        <div className="w-[2px] h-full bg-slate-200 absolute left-0 top-0 rounded-full" />

                        {/* Current Level Pointer */}
                        <div
                          className="absolute flex items-center transition-all duration-1000 ease-out z-10"
                          style={{ bottom: `${pct}%`, transform: 'translateY(50%)', left: '-6px' }}
                        >
                          {/* Triangle pointing left */}
                          <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[6px] border-r-slate-300" />
                          {/* Line crossing the vertical axis */}
                          <div className="w-3 h-[2px] bg-slate-300" />
                        </div>

                        {/* Ticks & Labels */}
                        {[100, 75, 50, 25, 0].map(v => (
                          <div key={v} className="flex items-center gap-1.5 z-0 -ml-[1px]">
                            <span className="w-2.5 h-[2px] bg-slate-200 rounded-full" />
                            <span className="text-[10px] font-black text-slate-400 leading-none">{v === 100 ? 'F' : v === 0 ? 'E' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4 Column Stats Info */}
                <div className="bg-slate-50/50 rounded-2xl p-4 mb-4 border border-slate-100">
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Tồn đầu kỳ</div>
                      <div className="font-black text-blue-600 text-2xl">{noBaseline ? '—' : dec(openingBaselineLiters(activeTank))} <span className="text-xs font-bold opacity-60">Lít</span></div>
                      {activeTank.configured_opening_fuel_at && (
                        <div className="text-[10px] text-slate-400 font-bold mt-1">Chốt ngày: {dayjs(activeTank.configured_opening_fuel_at).format("DD/MM")}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Đổ vào trong kỳ</div>
                      <div className="font-black text-emerald-600 text-2xl">+{dec(activeTank.refuel_in_liters)} <span className="text-xs font-bold opacity-60">Lít</span></div>
                      <div className="text-[10px] text-slate-400 font-bold mt-1">Tổng cộng các lần đổ</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Ước tính tiêu hao</div>
                      <div className="font-black text-violet-600 text-2xl">{dec(activeTank.estimated_used_liters)} <span className="text-xs font-bold opacity-60">Lít</span></div>
                      <div className="text-[10px] text-slate-400 font-bold mt-1 flex items-center gap-1.5">
                        Theo {activeTank.fuel_estimation_source === 'vtracking_engine_runtime' ? 'Cảm biến' : activeTank.fuel_estimation_source === 'vtracking_motion_runtime' ? 'Di chuyển' : 'Thủ công'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Nổ máy chờ</div>
                      <div className="font-black text-slate-800 text-2xl">{idleH} <span className="text-xs font-bold opacity-60">giờ</span></div>
                      <div className="text-[10px] text-slate-400 font-bold mt-1">
                        {activeTank.idle_fallback_applied ? 'Chế độ: Dự phòng' : 'Thời gian nổ máy chờ'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* NEW SECTION: Today's VTracking Snapshot */}
                <div className="bg-blue-50/40 rounded-2xl p-4 mb-4 border border-blue-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
                      Hôm nay ({dayjs().format("DD/MM/YYYY")})
                    </div>
                    {loadingTodaySnapshot && <Spin size="small" />}
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-blue-100 p-3">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quãng đường hôm nay</div>
                      <div className="font-black text-blue-600 text-xl">{dec(todayDistanceKm)} <span className="text-xs font-bold opacity-60">km</span></div>
                      <div className="text-[10px] font-bold text-blue-400 mt-1">~ {dec(todayDriveEstimatedLiters)} Lít chạy</div>
                    </div>
                    <div className="bg-white rounded-xl border border-blue-100 p-3">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nổ máy chờ hôm nay</div>
                      <div className="font-black text-amber-600 text-xl">{todayIdleHours} <span className="text-xs font-bold opacity-60">giờ</span></div>
                      <div className="text-[10px] font-bold text-amber-500 mt-1">~ {dec(todayIdleEstimatedLiters)} Lít chờ</div>
                    </div>
                    <div className="bg-white rounded-xl border border-blue-100 p-3">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ước tính dùng hôm nay</div>
                      <div className="font-black text-violet-600 text-xl">{dec(todayEstimatedLiters)} <span className="text-xs font-bold opacity-60">Lít</span></div>
                      <div className="text-[10px] font-bold text-violet-400 mt-1">{dec(todayDriveEstimatedLiters)} + {dec(todayIdleEstimatedLiters)} Lít</div>
                    </div>
                  </div>
                </div>

                {/* NEW SECTION: Detailed Estimation Breakdown */}
                <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Chi tiết ước tính đã dùng (tính từ thời điểm chốt mốc) - {dayjs(activeTank.configured_opening_fuel_at).format("DD/MM/YYYY")}</div>
                  <div className="grid grid-cols-2 gap-6">
                    {/* Drive Component */}
                    <div className="flex items-start gap-5">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm">
                        <Route size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="font-black text-slate-800">Chạy đường</span>
                          <span className="font-black text-blue-600 text-lg">{dec(activeTank.distance_component_liters)} Lít</span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-400 mb-4 tracking-tight">
                          {dec(displayDistanceKm)} km × {activeProfile?.default_l_per_100km || '—'} Lít/100km
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${activeTank.estimated_used_liters > 0 ? (activeTank.distance_component_liters / activeTank.estimated_used_liters * 100) : 0}%` }}
                          />
                        </div>
                        <div className="text-right mt-1.5 text-[10px] font-black text-slate-400">
                          {(activeTank.estimated_used_liters > 0 ? (activeTank.distance_component_liters / activeTank.estimated_used_liters * 100) : 0).toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Idle Component */}
                    <div className="flex items-start gap-5">
                      <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm">
                        <Clock size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="font-black text-slate-800">Chờ / nổ máy</span>
                          <span className="font-black text-slate-900 text-lg">{dec(activeTank.idle_component_liters)} Lít</span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-400 mb-4 tracking-tight">
                          {dec(displayEngineHours)}h × {activeProfile?.idle_l_per_hour || '—'} Lít/h
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${activeTank.estimated_used_liters > 0 ? (activeTank.idle_component_liters / activeTank.estimated_used_liters * 100) : 0}%` }}
                          />
                        </div>
                        <div className="text-right mt-1.5 text-[10px] font-black text-slate-400">
                          {(activeTank.estimated_used_liters > 0 ? (activeTank.idle_component_liters / activeTank.estimated_used_liters * 100) : 0).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </>
            ) : activeTab === 'Báo cáo' ? (
              <div className="flex-1 -mx-6 -mb-6 bg-slate-50/30">
                <DashboardTab from={fromDateTime} to={toDateTime} vehicleId={activeTank.vehicle_id} todaySnapshot={todaySnapshot} />
              </div>
            ) : activeTab === 'Chi tiết' ? (
              <div className="space-y-6">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Thông số chi tiết</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex justify-between py-2 border-b border-slate-200">
                      <span className="text-sm font-bold text-slate-500">Dung tích bình</span>
                      <span className="text-sm font-black text-slate-800">{noConfig ? 'Chưa cấu hình' : `${N(activeTank.tank_capacity_liters)} Lít`}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-200">
                      <span className="text-sm font-bold text-slate-500">Mốc gốc cấu hình</span>
                      <span className="text-sm font-black text-slate-800">{activeTank.configured_opening_fuel_liters !== undefined ? `${dec(activeTank.configured_opening_fuel_liters)} Lít` : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-200">
                      <span className="text-sm font-bold text-slate-500">Tồn đầu kỳ</span>
                      <span className="text-sm font-black text-slate-800">{noBaseline ? 'N/A' : `${dec(openingBaselineLiters(activeTank))} Lít`}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-sm font-bold text-slate-500">Cập nhật lúc</span>
                      <span className="text-xs font-bold text-slate-400 mt-1">{activeTank.configured_opening_fuel_at ? dayjs(activeTank.configured_opening_fuel_at).format("HH:mm DD/MM/YYYY") : "—"}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex justify-between py-2 border-b border-slate-200">
                      <span className="text-sm font-bold text-slate-500">Đã dùng theo cân bằng tồn</span>
                      <span className="text-sm font-black text-slate-800">{noBaseline || activeTank.balance_used_liters === undefined ? 'N/A' : `${dec(activeTank.balance_used_liters)} Lít`}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-200">
                      <span className="text-sm font-bold text-slate-500">Đổ ròng theo phiếu</span>
                      <span className="text-sm font-black text-slate-800">{dec(activeTank.net_refuel_liters ?? activeTank.actual_used_liters)} Lít</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-200">
                      <span className="text-sm font-bold text-slate-500">Tiêu hao chạy đường</span>
                      <span className="text-sm font-black text-slate-800">{dec(activeTank.distance_component_liters)} Lít</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-200 bg-blue-50/50 -mx-4 px-4">
                      <span className="text-sm font-bold text-blue-700">Tồn cuối dự tính</span>
                      <span className="text-sm font-black text-blue-700">{noBaseline ? 'N/A' : `${dec(openingBaselineLiters(activeTank) + activeTank.refuel_in_liters - activeTank.estimated_used_liters)} Lít`}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-sm font-bold text-slate-500">Tiêu hao chờ/nổ máy</span>
                      <span className="text-sm font-black text-slate-800">{dec(activeTank.idle_component_liters)} Lít</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'Lịch sử' ? (
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Lịch sử sự kiện nhiên liệu (Lọc 5 sự kiện gần nhất)</div>
                <div className="space-y-0 border border-slate-100 rounded-xl overflow-hidden">
                  {loadingEvents ? (
                    <div className="p-10 text-center text-slate-400"><Spin /></div>
                  ) : events.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 font-bold text-sm">Chưa có sự kiện đổ xả nào</div>
                  ) : events.map((e) => (
                    <div key={e.fuel_event_id} className="flex justify-between items-center p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors bg-white">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${e.event_type.includes('refuel') ? 'bg-blue-50 text-blue-500' : e.event_type.includes('drain') ? 'bg-orange-50 text-orange-500' : 'bg-slate-50 text-slate-500'}`}>
                          <Droplets size={18} />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-700">{e.event_type.includes('refuel') ? (e.event_type === 'refuel_full' ? 'Đổ đầy bình' : 'Đổ nhiên liệu') : e.event_type.includes('drain') ? 'Xả nhiên liệu' : 'Hiệu chỉnh tồn'}</div>
                          <div className="text-xs text-slate-400 font-bold">{dayjs(e.event_time).format("HH:mm:ss DD/MM/YYYY")}</div>
                        </div>
                      </div>
                      <div className={`font-black text-base ${e.event_type.includes('refuel') || e.event_type === 'adjust_plus' ? 'text-blue-600' : e.event_type.includes('drain') || e.event_type === 'adjust_minus' ? 'text-orange-600' : 'text-slate-800'}`}>
                        {e.event_type.includes('refuel') || e.event_type === 'adjust_plus' ? '+' : e.event_type.includes('drain') || e.event_type === 'adjust_minus' ? '-' : ''}{dec(e.liters)} Lít
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeTab === 'Đổ nhiên liệu' ? (
              <div className="h-full -mx-6 -mb-6">
                <FuelEventsTab from={fromDateTime || ''} to={toDateTime || ''} vehicle_id={activeTank.vehicle_id} vehicles={vehicles || []} onMutated={triggerDataRefresh} />
              </div>
            ) : activeTab === 'Vị trí' ? (
              <div className="flex flex-col h-full">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Vị trí trực tuyến (VTracking)</div>
                <div className="flex-1 bg-slate-100 rounded-xl border border-slate-200 relative overflow-hidden flex items-center justify-center min-h-[300px]">
                  {vtVehicle ? (
                    <StationMap
                      stationLatitude={vtVehicle.latitude}
                      stationLongitude={vtVehicle.longitude}
                      radius={100}
                      vehicles={[vtVehicle]} // Only pass the selected vehicle
                      focusVehicle={vtVehicle}
                      focusDeviceId={vtVehicle.device_id}
                    />
                  ) : (
                    <div className="flex flex-col items-center p-6 bg-white rounded-2xl shadow-xl z-10">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <MapPin size={32} className="text-slate-300" />
                      </div>
                      <div className="font-black text-xl text-slate-800">Không tìm thấy tọa độ</div>
                      <div className="text-sm font-bold text-slate-500 mt-2 text-center max-w-xs">Xe này chưa gửi tín hiệu GPS hoặc không khớp biển số trên VTracking.</div>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'Cảnh báo' ? (
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Danh sách cảnh báo ({noBaseline ? 1 : 0})</div>
                {noBaseline ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 flex items-start gap-4">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <AlertTriangle size={24} className="text-rose-500" />
                    </div>
                    <div>
                      <div className="font-black text-lg text-rose-800">Thiếu mốc tồn đầu kỳ</div>
                      <div className="text-sm font-bold text-rose-600 mt-1">Hệ thống không tìm thấy mốc cấu hình phù hợp trong khoảng thời gian đang xem.</div>
                      <div className="text-xs text-rose-500 mt-2 p-3 bg-white/50 rounded-lg border border-rose-100 font-medium">Lý do: {activeTank.data_quality_reason === 'opening_after_range_start' ? 'Mốc gốc nằm sau khoảng thời gian tìm kiếm' : 'Không có mốc nào được tạo trước đó'}</div>
                    </div>
                  </div>
                ) : Math.abs(N(activeTank.variance_percent)) > 15 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <Activity size={24} className="text-amber-500" />
                    </div>
                    <div>
                      <div className="font-black text-lg text-amber-800">Tiêu hao bất thường</div>
                      <div className="text-sm font-bold text-amber-600 mt-1">Chênh lệch giữa thực tế và ước tính cao hơn 15%</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                      <CheckCircle2 size={32} className="text-emerald-500" />
                    </div>
                    <div className="font-black text-lg text-slate-800">Không có cảnh báo</div>
                    <div className="text-sm font-bold text-slate-500 mt-1">Xe đang hoạt động bình thường, dữ liệu đồng bộ tốt.</div>
                  </div>
                )}
              </div>
            ) : activeTab === 'Theo chuyến' ? (
              <div className="h-full -mx-6 -mb-6">
                <FuelMetricsTab from={fromDateTime || ''} to={toDateTime || ''} vehicle_id={activeTank.vehicle_id} />
              </div>
            ) : activeTab === 'Cấu hình' ? (
              <div className="h-full -mx-6 -mb-6">
                <FuelProfilesTab vehicle_id={activeTank.vehicle_id} vehicles={vehicles || []} />
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT COLUMN: Analysis */}
        <div className="w-[320px] bg-white rounded-xl border border-slate-200 flex flex-col h-full overflow-y-auto">
          {/* Pie Chart */}
          <div className="p-5 border-b border-slate-100">
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Phân tích nhiên liệu</div>
            <div className="flex items-center gap-6">
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg width="112" height="112" className="transform -rotate-90">
                  <circle cx="56" cy="56" r="46" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                  <circle cx="56" cy="56" r="46" fill="none" stroke="#6366f1" strokeWidth="12" strokeDasharray="289" strokeDashoffset={`${289 - (N(estPctDrive) / 100) * 289}`} strokeLinecap="round" />
                  <circle cx="56" cy="56" r="46" fill="none" stroke="#f59e0b" strokeWidth="12" strokeDasharray="289" strokeDashoffset={`${289 - (N(estPctIdle) / 100) * 289}`} strokeLinecap="round" style={{ transformOrigin: 'center', transform: `rotate(${(N(estPctDrive) / 100) * 360}deg)` }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-black text-lg text-slate-800">{dec(activeTank.estimated_used_liters)}</span>
                  <span className="text-[9px] font-bold text-slate-400">Lít tổng tiêu hao</span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500" /><span className="text-xs font-bold text-slate-700">Chạy đường</span></div>
                  <div className="text-[10px] text-slate-500 ml-3.5 mt-0.5">{dec(activeTank.distance_component_liters)} Lít ({estPctDrive}%)</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-xs font-bold text-slate-700">Chờ / nổ máy</span></div>
                  <div className="text-[10px] text-slate-500 ml-3.5 mt-0.5">{dec(activeTank.idle_component_liters)} Lít ({estPctIdle}%)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Line Chart */}
          <div className="flex-1 p-5 overflow-hidden flex flex-col">
            <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Biểu đồ mức dầu thực tế</div>
            <div className="flex-1 min-h-[200px]">
              {loadingTimeseries ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Spin />
                </div>
              ) : timeseries.length === 0 ? (
                <Empty description="Chưa có dữ liệu biểu đồ" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={(v) => dayjs(v).format("HH:mm")}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }}
                      minTickGap={20}
                    />
                    <YAxis
                      hide
                      domain={['auto', 'auto']}
                    />
                    <RTooltip
                      content={({ active, payload, label }: any) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 rounded-lg shadow-md border border-slate-100">
                              <div className="text-slate-500 font-bold text-xs mb-1">{dayjs(label).format("DD/MM HH:mm")}</div>
                              <div className="flex items-center gap-2">
                                <div className="text-indigo-600 font-black text-lg">{Number(data.fuel_liters).toFixed(1)} Lít</div>
                                <span className="text-[10px] font-bold text-slate-400">trong bình</span>
                                {data.is_event && (
                                  <span className="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                    {data.event_type || 'Event'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                      cursor={{ strokeDasharray: '3 3' }}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="fuel_liters"
                      stroke="#6366f1"
                      strokeWidth={3}
                      dot={(p) => {
                        if (p.payload.is_event) {
                          return <circle cx={p.cx} cy={p.cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} key={`dot-${p.index}`} />;
                        }
                        return <circle cx={p.cx} cy={p.cy} r={0} key={`dot-${p.index}`} />;
                      }}
                      activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Events */}
          <div className="p-5 flex-1 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Dòng sự kiện gần nhất</div>
              <button onClick={() => setActiveTab('Lịch sử')} className="text-[10px] font-bold text-blue-600 hover:underline">Xem tất cả</button>
            </div>
            <div className="relative pl-3 border-l-2 border-slate-100 space-y-4">
              {loadingEvents ? (
                <div className="text-center text-slate-400 py-4"><Spin size="small" /></div>
              ) : events.length === 0 ? (
                <div className="text-center text-slate-400 py-4 text-xs font-bold">Trống</div>
              ) : events.slice(0, 3).map((e) => (
                <div key={e.fuel_event_id} className="relative">
                  <div className={`absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${e.event_type.includes('refuel') ? 'bg-blue-500' : e.event_type.includes('drain') ? 'bg-orange-500' : 'bg-slate-400'}`} />
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400">{dayjs(e.event_time).format("HH:mm")}</span>
                        <span className="text-xs font-bold text-slate-700">{e.event_type.includes('refuel') ? 'Đổ dầu' : e.event_type.includes('drain') ? 'Xả dầu' : 'Hiệu chỉnh'}</span>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-500">{e.event_type.includes('refuel') || e.event_type === 'adjust_plus' ? '+' : e.event_type.includes('drain') || e.event_type === 'adjust_minus' ? '-' : ''}{dec(e.liters)} Lít</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>


        <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        
        @media print {
          body * { visibility: hidden; }
          #fuel-report-detail, #fuel-report-detail * { visibility: visible; }
          #fuel-report-detail { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100% !important; 
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            border: none !important;
          }
          .ant-btn, .ant-picker, .ant-tabs-nav, .ant-input-affix-wrapper { display: none !important; }
        }
      `}</style>
      </div>
    </div>
  );
}
