"use client";
import React, { useState, useCallback } from "react";
import { Card, Drawer, Tag, Button, Spin, Empty, Table, Progress } from "antd";
import { Truck, ChevronDown, ChevronUp, Trophy, ArrowUpRight } from "lucide-react";
import { Typography } from "antd";
import { motion, AnimatePresence } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import dayjs from "dayjs";
import reportApi from "@/services/report.service";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import type { ProductionTopVehicle, ProductionQuery, ProductionReportResponse, ProductionSeriesItem } from "@/types/report";

const { Text, Title } = Typography;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  completed:    { label: "Hoàn thành",  color: "success" },
  canceled:     { label: "Đã hủy",      color: "error" },
  running:      { label: "Đang chạy",   color: "processing" },
  collecting:   { label: "Nhận hàng",   color: "purple" },
  transporting: { label: "Vận chuyển",  color: "warning" },
  pending:      { label: "Chờ",         color: "default" },
  init:         { label: "Khởi tạo",   color: "default" },
};

interface Props {
  vehicles: ProductionTopVehicle[];
  baseQuery: ProductionQuery;
  maxOrders: number;
}

export default function VehicleRanking({ vehicles, baseQuery, maxOrders }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [selectedVehicle, setSelectedVehicle] = useState<ProductionTopVehicle | null>(null);
  const [detail, setDetail] = useState<ProductionReportResponse | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openDetail = useCallback(async (v: ProductionTopVehicle) => {
    setSelectedVehicle(v);
    setDrawerOpen(true);
    setLoadingDetail(true);
    setDetail(null);
    setOrders([]);
    try {
      const [repRes, ordRes] = await Promise.all([
        reportApi.getProduction({ ...baseQuery, vehicle_id: v.vehicle_id }),
        orderApi.getAll({ vehicle_id: String(v.vehicle_id) }),
      ]);
      setDetail(repRes.data as unknown as ProductionReportResponse);
      const raw = ordRes.data as any;
      const all: Order[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []);
      // Client-side filter theo date range của baseQuery
      const from = baseQuery.from ? dayjs(baseQuery.from) : null;
      const to = baseQuery.to ? dayjs(baseQuery.to) : null;
      const filtered = from || to ? all.filter((o) => {
        const d = dayjs(o.order_start_datetime ?? o.order_init_datetime);
        if (!d.isValid()) return true;
        if (from && d.isBefore(from, "day")) return false;
        if (to && d.isAfter(to, "day")) return false;
        return true;
      }) : all;
      setOrders(filtered);
    } catch (e) {
      console.error("Failed to load vehicle detail", e);
    } finally {
      setLoadingDetail(false);
    }
  }, [baseQuery]);


  const fmt = (d: string) => dayjs(d).format(baseQuery.group_by === "month" ? "MM/YYYY" : "DD/MM");
  const top3 = vehicles.slice(0, 3);
  const rest = vehicles.slice(3);

  const trendData = (detail?.series ?? []).map((s: ProductionSeriesItem) => ({
    period: fmt(s.period),
    "Hoàn thành": s.completed,
    "Đang xử lý": s.running + s.collecting + s.transporting,
  }));

  // Computed totals for drawer
  const totalKm = orders.reduce((acc, o) => acc + (o.order_multi?.distance_end ?? 0), 0);
  const totalStops = orders.reduce((acc, o) => acc + (o.order_multi?.nStop_end ?? 0), 0);
  const totalStopSec = orders.reduce((acc, o) => acc + (o.order_multi?.stop_duration_seconds ?? 0), 0);
  const fmtDur = (sec: number) => { const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m} phút`; };

  const orderCols = [
    { title: "STT", key: "n", width: 50, align: "center" as const, render: (_: any, __: any, i: number) => <span className="text-[14px] font-bold text-slate-500">{(currentPage - 1) * PAGE_SIZE + i + 1}</span> },
    { title: "Trạng thái", dataIndex: "order_status", key: "st", width: 130, render: (v: string) => {
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
    }},
    { title: "Trạm", key: "sta", width: 120, render: (_: any, r: Order) => <span className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{r.stations?.station_name ?? "-"}</span> },
    { title: "Km", key: "km", width: 90, align: "right" as const, render: (_: any, r: Order) => {
      const km = Math.round(r.order_multi?.distance_end ?? 0);
      return <span className="font-mono text-[15px] font-black" style={{ color: km > 0 ? "#2563eb" : "#94a3b8" }}>{km > 0 ? km.toLocaleString("vi-VN") : "0"}</span>;
    }},
    { title: "Dừng/Đỗ", key: "stops", width: 80, align: "center" as const, render: (_: any, r: Order) => {
      const stops = r.order_multi?.nStop_end ?? 0;
      return <span className="text-[14px] font-bold" style={{ color: stops > 0 ? "#d97706" : "#94a3b8" }}>{stops}</span>;
    }},
    { title: "TG dừng", key: "sd2", width: 90, align: "right" as const, render: (_: any, r: Order) => {
      const sec = r.order_multi?.stop_duration_seconds ?? 0;
      if (sec === 0) return <span className="text-slate-300 text-[14px]">—</span>;
      const mins = Math.floor(sec / 60);
      if (mins < 60) return <span className="text-[14px] font-bold text-slate-500">{mins} phút</span>;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return <span className="text-[14px] font-bold text-slate-500">{h}h{m > 0 ? ` ${m}m` : ""}</span>;
    }},
    { title: "Bắt đầu", dataIndex: "order_start_datetime", key: "sd", width: 130, render: (v: string | null) => v ? (
      <div>
        <div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(v).format("HH:mm")}</div>
        <div className="text-[12px] font-semibold text-slate-400">{dayjs(v).format("DD/MM/YYYY")}</div>
      </div>
    ) : <span className="text-slate-300 text-[14px]">—</span> },
    { title: "Kết thúc", dataIndex: "order_end_datetime", key: "ed", width: 130, render: (v: string | null) => v ? (
      <div>
        <div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(v).format("HH:mm")}</div>
        <div className="text-[12px] font-semibold text-slate-400">{dayjs(v).format("DD/MM/YYYY")}</div>
      </div>
    ) : <span className="text-slate-300 text-[14px]">—</span> },
  ];

  const detailCols = [
    { title: "Kỳ", dataIndex: "period", key: "p", width: 90, render: (v: string) => <span className="text-[14px] font-bold text-slate-700">{fmt(v)}</span> },
    { title: "Tổng", dataIndex: "total_orders", key: "t", width: 70, align: "center" as const, render: (v: number) => <span className="text-[16px] font-black text-blue-600">{v}</span> },
    { title: "Hoàn thành", dataIndex: "completed", key: "c", width: 100, align: "center" as const, render: (v: number) => <span className="text-[15px] font-bold text-emerald-600">{v}</span> },
    { title: "Km", dataIndex: "distance_km", key: "km", align: "right" as const, render: (v: number) => <span className="font-mono text-[15px] font-black text-slate-700">{Math.round(v).toLocaleString("vi-VN")}</span> },
    { title: "Tỷ lệ", key: "rate", width: 140, render: (_: any, r: ProductionSeriesItem) => { const p = r.total_orders > 0 ? Math.round(r.completed / r.total_orders * 100) : 0; return <Progress percent={p} strokeColor={p >= 90 ? "#10b981" : "#f59e0b"} size="small" />; } },
  ];

  // Podium colors
  const podium = [
    { bg: "linear-gradient(135deg, #3b82f6, #2563eb)", light: "#eff6ff", text: "#fff" },
    { bg: "linear-gradient(135deg, #10b981, #059669)", light: "#ecfdf5", text: "#fff" },
    { bg: "linear-gradient(135deg, #8b5cf6, #7c3aed)", light: "#faf5ff", text: "#fff" },
  ];

  return (
    <>
      <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div style={{ background: "#eff6ff", width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trophy size={15} className="text-blue-500" />
            </div>
            <Title level={5} className="m-0 text-sm">Xếp hạng xe năng suất</Title>
          </div>
          <Tag className="rounded-full border-0 text-xs font-semibold" color="blue">{vehicles.length} xe</Tag>
        </div>

        {/* Top 3 — horizontal stat cards */}
        <div className="grid grid-cols-3 gap-2.5 px-4 py-3 shrink-0">
          {top3.map((v, i) => (
            <motion.div
              key={v.vehicle_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => openDetail(v)}
              className="cursor-pointer rounded-xl p-3 relative overflow-hidden group transition-all hover:shadow-md"
              style={{ background: podium[i].bg }}
            >
              {/* Rank badge */}
              <div
                className="absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black"
                style={{ background: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.9)" }}
              >
                {i + 1}
              </div>
              {/* Vehicle info */}
              <div className="text-white">
                <div className="font-extrabold text-[17px] leading-tight flex items-center gap-1.5">
                  {v.vehicle_name}
                  <span style={{ background: "rgba(255,255,255,0.2)", padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: 9, fontWeight: 700 }}>{v.vehicle_license_plate}</span>
                </div>
              </div>
              {/* Stats */}
              <div className="flex items-end justify-between mt-4">
                <div>
                  <div className="text-[24px] font-black text-white leading-none">{v.total_orders}</div>
                  <div className="text-[10px] font-bold mt-1 opacity-70 uppercase">chuyến</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-white leading-none">{Math.round(v.total_distance_km).toLocaleString("vi-VN")}</div>
                  <div className="text-[10px] font-bold mt-1 opacity-70 uppercase">km</div>
                </div>
              </div>
              {/* Bottom bar */}
              <div className="mt-2 w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.15)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round(v.total_orders / maxOrders * 100)}%`, background: "rgba(255,255,255,0.5)" }} />
              </div>
              {/* Hover arrow */}
              <ArrowUpRight size={14} className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-60 transition-opacity text-white" />
            </motion.div>
          ))}
        </div>

        {/* Rest — compact table-style list */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {rest.length > 0 && (
            <>
              {/* Table header */}
              <div className="flex items-center gap-3 px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0" style={{ background: "#fafbfc" }}>
                <span className="w-8 text-center">#</span>
                <span className="flex-1">Xe</span>
                <span className="w-20 text-right">Km</span>
                <span className="w-12 text-center">SL</span>
                <span className="w-24">Tỷ lệ</span>
              </div>

              {/* Visible rows (first 4 or all if expanded) */}
              <div className="flex-1 overflow-hidden">
                <AnimatePresence>
                  {(expanded ? rest : rest.slice(0, 4)).map((v, i) => {
                    const pct = Math.round(v.total_orders / maxOrders * 100);
                    return (
                      <motion.div
                        key={v.vehicle_id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.02 }}
                        onClick={() => openDetail(v)}
                        className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-blue-50/40 transition-colors border-b border-gray-50/80"
                      >
                        <span className="w-8 text-center text-[13px] font-bold text-slate-400">{i + 4}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[14px] text-slate-700 leading-tight">{v.vehicle_name}</div>
                          <span style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4, padding: "0px 6px", fontFamily: "monospace", fontSize: 10, color: "#64748b", fontWeight: 700, display: "inline-block", marginTop: 2 }}>{v.vehicle_license_plate}</span>
                        </div>
                        <span className="w-20 text-right font-mono text-[13px] font-bold text-slate-600">{Math.round(v.total_distance_km).toLocaleString("vi-VN")}</span>
                        <div className="w-12 text-center">
                          <span className="inline-block bg-blue-50 text-blue-600 font-black text-[13px] px-1.5 rounded-md">{v.total_orders}</span>
                        </div>
                        <div className="w-24 flex flex-col justify-center">
                          <Progress 
                            percent={pct} 
                            size="small" 
                            strokeColor={pct >= 90 ? "#10b981" : pct >= 70 ? "#3b82f6" : "#f59e0b"} 
                            format={(p) => <span className="text-[10px] font-bold text-slate-500">{p}%</span>}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Expand button */}
              <div className="shrink-0 border-t border-gray-50">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 transition-colors"
                >
                  {expanded ? <><ChevronUp size={13} /> Thu gọn</> : <><ChevronDown size={13} /> Xem tất cả {vehicles.length} xe</>}
                </button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* detail drawer */}
      <Drawer
        title={null}
        placement="right" width={960}
        onClose={() => setDrawerOpen(false)} open={drawerOpen}
        styles={{ header: { display: "none" }, body: { padding: 0 } }}
      >
        {/* Custom Header */}
        <div style={{ background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)", padding: "20px 28px", color: "#fff" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Truck size={24} className="text-white" />
              </div>
              <div>
                <div className="text-[22px] font-black">{selectedVehicle?.vehicle_name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span style={{ background: "rgba(255,255,255,.2)", padding: "2px 8px", borderRadius: 6, fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{selectedVehicle?.vehicle_license_plate}</span>
                  <span className="text-[13px] font-semibold opacity-80">— {baseQuery.from ? dayjs(baseQuery.from).format("DD/MM/YYYY") : ""} → {baseQuery.to ? dayjs(baseQuery.to).format("DD/MM/YYYY") : ""}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setDrawerOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors">
              <span className="text-white text-lg font-bold">✕</span>
            </button>
          </div>
          
          {detail && (
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Tổng chuyến", value: detail.summary.total_orders },
                { label: "Hoàn thành", value: `${detail.summary.completed} (${detail.summary.total_orders > 0 ? Math.round(detail.summary.completed / detail.summary.total_orders * 100) : 0}%)` },
                { label: "Tổng KM", value: `${Math.round(totalKm).toLocaleString("vi-VN")}` },
                { label: "Lệnh thực tế", value: orders.length },
                { label: "Tổng dừng", value: `${totalStops} lần` },
                { label: "TG dừng", value: fmtDur(totalStopSec) },
              ].map((m) => (
                <div key={m.label} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.12)" }}>
                  <div className="text-[11px] font-semibold opacity-70 mb-0.5">{m.label}</div>
                  <div className="font-black text-[18px] leading-tight text-white">{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-20"><Spin size="large" /></div>
          ) : !detail ? (
            <Empty description="Không có dữ liệu" />
          ) : (
            <div className="space-y-6">
              {/* trend chart */}
            <div>
              <Text strong className="text-sm block mb-2">Xu hướng theo kỳ</Text>
              <div className="w-full h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vgc2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <RTooltip />
                    <Area type="monotone" dataKey="Hoàn thành" stroke="#3b82f6" strokeWidth={2.5} fill="url(#vgc2)" />
                    <Area type="monotone" dataKey="Đang xử lý" stroke="#f59e0b" strokeWidth={2} fill="none" strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* individual orders */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Text strong className="text-sm">Chi tiết từng lệnh</Text>
                <Text type="secondary" className="text-xs">{orders.length > 0 ? `${orders.length} lệnh` : "Hiển thị theo kỳ"}</Text>
              </div>
              {orders.length > 0 ? (
                <Table
                  columns={orderCols}
                  dataSource={orders.map((o, i) => ({ ...o, key: o.order_id ?? i }))}
                  size="middle"
                  scroll={{ x: 900 }}
                  pagination={orders.length > PAGE_SIZE ? { pageSize: PAGE_SIZE, showSizeChanger: false, showTotal: (t, range) => `${range[0]}–${range[1]} / ${t} lệnh`, onChange: (p) => setCurrentPage(p) } : false}
                  className="drawer-tbl"
                />
              ) : (
                <Table
                  columns={detailCols}
                  dataSource={detail.series.map((s, i) => ({ ...s, key: i }))}
                  size="middle"
                  pagination={detail.series.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
                  className="drawer-tbl"
                />
              )}
            </div>
            </div>
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
    </>
  );
}
