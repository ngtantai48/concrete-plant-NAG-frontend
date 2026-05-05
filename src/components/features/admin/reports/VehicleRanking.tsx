"use client";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Card, Drawer, Tag, Spin, Empty, Table, Progress, Select, Pagination } from "antd";
import { Truck, Trophy, ChevronRight, ArrowUpDown } from "lucide-react";
import { Typography } from "antd";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import dayjs from "dayjs";
import reportApi from "@/services/report.service";
import orderApi from "@/services/order.service";
import type { Order } from "@/types/order";
import type { ProductionTopVehicle, ProductionQuery, ProductionReportResponse, ProductionSeriesItem } from "@/types/report";

const { Text, Title } = Typography;
const N = (v: any) => Number(v || 0);

const getOrderDistanceKm = (order: Order) => {
  const start = N(order.order_multi?.distance_start);
  const end = N(order.order_multi?.distance_end);
  if (end > 0 && end >= start) {
    return end - start;
  }
  return 0;
};

interface Props {
  vehicles: ProductionTopVehicle[];
  baseQuery: ProductionQuery;
  maxOrders: number;
}

export default function VehicleRanking({ vehicles, baseQuery, maxOrders: _maxOrders }: Props) {
  void _maxOrders;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<ProductionTopVehicle | null>(null);
  const [detail, setDetail] = useState<ProductionReportResponse | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [sortMode, setSortMode] = useState<"orders" | "km">("orders");
  const [page, setPage] = useState(1);
  const DETAIL_PAGE_SIZE = 15;
  const PAGE_SIZE = 5;

  const sortedVehicles = useMemo(() => {
    const clone = [...vehicles];
    clone.sort((a, b) => {
      if (sortMode === "km") {
        return (
          N(b.total_distance_km) - N(a.total_distance_km) ||
          N(b.total_orders) - N(a.total_orders) ||
          String(a.vehicle_name || "").localeCompare(String(b.vehicle_name || ""))
        );
      }
      return (
        N(b.total_orders) - N(a.total_orders) ||
        N(b.total_distance_km) - N(a.total_distance_km) ||
        String(a.vehicle_name || "").localeCompare(String(b.vehicle_name || ""))
      );
    });
    return clone;
  }, [vehicles, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sortedVehicles.length / PAGE_SIZE));
  const shownVehicles = useMemo(
    () => sortedVehicles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedVehicles, page]
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [sortMode]);

  const openDetail = useCallback(async (vehicle: ProductionTopVehicle) => {
    setSelectedVehicle(vehicle);
    setDrawerOpen(true);
    setLoadingDetail(true);
    setDetail(null);
    setOrders([]);
    setDetailPage(1);

    try {
      const [repRes, ordRes] = await Promise.all([
        reportApi.getProduction({ ...baseQuery, vehicle_id: vehicle.vehicle_id }),
        orderApi.getAll({ vehicle_id: String(vehicle.vehicle_id) }),
      ]);
      setDetail(repRes.data as unknown as ProductionReportResponse);
      const raw = ordRes.data as any;
      const allOrders: Order[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []);
      const from = baseQuery.from ? dayjs(baseQuery.from) : null;
      const to = baseQuery.to ? dayjs(baseQuery.to) : null;
      const filteredOrders = allOrders.filter((order) => {
        const date = dayjs(order.order_start_datetime ?? order.order_init_datetime);
        if (!date.isValid()) return false;
        if (from && date.isBefore(from, "day")) return false;
        if (to && date.isAfter(to, "day")) return false;
        return true;
      });
      setOrders(filteredOrders);
    } catch (error) {
      console.error("Failed to load vehicle detail", error);
    } finally {
      setLoadingDetail(false);
    }
  }, [baseQuery]);

  const fmt = (d: string) => dayjs(d).format(baseQuery.group_by === "month" ? "MM/YYYY" : "DD/MM");
  const trendData = (detail?.series ?? []).map((series: ProductionSeriesItem) => ({
    period: fmt(series.period),
    "Hoàn thành": series.completed,
    "Đang xử lý": series.running + series.collecting + series.transporting,
  }));

  const totalKm = orders.reduce((acc, order) => acc + getOrderDistanceKm(order), 0);
  const totalStops = orders.reduce((acc, order) => acc + N(order.order_multi?.nStop_end), 0);
  const totalStopSec = orders.reduce((acc, order) => acc + N(order.order_multi?.stop_duration_seconds), 0);
  const fmtDur = (sec: number) => {
    const hour = Math.floor(sec / 3600);
    const minute = Math.floor((sec % 3600) / 60);
    return hour > 0 ? `${hour}h ${minute}m` : `${minute} phút`;
  };

  const detailCols = [
    { title: "STT", key: "n", width: 50, align: "center" as const, render: (_: any, __: any, i: number) => <span className="text-[14px] font-bold text-slate-500">{(detailPage - 1) * DETAIL_PAGE_SIZE + i + 1}</span> },
    {
      title: "Trạng thái", dataIndex: "order_status", key: "st", width: 130, render: (v: string) => {
        const colorMap: Record<string, { l: string; c: string; bg: string }> = {
          completed: { l: "Hoàn thành", c: "#059669", bg: "#d1fae5" },
          canceled: { l: "Đã hủy", c: "#dc2626", bg: "#fee2e2" },
          running: { l: "Đang chạy", c: "#2563eb", bg: "#dbeafe" },
          collecting: { l: "Nhận hàng", c: "#7c3aed", bg: "#ede9fe" },
          transporting: { l: "Vận chuyển", c: "#d97706", bg: "#fef3c7" },
          pending: { l: "Chờ xử lý", c: "#64748b", bg: "#f1f5f9" },
        };
        const mapped = colorMap[v] ?? { l: v, c: "#64748b", bg: "#f1f5f9" };
        return <span style={{ background: mapped.bg, color: mapped.c, fontWeight: 700, fontSize: 13, padding: "4px 12px", borderRadius: 20, display: "inline-block" }}>{mapped.l}</span>;
      }
    },
    { title: "Trạm", key: "sta", width: 120, render: (_: any, r: Order) => <span className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{r.stations?.station_name ?? "-"}</span> },
    {
      title: "Km", key: "km", width: 90, align: "right" as const, render: (_: any, r: Order) => {
        const km = Math.round(getOrderDistanceKm(r));
        return <span className="font-mono text-[15px] font-black" style={{ color: km > 0 ? "#2563eb" : "#94a3b8" }}>{km > 0 ? km.toLocaleString("vi-VN") : "0"}</span>;
      }
    },
    {
      title: "Dừng/Đỗ", key: "stops", width: 80, align: "center" as const, render: (_: any, r: Order) => {
        const stops = N(r.order_multi?.nStop_end);
        return <span className="text-[14px] font-bold" style={{ color: stops > 0 ? "#d97706" : "#94a3b8" }}>{stops}</span>;
      }
    },
    {
      title: "TG dừng", key: "sd2", width: 90, align: "right" as const, render: (_: any, r: Order) => {
        const sec = N(r.order_multi?.stop_duration_seconds);
        if (sec === 0) return <span className="text-slate-300 text-[14px]">—</span>;
        const mins = Math.floor(sec / 60);
        if (mins < 60) return <span className="text-[14px] font-bold text-slate-500">{mins} phút</span>;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return <span className="text-[14px] font-bold text-slate-500">{h}h{m > 0 ? ` ${m}m` : ""}</span>;
      }
    },
    { title: "Bắt đầu", dataIndex: "order_start_datetime", key: "sd", width: 130, render: (v: string | null) => v ? (<div><div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(v).format("HH:mm")}</div><div className="text-[12px] font-semibold text-slate-400">{dayjs(v).format("DD/MM/YYYY")}</div></div>) : <span className="text-slate-300 text-[14px]">—</span> },
    { title: "Kết thúc", dataIndex: "order_end_datetime", key: "ed", width: 130, render: (v: string | null) => v ? (<div><div className="text-[14px] font-bold" style={{ color: "#0f172a" }}>{dayjs(v).format("HH:mm")}</div><div className="text-[12px] font-semibold text-slate-400">{dayjs(v).format("DD/MM/YYYY")}</div></div>) : <span className="text-slate-300 text-[14px]">—</span> },
  ];

  const perSeriesCols = [
    { title: "Kỳ", dataIndex: "period", key: "p", width: 90, render: (v: string) => <span className="text-[14px] font-bold text-slate-700">{fmt(v)}</span> },
    { title: "Tổng", dataIndex: "total_orders", key: "t", width: 70, align: "center" as const, render: (v: number) => <span className="text-[16px] font-black text-blue-600">{v}</span> },
    { title: "Hoàn thành", dataIndex: "completed", key: "c", width: 100, align: "center" as const, render: (v: number) => <span className="text-[15px] font-bold text-emerald-600">{v}</span> },
    { title: "Km", dataIndex: "distance_km", key: "km", align: "right" as const, render: (v: number) => <span className="font-mono text-[15px] font-black text-slate-700">{Math.round(v).toLocaleString("vi-VN")}</span> },
    { title: "Tỷ lệ", key: "rate", width: 140, render: (_: any, r: ProductionSeriesItem) => { const p = r.total_orders > 0 ? Math.round(r.completed / r.total_orders * 100) : 0; return <Progress percent={p} strokeColor={p >= 90 ? "#10b981" : "#f59e0b"} size="small" />; } },
  ];

  return (
    <>
      <Card className="border border-slate-200/70 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 gap-3 flex-nowrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <Trophy size={16} />
              </div>
              <Title level={5} className="m-0 text-sm font-black whitespace-nowrap">Xếp hạng xe năng suất</Title>
            </div>
            <span className="text-[11px] text-slate-400">Nhấn vào từng xe để xem chi tiết chuyến</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select
              size="small"
              value={sortMode}
              onChange={(value) => setSortMode(value)}
              className="min-w-[148px]"
              options={[
                { label: "Số chuyến", value: "orders" },
                { label: "KM", value: "km" },
              ]}
              suffixIcon={<ArrowUpDown size={14} className="text-slate-500" />}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 px-5 py-3">
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="grid grid-cols-[44px_82px_126px_96px_100px_18px] px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-slate-400 bg-slate-50 border-b border-slate-100">
              <div className="whitespace-nowrap">#</div>
              <div className="whitespace-nowrap">Mã xe</div>
              <div className="whitespace-nowrap">Biển số</div>
              <div className="whitespace-nowrap">Chuyến</div>
              <div className="whitespace-nowrap">KM</div>
              <div />
            </div>

            {shownVehicles.map((vehicle, index) => {
              const rank = (page - 1) * PAGE_SIZE + index + 1;
              const isTopThree = rank <= 3;
              return (
                <motion.div
                  key={vehicle.vehicle_id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => openDetail(vehicle)}
                  className={`group grid grid-cols-[44px_82px_126px_96px_100px_18px] gap-2 items-center px-3 py-2.5 border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer transition-all ${isTopThree ? "bg-blue-50/35" : ""}`}
                >
                  <div className="pr-1">
                    <span className={`${isTopThree ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"} inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black`}>
                      {rank}
                    </span>
                  </div>
                  <div className={`font-black text-[16px] leading-none truncate whitespace-nowrap ${isTopThree ? "text-blue-700" : "text-slate-800"}`}>{vehicle.vehicle_name}</div>
                  <div>
                    <span className="inline-flex items-center rounded-md border border-slate-200 px-2 py-[1px] text-[11px] font-black text-slate-500 font-mono whitespace-nowrap">
                      {vehicle.vehicle_license_plate}
                    </span>
                  </div>
                  <div className="text-[13px] font-bold text-slate-700 whitespace-nowrap">{N(vehicle.total_orders)} chuyến</div>
                  <div className="text-[13px] font-black text-slate-700 whitespace-nowrap">{Math.round(N(vehicle.total_distance_km)).toLocaleString("vi-VN")} km</div>
                  <div className="text-slate-300 transition-transform duration-200 group-hover:text-blue-500 group-hover:translate-x-0.5"><ChevronRight size={14} /></div>
                </motion.div>
              );
            })}
            {shownVehicles.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-400">Không có xe theo bộ lọc</div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              Hiển thị {(sortedVehicles.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1)} - {Math.min(page * PAGE_SIZE, sortedVehicles.length)} của {sortedVehicles.length} xe
            </span>
            <Pagination
              size="small"
              current={page}
              pageSize={PAGE_SIZE}
              total={sortedVehicles.length}
              onChange={(nextPage) => setPage(nextPage)}
              showSizeChanger={false}
              hideOnSinglePage
            />
          </div>
        </div>
      </Card>

      <Drawer
        title={null}
        placement="right"
        width={960}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        styles={{ header: { display: "none" }, body: { padding: 0 } }}
      >
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
              ].map((item) => (
                <div key={item.label} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.12)" }}>
                  <div className="text-[11px] font-semibold opacity-70 mb-0.5">{item.label}</div>
                  <div className="font-black text-[18px] leading-tight text-white">{item.value}</div>
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Text strong className="text-sm">Chi tiết từng lệnh</Text>
                  <Text type="secondary" className="text-xs">{orders.length > 0 ? `${orders.length} lệnh` : "Hiển thị theo kỳ"}</Text>
                </div>
                {orders.length > 0 ? (
                  <Table
                    columns={detailCols}
                    dataSource={orders.map((order, index) => ({ ...order, key: order.order_id ?? index }))}
                    size="middle"
                    scroll={{ x: 900 }}
                    pagination={orders.length > DETAIL_PAGE_SIZE ? { pageSize: DETAIL_PAGE_SIZE, showSizeChanger: false, showTotal: (total, range) => `${range[0]}–${range[1]} / ${total} lệnh`, onChange: (page) => setDetailPage(page) } : false}
                    className="drawer-tbl"
                  />
                ) : (
                  <Table
                    columns={perSeriesCols}
                    dataSource={detail.series.map((item, index) => ({ ...item, key: index }))}
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
        .drawer-tbl .ant-table-thead > tr > th { background: #f8fafc !important; font-weight: 700; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; border-bottom: 2px solid #e2e8f0 !important; padding: 12px 14px !important; }
        .drawer-tbl .ant-table-tbody > tr > td { border-bottom: 1px solid #f1f5f9 !important; padding: 10px 14px !important; vertical-align: middle; }
        .drawer-tbl .ant-table-tbody > tr:hover > td { background: #eff6ff !important; }
        .drawer-tbl .ant-pagination { margin-top: 16px !important; }
        .drawer-tbl .ant-pagination .ant-pagination-item-active { border-color: #3b82f6; }
        .drawer-tbl .ant-pagination .ant-pagination-item-active a { color: #3b82f6; }
        .ant-pagination .ant-pagination-item-active { border-color: #3b82f6; }
        .ant-pagination .ant-pagination-item-active a { color: #3b82f6; }
      `}</style>
    </>
  );
}
