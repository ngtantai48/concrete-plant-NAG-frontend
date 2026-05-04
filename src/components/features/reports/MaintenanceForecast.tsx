"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { exportToExcel } from "@/utils/exportReport";
import { Card, Row, Col, Typography, Space, Table, Tag, Progress, Button, Select, DatePicker, Spin, Empty, Tooltip, Input, InputNumber, Drawer, Divider } from "antd";
import {
  Wrench,
  AlertTriangle,
  ShieldCheck,
  Search,
  Download,
  Info,
  Clock,
  Gauge,
  Settings2,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import dayjs from "dayjs";
import reportApi from "@/services/report.service";
import type { MaintenanceForecastResponse, MaintenanceForecastItem, MaintenanceForecastQuery } from "@/types/report";

const { Title, Text } = Typography;

const RISK_CONFIG: Record<string, { color: string; text: string; icon: React.ReactNode; bg: string; tagColor: string }> = {
  critical: { color: "#ef4444", text: "Khẩn cấp", icon: <AlertTriangle size={14} />, bg: "#fef2f2", tagColor: "red" },
  warning:  { color: "#f59e0b", text: "Cảnh báo", icon: <Info size={14} />,           bg: "#fffbeb", tagColor: "gold" },
  normal:   { color: "#10b981", text: "An toàn",   icon: <ShieldCheck size={14} />,    bg: "#ecfdf5", tagColor: "green" },
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(255,255,255,0.96)", borderRadius: 12, padding: "10px 14px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", border: "1px solid #f1f5f9" }}>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ fontSize: 13 }}><span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>: <strong>{p.value}</strong></div>
      ))}
    </div>
  );
};

export default function MaintenanceForecast() {
  const [data, setData] = useState<MaintenanceForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [configOpen, setConfigOpen] = useState(false);

  /* ── configurable thresholds ───────────────────────────────────────── */
  const [localConfig, setLocalConfig] = useState({ km_to_warning: 500, km_to_maintenance: 1000, days_ahead: 30 });
  const [query, setQuery] = useState<MaintenanceForecastQuery>({
    date: dayjs().format("YYYY-MM-DD"),
    days_ahead: 30,
    risk_level: "all",
    km_to_warning: 500,
    km_to_maintenance: 1000,
  });

  const applyConfig = () => {
    setQuery(prev => ({ ...prev, ...localConfig }));
    setConfigOpen(false);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportApi.getMaintenanceForecast(query);
      setData(res.data as unknown as MaintenanceForecastResponse);
    } catch (e) {
      console.error("Failed to load maintenance forecast", e);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = () => {
    if (!data) return;
    exportToExcel(data.items.map((v, i) => ({ "#": i + 1, "Xe": v.vehicle_name, "Biển số": v.vehicle_license_plate, "Km đã đi": v.distance_since_last_maintenance_km, "Km còn lại": v.km_until_due, "Mức rủi ro": v.risk_level === "critical" ? "Khẩn cấp" : v.risk_level === "warning" ? "Cảnh báo" : "An toàn", "Bảo trì cuối": v.last_maintenance_at, "Dự kiến (ngày)": v.projected_window_days, "Ghi chú": v.note })), `bao-tri-du-bao_${query.date}`, "Dự báo bảo trì");
  };

  const filtered = useMemo(() =>
    (data?.items ?? [])
      .filter(item => riskFilter === "all" || item.risk_level === riskFilter)
      .filter(item =>
        searchText === "" ||
        item.vehicle_name.toLowerCase().includes(searchText.toLowerCase()) ||
        item.vehicle_license_plate.toLowerCase().includes(searchText.toLowerCase())
      ),
  [data, riskFilter, searchText]);

  /* ── analytics ──────────────────────────────────────────────────────── */
  const counts = useMemo(() => (data?.items ?? []).reduce((acc, item) => {
    acc[item.risk_level] = (acc[item.risk_level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [data]);

  const piData = useMemo(() => [
    { name: "Khẩn cấp", value: counts.critical ?? 0, color: "#ef4444" },
    { name: "Cảnh báo", value: counts.warning ?? 0, color: "#f59e0b" },
    { name: "An toàn", value: counts.normal ?? 0, color: "#10b981" },
  ].filter(d => d.value > 0), [counts]);

  /* top 5 most urgent */
  const urgentVehicles = useMemo(() =>
    [...(data?.items ?? [])].sort((a, b) => a.km_until_due - b.km_until_due).slice(0, 5),
  [data]);

  const columns = [
    {
      title: "Phương tiện",
      key: "vehicle",
      render: (_: any, r: MaintenanceForecastItem) => (
        <Space size="middle">
          <div style={{ width: 40, height: 40, borderRadius: 12, background: RISK_CONFIG[r.risk_level]?.bg ?? "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wrench size={18} style={{ color: RISK_CONFIG[r.risk_level]?.color }} />
          </div>
          <div>
            <Text strong className="block text-gray-800">{r.vehicle_name}</Text>
            <Text type="secondary" className="text-xs font-mono">{r.vehicle_license_plate}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Tiến độ bảo trì",
      key: "progress",
      width: 260,
      render: (_: any, r: MaintenanceForecastItem) => {
        const pct = Math.min(Math.round(r.distance_since_last_maintenance_km / r.estimated_due_km * 100), 100);
        return (
          <div>
            <div className="flex justify-between mb-1">
              <Text type="secondary" className="text-xs">{r.distance_since_last_maintenance_km.toLocaleString("vi-VN")} km đã đi</Text>
              <Text strong className="text-xs">{r.km_until_due.toLocaleString("vi-VN")} km còn lại</Text>
            </div>
            <Progress percent={pct} strokeColor={RISK_CONFIG[r.risk_level]?.color} showInfo={false} strokeWidth={8} className="m-0" trailColor="#f1f5f9" />
          </div>
        );
      },
    },
    {
      title: "Rủi ro",
      dataIndex: "risk_level",
      key: "risk",
      width: 130,
      render: (level: string) => {
        const cfg = RISK_CONFIG[level] ?? RISK_CONFIG.normal;
        return <Tag color={cfg.tagColor} className="px-3 py-0.5 rounded-full border-0 font-semibold inline-flex items-center gap-1">{cfg.icon} {cfg.text}</Tag>;
      },
    },
    {
      title: "Bảo trì cuối",
      dataIndex: "last_maintenance_at",
      key: "last",
      width: 130,
      render: (v: string) => <span className="text-gray-500 text-sm">{dayjs(v).format("DD/MM/YYYY")}</span>,
    },
    {
      title: "Dự kiến (ngày)",
      dataIndex: "projected_window_days",
      key: "window",
      width: 110,
      align: "center" as const,
      render: (v: number) => <Tag className="rounded-full px-2.5 border-0 font-semibold" color={v <= 7 ? "red" : v <= 14 ? "gold" : "blue"}>{v} ngày</Tag>,
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      ellipsis: true,
      render: (text: string) => <Tooltip title={text}><Text className="text-gray-500 text-sm italic">{text}</Text></Tooltip>,
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="border-0 shadow-lg rounded-2xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 70% 50%, rgba(245,158,11,0.12), transparent 60%)" }} />
          <Row justify="space-between" align="middle" gutter={[16, 16]} className="relative z-10">
            <Col>
              <Space direction="vertical" size={0}>
                <Text style={{ color: "rgba(251,191,36,0.9)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Quản lý vòng đời xe</Text>
                <Title level={3} style={{ margin: "4px 0 0", color: "#fff", fontWeight: 800 }}>Dự báo & Lập kế hoạch Bảo trì</Title>
                <Text style={{ color: "#94a3b8", fontSize: 13, marginTop: 2 }}>
                  Ngưỡng: {query.km_to_warning?.toLocaleString("vi-VN")} km (cảnh báo) / {query.km_to_maintenance?.toLocaleString("vi-VN")} km (bảo trì) — {query.days_ahead} ngày tới
                </Text>
              </Space>
            </Col>
            <Col>
              <Space size="middle" wrap>
                <DatePicker value={dayjs(query.date)} onChange={(d) => d && setQuery(prev => ({ ...prev, date: d.format("YYYY-MM-DD") }))} className="rounded-xl" />
                <Button icon={<Settings2 size={16} />} onClick={() => { setLocalConfig({ km_to_warning: query.km_to_warning ?? 500, km_to_maintenance: query.km_to_maintenance ?? 1000, days_ahead: query.days_ahead ?? 30 }); setConfigOpen(true); }} style={{ height: 40, borderRadius: 12, fontWeight: 600 }}>Cấu hình</Button>
                <Button icon={<Download size={16} />} type="primary" onClick={handleExport} disabled={!data} style={{ background: "#d97706", border: 0, height: 40, padding: "0 24px", borderRadius: 12, fontWeight: 700 }}>Xuất Excel</Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </motion.div>

      {/* ── summary cards ──────────────────────────────────────────────── */}
      <Row gutter={[12, 12]}>
        {[
          { label: "Tổng xe quét", value: data?.total ?? 0, bg: "#eff6ff", iconColor: "#3b82f6", icon: <Gauge size={22} /> },
          { label: "An toàn", value: counts.normal ?? 0, bg: "#ecfdf5", iconColor: "#10b981", icon: <ShieldCheck size={22} /> },
          { label: "Sắp đến hạn", value: counts.warning ?? 0, bg: "#fffbeb", iconColor: "#d97706", icon: <Info size={22} /> },
          { label: "Cần xử lý ngay", value: counts.critical ?? 0, bg: "#fef2f2", iconColor: "#ef4444", icon: <AlertTriangle size={22} /> },
        ].map((s, i) => (
          <Col xs={12} sm={12} lg={6} key={i}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-0 shadow-sm rounded-2xl hover:shadow-md transition-all" bodyStyle={{ padding: 20 }}>
                <div className="flex items-start justify-between">
                  <div>
                    <Text type="secondary" className="text-[11px] font-bold uppercase tracking-widest block mb-1">{s.label}</Text>
                    <Title level={3} className="m-0">{s.value}</Title>
                  </div>
                  <div style={{ background: s.bg, width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: s.iconColor }}>{s.icon}</div>
                </div>
              </Card>
            </motion.div>
          </Col>
        ))}
      </Row>

      {/* ── charts row ─────────────────────────────────────────────────── */}
      <Row gutter={[16, 16]}>
        {/* risk pie */}
        <Col xs={24} lg={8}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: 20 }}>
              <Title level={5} className="m-0 mb-3 font-bold">Phân bố mức rủi ro</Title>
              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={piData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                      {piData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-2">
                {piData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-sm">
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                    <Text type="secondary">{d.name}: <Text strong>{d.value}</Text></Text>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </Col>

        {/* most urgent */}
        <Col xs={24} lg={16}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-0 shadow-sm rounded-2xl h-full" bodyStyle={{ padding: 0 }}>
              <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
                <div style={{ background: "#fef2f2", width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CalendarClock size={16} className="text-red-500" />
                </div>
                <div>
                  <Title level={5} className="m-0">Xe cần bảo trì sớm nhất</Title>
                  <Text type="secondary" className="text-xs">Sắp xếp theo km còn lại tăng dần</Text>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {urgentVehicles.map((v, i) => {
                  const pct = Math.min(Math.round(v.distance_since_last_maintenance_km / v.estimated_due_km * 100), 100);
                  return (
                    <div key={v.vehicle_id} className="flex items-center gap-4">
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: RISK_CONFIG[v.risk_level]?.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: RISK_CONFIG[v.risk_level]?.color }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between">
                          <Text strong className="text-sm">{v.vehicle_name} <Text type="secondary" className="text-xs font-mono">({v.vehicle_license_plate})</Text></Text>
                          <Tag color={RISK_CONFIG[v.risk_level]?.tagColor} className="rounded-full px-2 border-0 text-xs font-semibold">{v.km_until_due.toLocaleString("vi-VN")} km</Tag>
                        </div>
                        <Progress percent={pct} strokeColor={RISK_CONFIG[v.risk_level]?.color} showInfo={false} strokeWidth={6} className="m-0 mt-1" trailColor="#f1f5f9" />
                      </div>
                    </div>
                  );
                })}
                {urgentVehicles.length === 0 && <Empty description="Tất cả xe trong trạng thái an toàn" />}
              </div>
            </Card>
          </motion.div>
        </Col>
      </Row>

      {/* ── main table ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden" bodyStyle={{ padding: 0 }}>
          <div className="px-6 py-4 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <Title level={5} className="m-0 font-bold">Danh sách xe theo tiến độ bảo trì</Title>
              <Text type="secondary" className="text-sm">Định mức: {data?.thresholds?.km_to_maintenance?.toLocaleString("vi-VN") ?? "1.000"} km/lần bảo trì</Text>
            </div>
            <Space>
              <Input prefix={<Search size={14} className="text-gray-400" />} placeholder="Tìm xe..." className="w-56 rounded-lg" value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear />
              <Select value={riskFilter} onChange={setRiskFilter} className="min-w-[140px]" options={[
                { label: "Tất cả", value: "all" },
                { label: "Khẩn cấp", value: "critical" },
                { label: "Cảnh báo", value: "warning" },
                { label: "An toàn", value: "normal" },
              ]} />
            </Space>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-24"><Spin size="large" /></div>
          ) : filtered.length === 0 ? (
            <Empty className="py-16" description="Không có dữ liệu" />
          ) : (
            <Table columns={columns} dataSource={filtered.map(v => ({ ...v, key: v.vehicle_id }))} pagination={{ pageSize: 10, showSizeChanger: false }} className="custom-pro-table" />
          )}
        </Card>
      </motion.div>

      {/* ── config drawer ──────────────────────────────────────────────── */}
      <Drawer title={<Space><Settings2 size={20} className="text-amber-500" /><span className="font-bold">Cấu hình ngưỡng bảo trì</span></Space>} placement="right" onClose={() => setConfigOpen(false)} open={configOpen} width={400}
        footer={<div className="flex justify-end gap-3"><Button onClick={() => setConfigOpen(false)}>Hủy</Button><Button type="primary" onClick={applyConfig} style={{ background: "#d97706", border: 0 }}>Áp dụng</Button></div>}
      >
        <div className="space-y-6">
          <div>
            <Text strong className="block mb-2">Ngưỡng cảnh báo (km)</Text>
            <Text type="secondary" className="text-xs block mb-2">Xe đã đi hơn số km này kể từ lần bảo trì cuối sẽ được đánh dấu "Cảnh báo"</Text>
            <InputNumber value={localConfig.km_to_warning} onChange={(v) => setLocalConfig(prev => ({ ...prev, km_to_warning: v ?? 500 }))} className="w-full" min={100} step={100} addonAfter="km" />
          </div>
          <Divider />
          <div>
            <Text strong className="block mb-2">Ngưỡng bảo trì (km)</Text>
            <Text type="secondary" className="text-xs block mb-2">Xe đã đi hơn số km này sẽ được đánh dấu "Khẩn cấp" — cần bảo trì ngay</Text>
            <InputNumber value={localConfig.km_to_maintenance} onChange={(v) => setLocalConfig(prev => ({ ...prev, km_to_maintenance: v ?? 1000 }))} className="w-full" min={200} step={100} addonAfter="km" />
          </div>
          <Divider />
          <div>
            <Text strong className="block mb-2">Số ngày dự báo</Text>
            <Text type="secondary" className="text-xs block mb-2">Khoảng thời gian nhìn tới để dự báo xe nào sắp đến hạn bảo trì</Text>
            <InputNumber value={localConfig.days_ahead} onChange={(v) => setLocalConfig(prev => ({ ...prev, days_ahead: v ?? 30 }))} className="w-full" min={7} max={90} addonAfter="ngày" />
          </div>
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 mt-6">
            <Text strong className="text-amber-800 text-sm block mb-1">💡 Lưu ý</Text>
            <Text className="text-amber-700 text-xs">Thay đổi ngưỡng sẽ gọi lại API với tham số mới. Hệ thống sẽ tính toán lại mức rủi ro cho tất cả xe dựa trên cấu hình mới.</Text>
          </div>
        </div>
      </Drawer>

      <style jsx global>{`
        .custom-pro-table .ant-table-thead > tr > th {
          background: transparent !important;
          font-weight: 600; color: #94a3b8; font-size: 12px;
          text-transform: uppercase; letter-spacing: 0.04em;
          border-bottom: 1px solid #f1f5f9 !important;
        }
        .custom-pro-table .ant-table-tbody > tr > td { border-bottom: 1px solid #f8fafc !important; }
        .custom-pro-table .ant-table-tbody > tr:hover > td { background: #f8fafc !important; }
      `}</style>
    </div>
  );
}
