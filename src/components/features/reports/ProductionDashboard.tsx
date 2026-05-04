"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, Row, Col, Typography, Space, Table, Tag, Button, Select, DatePicker, Spin, Empty, Tabs, Progress, Drawer } from "antd";
import { CheckCircle, Activity, BarChart3, Download, Truck, MapPin, Route, Timer, ArrowUpRight, TrendingUp, FileSpreadsheet, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import dayjs from "dayjs";
import reportApi from "@/services/report.service";
import type { ProductionReportResponse, ProductionQuery, ProductionSeriesItem } from "@/types/report";
import { exportMultiSheet } from "@/utils/exportReport";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import VehicleRanking from "@/components/features/reports/VehicleRanking";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

/* ── Dark-tech tooltip ── */
const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(255,255,255,.98)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "14px 18px", boxShadow: "0 8px 32px rgba(0,0,0,.12)", border: "1px solid #e2e8f0", minWidth: 200, zIndex: 9999, position: "relative" }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#0f172a", fontSize: 14 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-6 text-[14px] py-0.5">
          <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
          <span className="font-black text-gray-900">{typeof p.value === "number" ? p.value.toLocaleString("vi-VN") : p.value}</span>
        </div>
      ))}
    </div>
  );
};

/* Compact metric strip — single card, 4 metrics side by side */
const MetricStrip = ({ metrics }: { metrics: { label: string; value: string | number; sub?: string; accent: string; icon: React.ReactNode; border: string }[] }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
    <Card className="border-0 shadow-sm rounded-2xl" bodyStyle={{ padding: 0 }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <div style={{ background: m.border, width: 38, height: 38, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", color: m.accent, flexShrink: 0 }}>{m.icon}</div>
            <div className="min-w-0">
              <Text type="secondary" className="text-[10px] font-bold uppercase tracking-wider block leading-tight mb-0.5">{m.label}</Text>
              <div className="font-extrabold text-gray-900 text-xl leading-tight truncate">{m.value}</div>
              {m.sub && <Text type="secondary" className="text-[11px] block mt-0.5 leading-tight">{m.sub}</Text>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  </motion.div>
);

export default function ProductionDashboard() {
  const [data, setData] = useState<ProductionReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<ProductionQuery>({ from: dayjs().startOf("month").format("YYYY-MM-DD"), to: dayjs().format("YYYY-MM-DD"), group_by: "day" });

  const fetch = useCallback(async () => { setLoading(true); try { const r = await reportApi.getProduction(query); setData(r.data as unknown as ProductionReportResponse); } catch { } finally { setLoading(false); } }, [query]);
  useEffect(() => { fetch(); }, [fetch]);

  // period drill-down drawer
  const [periodDrawer, setPeriodDrawer] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [periodOrders, setPeriodOrders] = useState<Order[]>([]);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [showAllSeries, setShowAllSeries] = useState(false);
  const [drawerPage, setDrawerPage] = useState(1);
  const DRAWER_PAGE_SIZE = 20;

  const handlePeriodClick = useCallback(async (row: ProductionSeriesItem) => {
    setPeriodDrawer(true);
    setSelectedPeriod(row.period);
    setLoadingPeriod(true);
    setPeriodOrders([]);
    try {
      const dateFrom = dayjs(row.period).format("YYYY-MM-DD");

      if (query.group_by === "day") {
        // Đúng param API: order_start_datetime=YYYY-MM-DD
        const res = await orderApi.getAll({ order_start_datetime: dateFrom });
        const raw = res.data as any;
        setPeriodOrders(Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []));
      } else {
        // Tuần / tháng: fetch từng ngày trong range rồi merge, hoặc fetch tất cả rồi lọc client
        const days = query.group_by === "week" ? 7 : 30;
        const dateTo = dayjs(row.period).add(days - 1, "day");
        const res = await orderApi.getAll({ order_start_datetime: dateFrom });
        const raw = res.data as any;
        const all: Order[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []);
        // Client-side filter trong khoảng kỳ
        const filtered = all.filter((o) => {
          const d = dayjs(o.order_start_datetime ?? o.order_init_datetime);
          return d.isValid() && !d.isBefore(dayjs(dateFrom), "day") && !d.isAfter(dateTo, "day");
        });
        setPeriodOrders(filtered);
      }
    } catch (e) {
      console.error("Period fetch error", e);
    } finally {
      setLoadingPeriod(false);
    }
  }, [query.group_by]);


  const s = data?.summary;
  const fmt = (d: string) => dayjs(d).format(query.group_by === "month" ? "MM/YYYY" : "DD/MM");

  const trend = useMemo(() => (data?.series ?? []).map((i: ProductionSeriesItem) => ({ period: fmt(i.period), "Hoàn thành": i.completed, "Đang xử lý": i.running + i.collecting + i.transporting, "Chờ": i.pending, "Đã hủy": i.canceled })), [data, query.group_by]);
  const kmData = useMemo(() => (data?.series ?? []).map((i: ProductionSeriesItem) => ({ period: fmt(i.period), Km: Math.round(i.distance_km) })), [data, query.group_by]);
  const pie = useMemo(() => s ? [{ n: "Hoàn thành", v: s.completed, c: "#10b981" }, { n: "Đang chạy", v: s.running, c: "#3b82f6" }, { n: "Nhận hàng", v: s.collecting, c: "#8b5cf6" }, { n: "Vận chuyển", v: s.transporting, c: "#f59e0b" }, { n: "Chờ", v: s.pending, c: "#94a3b8" }, { n: "Đã hủy", v: s.canceled, c: "#ef4444" }].filter(x => x.v > 0) : [], [s]);
  const avg = useMemo(() => data?.series?.length ? Math.round(data.series.reduce((a, b) => a + b.total_orders, 0) / data.series.length * 10) / 10 : 0, [data]);
  const completionRate = s && s.total_orders > 0 ? Math.round(s.completed / s.total_orders * 100) : 0;

  const handleExport = () => {
    if (!data) return;
    const summarySheet = [{ "Tổng chuyến": s?.total_orders, "Hoàn thành": s?.completed, "Đang chạy": s?.running, "Nhận hàng": s?.collecting, "Vận chuyển": s?.transporting, "Chờ": s?.pending, "Đã hủy": s?.canceled, "Tổng km": s?.total_distance_km, "Tỷ lệ (%)": completionRate, "Trung bình/ngày": avg, "Từ ngày": data.from, "Đến ngày": data.to }];
    const seriesSheet = data.series.map(i => ({ "Kỳ": i.period, "Tổng chuyến": i.total_orders, "Hoàn thành": i.completed, "Đang chạy": i.running, "Nhận hàng": i.collecting, "Vận chuyển": i.transporting, "Chờ": i.pending, "Đã hủy": i.canceled, "Km": Math.round(i.distance_km) }));
    const vehicleSheet = data.top_vehicles.map((v, i) => ({ "#": i + 1, "Tên xe": v.vehicle_name, "Biển số": v.vehicle_license_plate, "Số chuyến": v.total_orders, "Km": v.total_distance_km }));
    const stationSheet = data.top_stations.map((st, i) => ({ "#": i + 1, "Trạm": st.station_name, "Số chuyến": st.total_orders, "Tỷ lệ (%)": s ? Math.round(st.total_orders / s.total_orders * 100) : 0 }));
    exportMultiSheet([{ name: "Tổng quan", data: summarySheet }, { name: "Chi tiết theo kỳ", data: seriesSheet }, { name: "Xếp hạng xe", data: vehicleSheet }, { name: "Hiệu suất trạm", data: stationSheet }], `bao-cao-san-luong_${data.from}_${data.to}`);
  };

  const seriesColumns = [
    { title: "Kỳ", dataIndex: "period", key: "p", width: 100, render: (v: string) => <Text strong className="text-sm">{fmt(v)}</Text> },
    { title: "Tổng", dataIndex: "total_orders", key: "t", width: 80, align: "center" as const, render: (v: number) => <Tag className="rounded-full border-0 px-2 font-bold" color="blue">{v}</Tag> },
    { title: "Hoàn thành", dataIndex: "completed", key: "c", width: 100, align: "center" as const, render: (v: number) => <span className="text-emerald-600 font-semibold">{v}</span> },
    { title: "Đang XL", key: "r", width: 80, align: "center" as const, render: (_: any, r: ProductionSeriesItem) => <span className="text-amber-600 font-semibold">{r.running + r.collecting + r.transporting}</span> },
    { title: "Chờ", dataIndex: "pending", key: "pe", width: 60, align: "center" as const },
    { title: "Hủy", dataIndex: "canceled", key: "ca", width: 60, align: "center" as const, render: (v: number) => v > 0 ? <span className="text-red-500 font-semibold">{v}</span> : <span className="text-gray-300">0</span> },
    { title: "Km", dataIndex: "distance_km", key: "km", width: 110, align: "right" as const, render: (v: number) => <Text className="text-sm font-mono">{Math.round(v).toLocaleString("vi-VN")}</Text>, sorter: (a: ProductionSeriesItem, b: ProductionSeriesItem) => a.distance_km - b.distance_km },
    { title: "Tỷ lệ hoàn thành", key: "rate", width: 140, render: (_: any, r: ProductionSeriesItem) => { const p = r.total_orders > 0 ? Math.round(r.completed / r.total_orders * 100) : 0; return <Progress percent={p} strokeColor={p >= 90 ? "#10b981" : p >= 70 ? "#f59e0b" : "#ef4444"} size="small" format={(v) => `${v}%`} />; } },
  ];

  return (
    <div className="space-y-3">
      {/* ═══ HEADER BAR ═══ */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="border-0 shadow-sm rounded-2xl" bodyStyle={{ padding: "14px 20px" }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div style={{ background: "#eff6ff", width: 38, height: 38, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <BarChart3 size={18} className="text-blue-500" />
              </div>
              <div>
                <Title level={5} className="m-0 text-base">Báo cáo Sản lượng</Title>
                {data && <Text type="secondary" className="text-xs">{dayjs(data.from).format("DD/MM/YYYY")} — {dayjs(data.to).format("DD/MM/YYYY")}</Text>}
              </div>
            </div>
            <Space size="middle" wrap>
              <RangePicker value={[dayjs(query.from), dayjs(query.to)]} onChange={(d) => { if (d?.[0] && d?.[1]) setQuery(p => ({ ...p, from: d[0]!.format("YYYY-MM-DD"), to: d[1]!.format("YYYY-MM-DD") })); }} className="rounded-xl" />
              <Select value={query.group_by} onChange={(v) => setQuery(p => ({ ...p, group_by: v }))} options={[{ label: "Theo ngày", value: "day" }, { label: "Theo tuần", value: "week" }, { label: "Theo tháng", value: "month" }]} className="min-w-[130px]" />
              <Button icon={<FileSpreadsheet size={16} />} type="primary" onClick={handleExport} disabled={!data} style={{ background: "#10b981", border: 0, borderRadius: 10, fontWeight: 700, height: 36 }}>Xuất Excel</Button>
            </Space>
          </div>
        </Card>
      </motion.div>

      {loading ? <div className="flex items-center justify-center py-32"><Spin size="large" /></div> : !data ? <Empty description="Không có dữ liệu" className="py-20" /> : (<>

        {/* ═══ ROW 1: Sparkline + 4 Stat Cards ═══ */}
        <Row gutter={[16, 16]}>
          {/* Sparkline card */}
          <Col xs={24} lg={8}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="h-full">
              <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: "14px 18px", overflow: "visible" }}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[14px] font-extrabold text-slate-800">Sản lượng trung bình</span>
                  <Tag color="blue" className="rounded-full border-0 text-[11px] font-bold">{query.group_by === "day" ? "/ngày" : query.group_by === "week" ? "/tuần" : "/tháng"}</Tag>
                </div>
                <div className="text-[12px] font-bold text-slate-500 mb-1">{dayjs(data.from).format("DD/MM")} – {dayjs(data.to).format("DD/MM/YYYY")}</div>
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-[48px] font-black leading-none" style={{ color: "#0f172a" }}>{avg}</span>
                  <span className="text-sm font-black text-emerald-600 mb-1.5 uppercase tracking-wide">chuyến</span>
                </div>
                <div className="w-full h-[90px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart 
                      data={trend.slice(-10)} 
                      margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
                      onClick={(e: any) => { if (e && e.activePayload) handlePeriodClick(e.activePayload[0].payload); }}
                      style={{ cursor: "pointer" }}
                    >
                      <defs><linearGradient id="spk" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="95%" stopColor="#10b981" stopOpacity={0.02} /></linearGradient></defs>
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 9, fontWeight: 600 }} dy={2} interval={0} />
                      <RTooltip content={<Tip />} />
                      <Area type="monotone" dataKey="Hoàn thành" stroke="#10b981" strokeWidth={2.5} fill="url(#spk)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </motion.div>
          </Col>
          {/* 4 Stat cards */}
          <Col xs={24} lg={16}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="h-full">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 h-full">
                {[
                  { icon: <BarChart3 size={22} />, value: (s?.total_orders ?? 0).toLocaleString("vi-VN"), label: "Tổng chuyến", color: "#2563eb", bg: "#dbeafe" },
                  { icon: <CheckCircle size={22} />, value: (s?.completed ?? 0).toLocaleString("vi-VN"), label: "Hoàn thành", color: "#059669", bg: "#d1fae5" },
                  { icon: <Route size={22} />, value: `${Math.round(s?.total_distance_km ?? 0).toLocaleString("vi-VN")}`, label: "Tổng KM", color: "#d97706", bg: "#fef3c7" },
                  { icon: <Timer size={22} />, value: `${completionRate}%`, label: "Tỷ lệ hoàn thành", color: "#7c3aed", bg: "#ede9fe" },
                ].map((card, i) => (
                  <Card key={i} className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <div className="mb-2" style={{ width: 46, height: 46, borderRadius: 13, background: card.bg, display: "flex", alignItems: "center", justifyContent: "center", color: card.color }}>{card.icon}</div>
                    <div className="font-black text-[32px] leading-none" style={{ color: "#0f172a" }}>{card.value}</div>
                    <span className="text-[14px] font-bold text-slate-600 mt-1.5">{card.label}</span>
                  </Card>
                ))}
              </div>
            </motion.div>
          </Col>
        </Row>

        {/* ═══ ROW 2: Mini charts + Main chart + Stations ═══ */}
        <Row gutter={[16, 16]}>
          {/* Left — 2 stacked mini cards */}
          <Col xs={24} lg={5}>
            <div className="flex flex-col gap-4 h-full">
              {/* Total this period */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex-1">
                <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: "16px 18px", overflow: "visible" }}>
                  <span className="text-[13px] font-extrabold text-slate-700 block">{data.series.length} kỳ thống kê</span>
                  <span className="text-[12px] font-bold text-slate-500 block mb-0.5">{dayjs(data.from).format("DD/MM")} – {dayjs(data.to).format("DD/MM")}</span>
                  <div className="font-black text-[32px] mb-1" style={{ color: "#0f172a" }}>{(s?.total_orders ?? 0).toLocaleString("vi-VN")}</div>
                  <div className="w-full h-[60px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={trend.slice(-8)} 
                        margin={{ top: 0, right: 2, left: 2, bottom: 0 }}
                        onClick={(e: any) => { if (e && e.activePayload) handlePeriodClick(e.activePayload[0].payload); }}
                        style={{ cursor: "pointer" }}
                      >
                        <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 600 }} dy={1} interval={0} />
                        <RTooltip content={<Tip />} />
                        <Bar dataKey="Hoàn thành" fill="#ef4444" radius={[2, 2, 0, 0]} barSize={7} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </motion.div>
              {/* Donut gauge */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex-1">
                <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: "16px 18px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span className="text-[13px] font-extrabold text-slate-700 block mb-1 self-start">Tỷ lệ hoàn thành</span>
                  <div className="w-[100px] h-[100px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[{ v: completionRate }, { v: 100 - completionRate }]} cx="50%" cy="50%" innerRadius={32} outerRadius={46} startAngle={90} endAngle={-270} dataKey="v" stroke="none">
                          <Cell fill={completionRate >= 90 ? "#059669" : completionRate >= 70 ? "#d97706" : "#dc2626"} />
                          <Cell fill="#e2e8f0" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-black text-2xl" style={{ color: "#0f172a" }}>{completionRate}%</span>
                    </div>
                  </div>
                  <span className="text-[12px] font-bold text-slate-600 mt-1">{s?.completed ?? 0} / {s?.total_orders ?? 0}</span>
                </Card>
              </motion.div>
            </div>
          </Col>

          {/* Center — Main chart */}
          <Col xs={24} lg={12}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="h-full">
              <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: "16px 20px 8px" }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Title level={5} className="m-0 text-[15px]">Sản lượng theo ngày</Title>
                    <span className="text-[11px] font-semibold text-slate-500">{dayjs(data.from).format("DD/MM")} – {dayjs(data.to).format("DD/MM/YYYY")}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] font-semibold">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Hoàn thành</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Đang xử lý</span>
                  </div>
                </div>
                <div className="w-full h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={trend} 
                      margin={{ top: 0, right: 0, left: -20, bottom: 0 }} 
                      barCategoryGap="25%"
                      onClick={(e: any) => { if (e && e.activePayload) handlePeriodClick(e.activePayload[0].payload); }}
                      style={{ cursor: "pointer" }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }} dy={6} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                      <RTooltip content={<Tip />} />
                      <Bar dataKey="Hoàn thành" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Đang xử lý" fill="#d97706" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Summary footer */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 mt-2 -mx-5 px-5">
                  <div className="py-3 text-center">
                    <span className="text-[12px] font-semibold text-slate-500 block">Tổng số chuyến</span>
                    <div className="font-black text-xl" style={{ color: "#0f172a" }}>{(s?.total_orders ?? 0).toLocaleString("vi-VN")}</div>
                    <span className="text-[12px] font-bold text-emerald-600">{completionRate}% hoàn thành</span>
                  </div>
                  <div className="py-3 text-center">
                    <span className="text-[12px] font-semibold text-slate-500 block">Tổng KM</span>
                    <div className="font-black text-xl" style={{ color: "#0f172a" }}>{Math.round(s?.total_distance_km ?? 0).toLocaleString("vi-VN")}</div>
                    <span className="text-[12px] font-bold text-amber-600">≈ {s && s.total_orders > 0 ? Math.round(s.total_distance_km / s.total_orders) : 0} km/chuyến</span>
                  </div>
                  <div className="py-3 text-center">
                    <span className="text-[12px] font-semibold text-slate-500 block">Trung bình</span>
                    <div className="font-black text-xl" style={{ color: "#0f172a" }}>{avg}</div>
                    <span className="text-[12px] font-bold text-blue-600">chuyến/{query.group_by === "day" ? "ngày" : query.group_by === "week" ? "tuần" : "tháng"}</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          </Col>

          {/* Right — Station performance with circular rings */}
          <Col xs={24} lg={7}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="h-full">
              <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                  <Title level={5} className="m-0 text-[15px]">Hiệu suất Trạm</Title>
                  <Tag className="rounded-full border-0 text-[11px] font-bold" color="cyan">{data.top_stations.length} trạm</Tag>
                </div>
                <div className="flex-1 px-4 py-3 space-y-5">
                  {data.top_stations.map((st, i) => {
                    const pct = s && s.total_orders > 0 ? Math.round(st.total_orders / s.total_orders * 100) : 0;
                    const colors = ["#059669", "#2563eb", "#d97706", "#7c3aed", "#dc2626"];
                    const cl = colors[i % 5];
                    return (
                      <div key={st.station_id} className="flex items-center gap-3">
                        {/* Ring */}
                        <div className="shrink-0 relative" style={{ width: 48, height: 48 }}>
                          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
                            <circle cx="18" cy="18" r="14" fill="none" stroke={cl} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${pct * 0.88} 88`} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[14px] font-bold block truncate" style={{ color: "#0f172a" }}>{st.station_name}</span>
                          <span className="text-[12px] font-semibold" style={{ color: cl }}>{st.total_orders.toLocaleString("vi-VN")} chuyến</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[15px] font-black" style={{ color: cl }}>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          </Col>
        </Row>

        {/* ═══ ROW 3: Vehicle Ranking + Recent Periods + Pie Chart ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ alignItems: "stretch" }}>
          {/* Vehicle Ranking */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="min-h-0">
            <div className="h-full">
              <VehicleRanking vehicles={data.top_vehicles} baseQuery={query} maxOrders={data.top_vehicles[0]?.total_orders || 1} />
            </div>
          </motion.div>

          {/* Recent Periods — compact list */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="min-h-0">
            <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <Title level={5} className="m-0 text-[15px]">Sản lượng theo ngày gần nhất</Title>
                <span className="text-[12px] font-bold text-slate-500">5 ngày</span>
              </div>
              <div className="divide-y divide-gray-50 flex-1">
                {[...data.series].reverse().slice(0, 5).map((row) => {
                  const rate = row.total_orders > 0 ? Math.round(row.completed / row.total_orders * 100) : 0;
                  const rateColor = rate >= 90 ? "#059669" : rate >= 70 ? "#d97706" : "#dc2626";
                  return (
                    <div key={row.period} onClick={() => handlePeriodClick(row)} className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-blue-50/60 transition-all border-l-4 border-transparent hover:border-blue-500">
                      <div className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", border: "1px solid #e2e8f0" }}>
                        <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">NGÀY</span>
                        <span className="text-[18px] font-black leading-tight" style={{ color: "#1e40af" }}>{dayjs(row.period).format("DD")}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[16px] font-black block leading-snug" style={{ color: "#0f172a" }}>{dayjs(row.period).format("DD/MM/YYYY")}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[13px] font-bold text-slate-500">{row.completed}/{row.total_orders} hoàn thành</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-[13px] font-bold text-slate-500">{Math.round(row.distance_km).toLocaleString("vi-VN")} km</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[22px] font-black leading-none mb-1" style={{ color: "#0f172a" }}>{row.total_orders}</div>
                        <div className="text-[13px] font-black px-2 py-0.5 rounded-full inline-block" style={{ background: rateColor + "15", color: rateColor }}>{rate}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Show all table */}
              <div className="border-t border-gray-100 shrink-0">
                <button onClick={() => setShowAllSeries(!showAllSeries)} className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50/50 transition-colors">
                  {showAllSeries ? <><ChevronUp size={14} /> Thu gọn</> : <><ChevronDown size={14} /> Tất cả {data.series.length} kỳ</>}
                </button>
                <AnimatePresence>
                  {showAllSeries && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                      <Table columns={seriesColumns} dataSource={data.series.map((s, i) => ({ ...s, key: i }))} pagination={data.series.length > 20 ? { pageSize: 20, showSizeChanger: false, showTotal: (t) => `${t} kỳ` } : false} className="pro-tbl" size="small" onRow={(record) => ({ onClick: () => handlePeriodClick(record as unknown as ProductionSeriesItem), style: { cursor: "pointer" } })} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </motion.div>

          {/* Pie — Status Distribution + Summary */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="min-h-0">
            <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <Title level={5} className="m-0 text-[15px]">Phân bổ trạng thái</Title>
                <Tag color="blue" className="rounded-full border-0 text-[11px] font-bold">{pie.length} loại</Tag>
              </div>
              <div className="flex-1 px-4 pt-2">
                <div className="w-full h-[170px]">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pie} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={3} dataKey="v" nameKey="n">
                        {pie.map((e, i) => <Cell key={i} fill={e.c} />)}
                      </Pie>
                      <RTooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {pie.map(p => (
                    <div key={p.n} className="flex items-center gap-2 text-[13px]">
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: p.c, flexShrink: 0 }} />
                      <span className="text-slate-600 truncate">{p.n}: <span className="font-bold" style={{ color: "#0f172a" }}>{p.v}</span></span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Summary footer */}
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 shrink-0">
                <div className="py-2.5 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 block">Tổng chuyến</span>
                  <div className="font-black text-[17px]" style={{ color: "#0f172a" }}>{(s?.total_orders ?? 0).toLocaleString("vi-VN")}</div>
                </div>
                <div className="py-2.5 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 block">Hoàn thành</span>
                  <div className="font-black text-[17px] text-emerald-600">{completionRate}%</div>
                </div>
                <div className="py-2.5 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 block">Đang xử lý</span>
                  <div className="font-black text-[16px] text-amber-600">{((s?.running ?? 0) + (s?.collecting ?? 0) + (s?.transporting ?? 0)).toLocaleString("vi-VN")}</div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </>)}

      {/* Period drill-down Drawer */}
      <Drawer
        title={null}
        placement="right" width={960}
        open={periodDrawer} onClose={() => setPeriodDrawer(false)}
        styles={{ header: { display: "none" }, body: { padding: 0 } }}
      >
        {/* Custom header */}
        <div style={{ background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)", padding: "20px 28px", color: "#fff" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[20px] font-black">Chi tiết chuyến — {selectedPeriod ? dayjs(selectedPeriod).format(query.group_by === "month" ? "MM/YYYY" : "DD/MM/YYYY") : ""}</div>
              <div className="text-[14px] font-semibold opacity-80 mt-1">{periodOrders.length} chuyến trong kỳ này</div>
            </div>
            <button onClick={() => setPeriodDrawer(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors">
              <span className="text-white text-lg font-bold">✕</span>
            </button>
          </div>
          {/* Summary strip */}
          {periodOrders.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mt-2">
              {[
                { label: "Tổng chuyến", value: periodOrders.length, color: "#fff" },
                { label: "Hoàn thành", value: periodOrders.filter(o => o.order_status === "completed").length, color: "#86efac" },
                { label: "Đang xử lý", value: periodOrders.filter(o => ["running", "collecting", "transporting"].includes(o.order_status ?? "")).length, color: "#fde68a" },
                { label: "Tổng Km", value: Math.round(periodOrders.reduce((sum, o) => sum + (o.order_multi?.distance_end ?? 0), 0)).toLocaleString("vi-VN"), color: "#93c5fd" },
              ].map((item, i) => (
                <div key={i} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.12)" }}>
                  <div className="text-[11px] font-semibold opacity-70">{item.label}</div>
                  <div className="text-[22px] font-black leading-tight" style={{ color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table content */}
        <div className="p-5">
          {loadingPeriod ? (
            <div className="flex items-center justify-center py-20"><Spin size="large" /></div>
          ) : periodOrders.length === 0 ? (
            <Empty description="Không có chuyến nào trong kỳ này" className="py-20" />
          ) : (
            <Table
              columns={[
                { title: "STT", key: "n", width: 50, align: "center" as const, render: (_: any, __: any, i: number) => <span className="text-[14px] font-bold text-slate-500">{(drawerPage - 1) * DRAWER_PAGE_SIZE + i + 1}</span> },
                {
                  title: "Xe", key: "xe", width: 170, render: (_: any, r: Order) => (
                    <div>
                      <div className="font-black text-[15px]" style={{ color: "#0f172a" }}>{r.vehicles?.vehicle_name ?? "-"}</div>
                      <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace", fontSize: 12, color: "#334155", fontWeight: 700, display: "inline-block", marginTop: 2 }}>{r.vehicles?.vehicle_license_plate ?? "-"}</span>
                    </div>
                  )
                },
                {
                  title: "Trạng thái", dataIndex: "order_status", key: "st", width: 130, render: (v: string) => {
                    const M: Record<string, { l: string; c: string; bg: string }> = {
                      completed: { l: "Hoàn thành", c: "#059669", bg: "#d1fae5" },
                      canceled: { l: "Đã hủy", c: "#dc2626", bg: "#fee2e2" },
                      running: { l: "Đang chạy", c: "#2563eb", bg: "#dbeafe" },
                      collecting: { l: "Nhận hàng", c: "#7c3aed", bg: "#ede9fe" },
                      transporting: { l: "Vận chuyển", c: "#d97706", bg: "#fef3c7" },
                      pending: { l: "Chờ xử lý", c: "#64748b", bg: "#f1f5f9" }
                    };
                    const m = M[v] ?? { l: v, c: "#64748b", bg: "#f1f5f9" };
                    return <span style={{ background: m.bg, color: m.c, fontWeight: 700, fontSize: 13, padding: "4px 12px", borderRadius: 20, display: "inline-block" }}>{m.l}</span>;
                  }
                },
                { title: "Trạm", key: "sta", width: 120, render: (_: any, r: Order) => <span className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{r.stations?.station_name ?? "-"}</span> },
                {
                  title: "Km", key: "km", width: 90, align: "right" as const, render: (_: any, r: Order) => {
                    const km = Math.round(r.order_multi?.distance_end ?? 0);
                    return <span className="font-mono text-[15px] font-black" style={{ color: km > 0 ? "#2563eb" : "#94a3b8" }}>{km > 0 ? km.toLocaleString("vi-VN") : "0"}</span>;
                  }
                },
                {
                  title: "Dừng/Đỗ", key: "stops", width: 70, align: "center" as const, render: (_: any, r: Order) => {
                    const stops = r.order_multi?.nStop_end ?? 0;
                    return <span className="text-[14px] font-bold" style={{ color: stops > 0 ? "#d97706" : "#94a3b8" }}>{stops}</span>;
                  }
                },
                {
                  title: "Bắt đầu", dataIndex: "order_start_datetime", key: "sd", width: 145, render: (v: string | null) => v ? (
                    <div>
                      <div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(v).format("HH:mm")}</div>
                      <div className="text-[12px] font-semibold text-slate-400">{dayjs(v).format("DD/MM/YYYY")}</div>
                    </div>
                  ) : <span className="text-slate-300 text-[14px]">—</span>
                },
                {
                  title: "Kết thúc", dataIndex: "order_end_datetime", key: "ed", width: 145, render: (v: string | null) => v ? (
                    <div>
                      <div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(v).format("HH:mm")}</div>
                      <div className="text-[12px] font-semibold text-slate-400">{dayjs(v).format("DD/MM/YYYY")}</div>
                    </div>
                  ) : <span className="text-slate-300 text-[14px]">—</span>
                },
                {
                  title: "Thời gian", key: "dur", width: 90, align: "center" as const, render: (_: any, r: Order) => {
                    if (!r.order_start_datetime || !r.order_end_datetime) return <span className="text-slate-300 text-[13px]">—</span>;
                    const mins = dayjs(r.order_end_datetime).diff(dayjs(r.order_start_datetime), "minute");
                    if (mins < 60) return <span className="text-[14px] font-bold text-violet-600">{mins} phút</span>;
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    return <span className="text-[14px] font-bold text-violet-600">{h}h{m > 0 ? ` ${m}p` : ""}</span>;
                  }
                },
              ]}
              dataSource={periodOrders.map((o, i) => ({ ...o, key: (o as any).order_id ?? i }))}
              size="middle" scroll={{ x: 960 }}
              pagination={periodOrders.length > DRAWER_PAGE_SIZE ? { pageSize: DRAWER_PAGE_SIZE, showSizeChanger: false, showTotal: (t, range) => `${range[0]}–${range[1]} / ${t} chuyến`, onChange: (p) => setDrawerPage(p) } : false}
              className="drawer-tbl"
            />
          )}
        </div>
      </Drawer>

      <style jsx global>{`
        .pro-tbl .ant-table-thead > tr > th { background: transparent !important; font-weight: 600; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #f1f5f9 !important; }
        .pro-tbl .ant-table-tbody > tr > td { border-bottom: 1px solid #f8fafc !important; }
        .pro-tbl .ant-table-tbody > tr:hover > td { background: #f8fafc !important; }
        .drawer-tbl .ant-table-thead > tr > th { background: #f8fafc !important; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 2px solid #e2e8f0 !important; padding: 12px 14px !important; }
        .drawer-tbl .ant-table-tbody > tr > td { border-bottom: 1px solid #f1f5f9 !important; padding: 10px 14px !important; vertical-align: middle; }
        .drawer-tbl .ant-table-tbody > tr:hover > td { background: #eff6ff !important; }
        .drawer-tbl .ant-pagination { margin-top: 16px !important; }
        .drawer-tbl .ant-pagination .ant-pagination-item-active { border-color: #3b82f6; }
        .drawer-tbl .ant-pagination .ant-pagination-item-active a { color: #3b82f6; }
      `}</style>
    </div>
  );
}
