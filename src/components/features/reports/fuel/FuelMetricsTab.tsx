"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Input, Select, Tag, Spin, Empty, Pagination, Button } from "antd";
import { Search, Route, Clock, Droplets, Flame, RefreshCw, Download } from "lucide-react";
import dayjs from "dayjs";
import fuelApi from "@/services/fuel.service";
import type { OrderFuelMetric } from "@/types/report";

const safe = (v: any) => Number(v || 0);
const dec = (v: any) => safe(v).toFixed(1);

const formatMins = (mins: number) => {
  if (!mins) return "0 phút";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} phút`;
  return `${h}h${m.toString().padStart(2, '0')} phút`;
};

const getDriveMins = (d: OrderFuelMetric) => {
  if (d.order_start_datetime && d.order_end_datetime) {
    const total = dayjs(d.order_end_datetime).diff(dayjs(d.order_start_datetime), 'minute');
    return Math.max(0, total - safe(d.idle_minutes));
  }
  return 0;
};

export default function FuelMetricsTab({ from, to, vehicle_id }: { from: string; to: string; vehicle_id?: number }) {
  const [data, setData] = useState<OrderFuelMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [stationFilter, setStationFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rangeStart = useMemo(() => dayjs(from).startOf("day"), [from]);
  const rangeEnd = useMemo(() => dayjs(to).endOf("day"), [to]);
  const normalizedFrom = useMemo(() => rangeStart.toISOString(), [rangeStart]);
  const normalizedTo = useMemo(() => rangeEnd.toISOString(), [rangeEnd]);

  const fetchData = () => {
    setLoading(true);
    fuelApi.getOrderMetrics({ from: normalizedFrom, to: normalizedTo, vehicle_id, limit: 200 })
      .then(res => { const p = res.data; setData(Array.isArray(p) ? p : p?.data || []); })
      .catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { fetchData(); }, [normalizedFrom, normalizedTo, vehicle_id]);

  // Unique stations for filter
  const stations = useMemo(() => {
    const set = new Set(data.map(d => d.station_name).filter(Boolean));
    return Array.from(set).map(s => ({ label: s, value: s }));
  }, [data]);

  const filtered = useMemo(() => {
    const inSelectedRange = (item: OrderFuelMetric) => {
      const ts = item.order_start_datetime || item.order_end_datetime || item.computed_at;
      if (!ts) return true;
      const point = dayjs(ts);
      if (!point.isValid()) return true;
      return !point.isBefore(rangeStart) && !point.isAfter(rangeEnd);
    };

    let list = data.filter(inSelectedRange);
    if (stationFilter) list = list.filter(d => d.station_name === stationFilter);
    if (searchText) {
      const s = searchText.toLowerCase();
      list = list.filter(d => d.vehicle_name?.toLowerCase().includes(s) || d.station_name?.toLowerCase().includes(s) || String(d.order_id).includes(s));
    }
    return list;
  }, [data, stationFilter, searchText, rangeStart, rangeEnd]);

  useEffect(() => { setPage(1); }, [searchText, stationFilter, pageSize]);

  // Summary
  const totalDist = filtered.reduce((s, d) => s + Number(safe(d.distance_km).toFixed(1)), 0);
  const totalDrive = filtered.reduce((s, d) => s + getDriveMins(d), 0);
  const totalIdle = filtered.reduce((s, d) => s + safe(d.idle_minutes), 0);
  const totalDriveFuel = filtered.reduce((s, d) => s + safe(d.drive_fuel_liters), 0);
  const totalIdleFuel = filtered.reduce((s, d) => s + safe(d.idle_fuel_liters), 0);
  const totalFuel = filtered.reduce((s, d) => s + safe(d.total_fuel_liters), 0);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <div className="flex justify-center py-24"><Spin size="large" /></div>;

  const summaryCards = [
    { icon: <Route size={14} />, color: "#2563eb", bg: "#eff6ff", label: "Quãng đường", value: dec(totalDist), unit: "km" },
    { icon: <Clock size={14} />, color: "#d97706", bg: "#fffbeb", label: "Thời gian chạy", value: formatMins(totalDrive), unit: "" },
    { icon: <Droplets size={14} />, color: "#059669", bg: "#ecfdf5", label: "Thời gian dừng", value: formatMins(totalIdle), unit: "" },
    { icon: <Clock size={14} />, color: "#7c3aed", bg: "#faf5ff", label: "Nhiên liệu chạy", value: dec(totalDriveFuel), unit: "Lít" },
    { icon: <Flame size={14} />, color: "#dc2626", bg: "#fef2f2", label: "Nhiên liệu dừng", value: dec(totalIdleFuel), unit: "Lít" },
    { icon: <Flame size={14} />, color: "#e11d48", bg: "#fff1f2", label: "Tổng tiêu hao", value: dec(totalFuel), unit: "Lít" },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <h3 className="font-black text-2xl text-slate-800 m-0 leading-tight pl-4">Tiêu hao theo chuyến</h3>
              <div className="flex flex-wrap gap-2 mt-2 pl-4">
                <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600">
                  Khoảng: {rangeStart.format("DD/MM/YYYY")} - {rangeEnd.format("DD/MM/YYYY")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw size={12} />
                Làm mới
              </button>
              <Button icon={<Download size={14} />} className="rounded-lg font-bold text-xs h-9 border-slate-300">Xuất báo cáo</Button>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-2.5 min-w-0 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: card.bg, color: card.color }}>
                    {React.cloneElement(card.icon as React.ReactElement<{ size?: number }>, { size: 12 })}
                  </div>
                  <span className="text-[9px] font-black text-slate-400 uppercase leading-tight">{card.label}</span>
                </div>
                <div className="flex items-baseline justify-center gap-1 min-w-0">
                  <div className="font-black text-lg leading-none tracking-tight text-slate-800">{card.value}</div>
                  {card.unit && <span className="text-[10px] font-bold text-slate-400">{card.unit}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 flex flex-wrap items-center gap-2">
            <Input
              prefix={<Search size={14} className="text-slate-400" />}
              placeholder="Tìm chuyến, xe, trạm..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full md:w-[280px] rounded-lg"
              size="small"
              allowClear
            />
            <Select
              placeholder="Tất cả trạm"
              allowClear
              value={stationFilter}
              onChange={setStationFilter}
              className="w-full md:w-[180px]"
              size="small"
              options={stations}
            />
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
              <div className="col-span-1">Chuyến</div>
              <div className="col-span-2">Xe</div>
              <div className="col-span-2">Trạm</div>
              <div className="col-span-1 text-right">Km</div>
              <div className="col-span-1 text-right">T.gian chạy</div>
              <div className="col-span-1 text-right">T.gian dừng</div>
              <div className="col-span-1 text-right">NL chạy</div>
              <div className="col-span-1 text-right">NL dừng</div>
              <div className="col-span-2 text-right pr-3">Tổng</div>
            </div>

            {paged.length === 0 && <Empty description="Không có dữ liệu" className="py-12 bg-white" />}
            {paged.map((d) => (
              <div key={d.order_fuel_metric_id} className="grid grid-cols-12 px-4 py-3 border-b border-slate-100 hover:bg-sky-50/30 transition-colors items-center bg-white">
                <div className="col-span-1">
                  <div className="text-[11px] font-black text-slate-700 leading-tight">
                    {d.order_start_datetime ? dayjs(d.order_start_datetime).format("DD/MM") : ""}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {d.order_start_datetime ? dayjs(d.order_start_datetime).format("HH:mm") : ""}
                  </div>
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <span className="font-black text-sm text-slate-800">{d.vehicle_name}</span>
                  <span className="inline-flex w-fit bg-slate-900 text-white font-bold text-[10px] px-1.5 py-0.5 rounded">{d.vehicle_license_plate}</span>
                </div>
                <div className="col-span-2 font-bold text-sm text-slate-700">{d.station_name}</div>
                <div className="col-span-1 text-right font-black text-sm text-slate-800">{safe(d.distance_km).toFixed(1)} km</div>
                <div className="col-span-1 text-right">
                  <span className="text-blue-600 font-black text-[11px]">{formatMins(getDriveMins(d))}</span>
                </div>
                <div className="col-span-1 text-right">
                  <Tag color="orange" className="border-0 rounded-full font-black text-[11px] m-0">{formatMins(safe(d.idle_minutes))}</Tag>
                </div>
                <div className="col-span-1 text-right font-bold text-sm text-slate-700">{dec(d.drive_fuel_liters)} Lít</div>
                <div className="col-span-1 text-right font-bold text-sm text-slate-700">{dec(d.idle_fuel_liters)} Lít</div>
                <div className="col-span-2 text-right pr-3">
                  <span className="font-black text-emerald-600 text-xl leading-none">{dec(d.total_fuel_liters)}</span>
                  <span className="ml-1 text-xs font-bold text-emerald-500">Lít</span>
                </div>
              </div>
            ))}
          </div>

          <div className="px-1 pt-2 flex flex-wrap justify-between items-center gap-2">
            <span className="text-xs font-bold text-slate-400">
              Hiển thị {Math.min((page - 1) * pageSize + 1, filtered.length)}-{Math.min(page * pageSize, filtered.length)} trong {filtered.length} chuyến
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={pageSize}
                size="small"
                className="w-[110px]"
                onChange={(nextSize) => {
                  setPageSize(nextSize);
                  setPage(1);
                }}
                options={[{ label: "10 / trang", value: 10 }, { label: "20 / trang", value: 20 }, { label: "50 / trang", value: 50 }]}
              />
              <Pagination current={page} pageSize={pageSize} total={filtered.length} onChange={setPage} size="small" showSizeChanger={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
