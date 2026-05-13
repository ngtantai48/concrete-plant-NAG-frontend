import React, { useState, useEffect, useMemo } from "react";
import { Typography, Card, Row, Col, Select, Spin, Empty } from "antd";
import { Route, Clock, Gauge, ArrowDown } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import dayjs from "dayjs";
import fuelApi from "@/services/fuel.service";
import type { FuelDashboardResponse, FuelVehicleSummary, VehicleTankStatus } from "@/types/report";

const { Title } = Typography;

const N = (v: any) => parseFloat(v) || 0;
const fmt = (v: any, d = 0) => N(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const dec = (v: any) => fmt(v, 1);

export default function DashboardTab({ from, to, vehicleId, todaySnapshot }: { from: string; to: string; vehicleId?: number; todaySnapshot?: VehicleTankStatus | null }) {
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<FuelDashboardResponse | null>(null);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [vList, setVList] = useState<FuelVehicleSummary[]>([]);
  const rangeStart = useMemo(() => dayjs(from).startOf("day"), [from]);
  const rangeEnd = useMemo(() => dayjs(to).endOf("day"), [to]);
  const normalizedFrom = useMemo(() => rangeStart.toISOString(), [rangeStart]);
  const normalizedTo = useMemo(() => rangeEnd.toISOString(), [rangeEnd]);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    Promise.all([
      fuelApi.getDashboard({ from: normalizedFrom, to: normalizedTo, vehicle_id: vehicleId, group_by: groupBy }),
      fuelApi.getVehiclesSummary({ from: normalizedFrom, to: normalizedTo, sort_by: "variance_liters", direction: "desc" }),
    ]).then(([dR, vR]) => {
      if (!ok) return;
      setDash(dR.data);
      const vd = vR?.data; setVList(vd?.items || (Array.isArray(vd) ? vd : []));
      setLoading(false);
    }).catch(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, [normalizedFrom, normalizedTo, vehicleId, groupBy]);

  const s = dash?.summary;

  // ═══ Realistic Formula: Total = Trip Fuel + Yard Idle Fuel ═══
  const processedSeries = useMemo(() => {
    const raw = dash?.series || [];
    const targetDistance = N(s?.total_distance_km);
    const targetDrive = N(s?.distance_component_liters);
    const targetIdle = N(s?.idle_component_liters);

    // Generate all dates in the range to ensure no days are missing (e.g. idle-only days)
    const startDate = rangeStart;
    const endDate = rangeEnd;
    const daysCount = endDate.diff(startDate, 'day') + 1;
    const dateMap = new Map();
    for (let i = 0; i < daysCount; i++) {
      const d = startDate.add(i, 'day').format("YYYY-MM-DD");
      dateMap.set(d, { period: d, total_distance_km: 0, total_estimated_fuel_liters: 0 });
    }
    raw.forEach(item => {
      const d = dayjs(item.period).format("YYYY-MM-DD");
      if (dateMap.has(d)) dateMap.set(d, { ...item, period: d });
    });

    const fullSeries = Array.from(dateMap.values());
    const rawDistanceTotal = fullSeries.reduce((acc, cur) => acc + N(cur.total_distance_km), 0);
    const seriesTripFuelTotal = fullSeries.reduce((acc, cur) => acc + N(cur.total_estimated_fuel_liters), 0) || 1;

    const mapped = fullSeries.map(item => {
      const rawTripFuel = N(item.total_estimated_fuel_liters);
      const rawDistance = N(item.total_distance_km);

      // If there are trips, distribute idle proportionally. 
      // If NO trips at all in the range, distribute idle evenly across the days.
      const activityRatio = (seriesTripFuelTotal > 1) ? (rawTripFuel / seriesTripFuelTotal) : (1 / daysCount);

      const distanceShare = rawDistanceTotal > 0 ? (rawDistance / rawDistanceTotal) * targetDistance : 0;
      const driveShare = (seriesTripFuelTotal > 1) ? (rawTripFuel / seriesTripFuelTotal) * targetDrive : 0;
      const idleShare = activityRatio * targetIdle;

      return {
        ...item,
        total_distance_km_adj: distanceShare,
        trip_liters: driveShare,
        idle_liters: idleShare,
        total_liters: driveShare + idleShare
      };
    });

    // Force today's row to match realtime snapshot shown in "Tổng quan".
    if (groupBy === "day" && vehicleId && todaySnapshot) {
      const todayKey = dayjs().format("YYYY-MM-DD");
      return mapped.map((item: any) => {
        if (dayjs(item.period).format("YYYY-MM-DD") !== todayKey) return item;
        return {
          ...item,
          total_distance_km: N((todaySnapshot as any).odometer_delta_km ?? todaySnapshot.total_distance_km),
          total_distance_km_adj: N((todaySnapshot as any).odometer_delta_km ?? todaySnapshot.total_distance_km),
          trip_liters: N(todaySnapshot.distance_component_liters),
          idle_liters: N(todaySnapshot.idle_component_liters),
          total_liters: N(todaySnapshot.estimated_used_liters),
        };
      });
    }

    return mapped;
  }, [dash, s, rangeStart, rangeEnd, groupBy, vehicleId, todaySnapshot]);

  if (loading) return <div className="flex justify-center py-24"><Spin size="large" /></div>;
  if (!dash) return <Empty description="Chưa có dữ liệu" />;

  const metrics = [
    { label: "Quãng đường", value: `${fmt(s?.total_distance_km, 2)} km`, sub: "Tổng km chạy", icon: <Route size={14} />, color: "#3b82f6", bg: "#eff6ff" },
    { label: "Tiêu hao chạy", value: `${dec(s?.distance_component_liters)} Lít`, sub: "km × định mức", icon: <Route size={14} />, color: "#6366f1", bg: "#eef2ff" },
    { label: "Tiêu hao chờ", value: `${dec(s?.idle_component_liters)} Lít`, sub: "Giờ chờ × định mức", icon: <Clock size={14} />, color: "#f59e0b", bg: "#fffbeb" },
    { label: "Tổng ước tính", value: `${dec(s?.total_estimated_fuel_liters)} Lít`, sub: "chạy + chờ", icon: <Gauge size={14} />, color: "#8b5cf6", bg: "#faf5ff" },
    { label: "Đổ vào", value: `${dec(s?.total_refuel_liters)} Lít`, sub: "Tổng đổ vào", icon: <ArrowDown size={14} />, color: "#10b981", bg: "#ecfdf5" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-50/30 h-[650px] overflow-hidden">
      {/* ═══ KPI CARDS ═══ */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex-shrink-0">
        <Title level={5} className="m-0 font-black text-slate-800 mb-3 uppercase tracking-widest text-[10px]">
          Tóm tắt tiêu hao {vehicleId ? 'phương tiện' : 'đội xe'}
        </Title>
        <div className="grid grid-cols-5 gap-3">
          {metrics.map(m => (
            <div key={m.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group flex flex-col items-center text-center">
              <div className="flex flex-col items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-inner mb-1" style={{ background: m.color + '20', color: m.color }}>
                  {m.icon}
                </div>
                <span className="text-[10px] font-black text-slate-600 uppercase leading-none tracking-tighter">{m.label}</span>
              </div>
              <div className="text-xl font-black text-slate-900 tracking-tight">{m.value}</div>
              <div className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">{m.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ═══ TREND CHART ═══ */}
        <div className="flex-[2] bg-white rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 flex flex-col min-w-0 relative">
          <div className="absolute top-4 right-4 z-10">
            <div className="flex items-center gap-1 bg-slate-100/50 backdrop-blur-sm p-1 rounded-xl border border-slate-200/50">
              {['day', 'week', 'month'].map(v => (
                <button
                  key={v}
                  onClick={() => setGroupBy(v as any)}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${groupBy === v ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {v === 'day' ? 'Ngày' : v === 'week' ? 'Tuần' : 'Tháng'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 relative mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={processedSeries} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} dy={10} tickFormatter={v => dayjs(v).format("DD/MM")} interval="preserveStartEnd" minTickGap={30} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }} />
                <RTooltip
                  cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-white/50 min-w-[160px] z-50">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">{dayjs(label).format("DD MMMM, YYYY")}</div>
                          <div className="space-y-2">
                            {payload.map((p: any) => (
                              <div key={p.name} className="flex justify-between items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                                  <span className="text-[10px] font-bold text-slate-500">{p.name}</span>
                                </div>
                                <span className="text-xs font-black text-slate-900">{dec(p.value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="total_distance_km" name="Quãng đường" fill="#f1f5f9" radius={[4, 4, 0, 0]} barSize={32} />
                <Area type="monotone" dataKey="total_liters" name="Tiêu hao" stroke="#3b82f6" strokeWidth={4} fill="url(#chartGradient)" dot={{ r: 4, fill: "#fff", stroke: "#3b82f6", strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: Detail or Ranking ═══ */}
        <div className="flex-1 min-w-[340px] bg-white rounded-2xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col overflow-hidden">
          {vehicleId ? (
            <>
              <div className="flex-1 overflow-y-auto scrollbar-hide px-6">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100 bg-slate-50/50 -mx-6 px-6">
                      <th className="text-left text-[10px] font-black text-slate-600 py-5 uppercase tracking-widest pl-2">Thời gian</th>
                      <th className="text-right text-[10px] font-black text-slate-600 py-5 uppercase tracking-widest px-2">
                        <div className="flex items-center justify-end gap-1"><Route size={10} /> KM</div>
                      </th>
                      <th className="text-right text-[10px] font-black text-slate-600 py-5 uppercase tracking-widest px-2">
                        <div className="flex items-center justify-end gap-1"><Gauge size={10} /> Chạy</div>
                      </th>
                      <th className="text-right text-[10px] font-black text-slate-600 py-5 uppercase tracking-widest px-2">
                        <div className="flex items-center justify-end gap-1"><Clock size={10} /> Chờ</div>
                      </th>
                      <th className="text-right text-[10px] font-black text-slate-600 py-5 uppercase tracking-widest pl-2">Tổng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {processedSeries.map((item, i) => (
                      <tr key={i} className="group hover:bg-slate-50/50 transition-colors cursor-default">
                        <td className="py-4 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                          {dayjs(item.period).format("DD/MM/YYYY")}
                        </td>
                        <td className="py-4 text-right text-xs font-black text-slate-800 px-2">
                          {dec(item.total_distance_km_adj ?? item.total_distance_km)}
                        </td>
                        <td className="py-4 text-right text-[10px] font-bold text-blue-500 px-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          {dec(item.trip_liters)}
                        </td>
                        <td className="py-4 text-right text-[10px] font-bold text-orange-400 px-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          {dec(item.idle_liters)}
                        </td>
                        <td className="py-4 text-right pl-2">
                          <div className="inline-flex flex-col items-end">
                            <span className="text-xs font-black text-indigo-600 leading-none mb-0.5">{dec(item.total_liters)}</span>
                            <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Lít</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6">
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">Phân tích chênh lệch</div>
                <Title level={4} className="m-0 font-black text-slate-800">Top xe hao hụt</Title>
              </div>
              <div className="mt-4 space-y-2 flex-1 overflow-y-auto scrollbar-hide">
                {vList.slice(0, 10).map((v, i) => (
                  <div key={v.vehicle_id} className="flex items-center gap-4 py-3 hover:bg-slate-50 rounded-2xl px-3 transition-all border border-transparent hover:border-slate-100">
                    <span className={`w-8 h-8 rounded-xl text-xs font-black flex items-center justify-center flex-shrink-0 shadow-sm ${i === 0 ? 'bg-red-500 text-white' : i === 1 ? 'bg-orange-500 text-white' : i === 2 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm text-slate-800 truncate">{v.vehicle_name}</div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{v.vehicle_license_plate}</span>
                    </div>
                    <span className={`font-black text-sm whitespace-nowrap px-3 py-1 rounded-lg ${N(v.variance_liters) > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {N(v.variance_liters) > 0 ? '+' : ''}{dec(v.variance_liters)}L
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
