"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Table, Tag, Spin, Empty, Switch, Tooltip, Badge, DatePicker, Select, Drawer } from "antd";
import dayjs from "dayjs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import type { ColumnsType } from "antd/es/table";
import {
  AlertTriangle,
  Car,
  Clock,
  Droplets,
  Eye,
  Fuel,
  Power,
  RefreshCw,
  Settings2,
  Shield,
  Signal,
  SignalZero,
  Zap,
  BarChart2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import parkingIdleEngineApi from "@/services/parking-idle-engine.service";
import type {
  ParkingIdleEngineAlert,
  ParkingIdleEngineAlertsResponse,
  ParkingIdleEngineSettings,
  ParkingIdleEngineHistoryResponse,
  ParkingIdleEngineHistoryItem,
} from "@/types/parking-idle-engine";
import { usePermissions } from "@/hooks/use-permissions";
import { useSocket } from "@/context/socket-context";
import { SIDEBAR } from "@/constants/route";
import { PERMISSIONS } from "@/constants/permissions";
import { NOTIFICATION_EVENTS } from "@/constants/notification";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select as UISelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Zod schema ────────────────────────────────────────────────────────────
const settingsSchema = z.object({
  enabled: z.boolean(),
  warning_after_minutes: z
    .number({ message: "Vui lòng nhập số" })
    .min(1, "Tối thiểu 1 phút"),
  min_confidence: z.enum(["high", "medium", "low"]),
  notification_ttl_seconds: z
    .number({ message: "Vui lòng nhập số" })
    .min(60, "Tối thiểu 60 giây"),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtNum = (n: number | null | undefined, d = 1) =>
  (n ?? 0).toLocaleString("vi-VN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

const confidenceColors: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Cao" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", label: "TB" },
  low: { bg: "bg-red-50", text: "text-red-700", label: "Thấp" },
};

const sourceLabels: Record<string, string> = {
  acc: "ACC",
  ignition: "Ignition",
  engine_status: "Engine Status",
  status_speed_fallback: "Dự phòng (speed)",
};

// ─── Live Timer Component ───────────────────────────────────────────────────
function LiveElapsedTimer({
  idleStartedAt,
  fallbackMinutes,
  isWarning,
}: {
  idleStartedAt: string | null;
  fallbackMinutes: number;
  isWarning: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate elapsed from idle_started_at if available, else fallback
  let totalSeconds: number;
  if (idleStartedAt) {
    const start = new Date(idleStartedAt).getTime();
    totalSeconds = Math.max(0, Math.floor((now - start) / 1000));
  } else {
    totalSeconds = Math.round(fallbackMinutes * 60);
  }

  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  const display = hours > 0
    ? `${hours}:${pad(mins)}:${pad(secs)}`
    : `${pad(mins)}:${pad(secs)}`;

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Clock
        size={14}
        className={isWarning ? "text-red-500" : "text-slate-400"}
      />
      <span
        className={`font-black text-sm tabular-nums tracking-tight ${
          isWarning ? "text-red-500" : "text-slate-500"
        }`}
      >
        {display}
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function ParkingIdleEngineDashboard() {
  const [data, setData] = useState<ParkingIdleEngineAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [warningOnly, setWarningOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  
  // Vehicle Detail Drawer State
  const [selectedVehicle, setSelectedVehicle] = useState<ParkingIdleEngineAlert | null>(null);
  const [historyData, setHistoryData] = useState<ParkingIdleEngineHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit] = useState(10);
  const [historyDateRange, setHistoryDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([dayjs().startOf('day'), dayjs().endOf('day')]);

  const [searchQuery, setSearchQuery] = useState("");

  const { hasActionAccess } = usePermissions();
  const canSettings = hasActionAccess(
    SIDEBAR.PARKING_IDLE_ENGINE,
    PERMISSIONS.PARKING_IDLE_ENGINE.SETTINGS
  );

  const { onSocketEvent } = useSocket();

  // ─── Form ──────────────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      enabled: true,
      warning_after_minutes: 10,
      min_confidence: "high",
      notification_ttl_seconds: 300,
    },
  });

  // ─── Fetch alerts ──────────────────────────────────────────────────────
  const fetchAlerts = useCallback(() => {
    setLoading(true);
    parkingIdleEngineApi
      .getAlerts({ warning_only: warningOnly ? 1 : 0 })
      .then((res) => setData(res.data))
      .catch((err) => {
        console.error("Failed to fetch parking idle engine alerts", err);
        toast.error("Không thể tải dữ liệu giám sát nổ máy");
      })
      .finally(() => setLoading(false));
  }, [warningOnly]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAlerts();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  useEffect(() => {
    const unsub = onSocketEvent((eventName: string, ...args: unknown[]) => {
      if (eventName === "notification:refresh" || eventName === "notification:new") {
        const payload = args[0];
        const items = Array.isArray(payload) ? payload : [payload];
        const hasRelevant = items.some(
          (n: any) =>
            n?.event === NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING ||
            n?.event === NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING_RESOLVED
        );
        if (hasRelevant) {
          fetchAlerts();
        }
      }
    });
    return unsub;
  }, [fetchAlerts, onSocketEvent]);

  // ─── Fetch history ─────────────────────────────────────────────────────
  const fetchHistory = useCallback(() => {
    if (!selectedVehicle) return;
    setHistoryLoading(true);
    const params: any = {
      vehicle_id: selectedVehicle.vehicle_id,
      page: historyPage,
      limit: historyLimit,
    };
    if (historyDateRange[0]) params.from = historyDateRange[0].toISOString();
    if (historyDateRange[1]) params.to = historyDateRange[1].toISOString();

    parkingIdleEngineApi
      .getHistory(params)
      .then((res) => setHistoryData(res.data))
      .catch((err) => {
        console.error("Failed to fetch parking idle engine history", err);
        toast.error("Không thể tải lịch sử nổ máy");
      })
      .finally(() => setHistoryLoading(false));
  }, [selectedVehicle, historyPage, historyLimit, historyDateRange]);

  useEffect(() => {
    if (selectedVehicle) {
      fetchHistory();
    }
  }, [selectedVehicle, fetchHistory]);

  // ─── Open settings dialog ──────────────────────────────────────────────
  const openSettings = async () => {
    setSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const res = await parkingIdleEngineApi.getSettings();
      if (res.data?.multi_data) {
        reset(res.data.multi_data);
      }
    } catch (err) {
      console.error("Failed to fetch settings", err);
      toast.error("Không thể tải cấu hình");
    } finally {
      setSettingsLoading(false);
    }
  };

  const onSaveSettings = async (values: SettingsFormValues) => {
    setSettingsSaving(true);
    try {
      await parkingIdleEngineApi.updateSettings(values);
      toast.success("Đã cập nhật cấu hình cảnh báo");
      setSettingsOpen(false);
      fetchAlerts();
    } catch (err) {
      console.error("Failed to save settings", err);
      toast.error("Không thể lưu cấu hình");
    } finally {
      setSettingsSaving(false);
    }
  };

  // ─── KPI data ──────────────────────────────────────────────────────────
  const kpis = useMemo(
    () => [
      {
        label: "XE TRONG BÃI",
        value: data?.total ?? 0,
        subtitle: "Tổng số xe",
        icon: <Car size={24} />,
        color: "#3b82f6",
        bg: "#eff6ff",
      },
      {
        label: "ĐANG NỔ MÁY",
        value: data?.engine_on_count ?? 0,
        subtitle: "Xe",
        icon: <Power size={24} />,
        color: "#f59e0b",
        bg: "#fffbeb",
      },
      {
        label: "ĐANG CẢNH BÁO",
        value: data?.warning_count ?? 0,
        subtitle: "Xe",
        icon: <AlertTriangle size={24} />,
        color: "#ef4444",
        bg: "#fef2f2",
      },
    ],
    [data]
  );

  const filteredAndSortedItems = useMemo(() => {
    if (!data?.items) return [];
    let items = [...data.items];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => 
        (i.vehicle_name && i.vehicle_name.toLowerCase().includes(q)) || 
        (i.vehicle_license_plate && i.vehicle_license_plate.toLowerCase().includes(q))
      );
    }

    items.sort((a, b) => {
      // 1. Engine ON > Engine OFF
      if (a.engine_state === "on" && b.engine_state !== "on") return -1;
      if (a.engine_state !== "on" && b.engine_state === "on") return 1;
      
      // 2. Sort by elapsed minutes (descending)
      return (b.elapsed_minutes || 0) - (a.elapsed_minutes || 0);
    });

    return items;
  }, [data?.items, searchQuery]);

  // ─── Table columns ────────────────────────────────────────────────────
  const columns: ColumnsType<ParkingIdleEngineAlert> = [
    {
      title: "Xe / Biển số",
      key: "vehicle",
      width: 200,
      render: (_, r) => (
        <div className="flex items-center gap-4 pl-2">
          <div className="w-10 h-10 rounded-full bg-indigo-50/50 flex items-center justify-center text-indigo-500 border border-indigo-100/50">
            <Car size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-[13px] text-slate-800">{r.vehicle_name}</span>
            <span className="text-[11px] font-medium text-slate-500 mt-0.5">{r.vehicle_license_plate}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Trạng thái máy",
      key: "engine_state",
      width: 140,
      align: "left",
      render: (_, r) => (
        <div className="flex items-center justify-start">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold ${
            r.engine_state === "on" ? "bg-orange-50 text-orange-500" : "bg-slate-50 text-slate-400"
          }`}>
            <Zap size={12} className={r.engine_state === "on" ? "fill-orange-500" : ""} />
            {r.engine_state === "on" ? "Đang nổ máy" : "Tắt máy"}
          </span>
        </div>
      ),
    },
    {
      title: "Thời gian nổ máy",
      key: "elapsed",
      width: 160,
      align: "left",
      render: (_, r) => (
        <div className="flex items-center justify-start">
          <LiveElapsedTimer
            idleStartedAt={r.idle_started_at}
            fallbackMinutes={r.elapsed_minutes}
            isWarning={r.warning_active}
          />
        </div>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 140,
      align: "left",
      render: (_, r) => (
        <div className="flex items-center justify-start">
          {r.warning_active ? (
            <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-500 rounded-md font-bold px-2.5 py-1 text-[11px] uppercase tracking-wide">
              <AlertTriangle size={12} />
              CẢNH BÁO
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-400 rounded-md font-bold px-2.5 py-1 text-[11px] uppercase tracking-wide">
              <Eye size={12} />
              Theo dõi
            </span>
          )}
        </div>
      ),
    },
  ];

  const historyColumns: ColumnsType<ParkingIdleEngineHistoryItem> = [
    {
      title: "Bắt đầu",
      dataIndex: "idle_started_at",
      render: (v) => <span className="font-bold">{v ? dayjs(v).format("HH:mm - DD/MM") : "—"}</span>,
    },
    {
      title: "Kết thúc",
      dataIndex: "idle_ended_at",
      render: (v) => <span className="font-bold">{v ? dayjs(v).format("HH:mm - DD/MM") : "—"}</span>,
    },
    {
      title: "Tổng phút",
      dataIndex: "elapsed_minutes",
      render: (v) => <span className="font-black text-indigo-600">{Math.round(v)}p</span>,
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Giám sát nổ máy trong bãi
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 rounded-full px-3 py-1.5 border border-slate-200/60">
            <span className="text-[11px] font-bold text-slate-500">Chỉ cảnh báo</span>
            <Switch size="small" checked={warningOnly} onChange={setWarningOnly} />
          </div>
          <Button variant="outline" size="sm" className="rounded-full h-8 px-4 text-xs font-bold text-slate-600 bg-white" onClick={fetchAlerts} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Làm mới
          </Button>
          {canSettings && (
            <Button size="sm" onClick={openSettings} className="rounded-full h-8 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700">
              <Settings2 size={13} />
              Cấu hình
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-[20px] border border-slate-100/60 shadow-sm px-6 py-5 flex flex-col justify-center gap-3 relative overflow-hidden">
            <div className="flex items-center flex-col justify-center absolute left-6 top-1/2 -translate-y-1/2">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: k.bg, color: k.color }}>{k.icon}</div>
            </div>
            <div className="flex flex-col ml-16 pl-4 border-l border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{k.label}</div>
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-black tabular-nums tracking-tighter leading-none" style={{ color: k.color }}>{k.value}</div>
                <div className="text-[11px] font-bold text-slate-400">{k.subtitle}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ TABLE DATA ═══ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-2 mt-2">
        <div className="px-4 py-3 flex items-center justify-between mb-2 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Fuel size={16} />
            </div>
            <div className="flex flex-col">
              <h2 className="text-[13px] font-bold text-slate-800 m-0">
                Danh sách xe đang trong bãi
              </h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {filteredAndSortedItems.length} XE · CLICK ĐỂ XEM LỊCH SỬ NỔ MÁY
              </span>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <Input 
              placeholder="Tìm kiếm xe..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-9 w-64 text-xs rounded-full bg-slate-50 border-slate-200"
            />
          </div>
        </div>
        {loading && !data ? (
          <div className="flex justify-center py-20">
            <Spin size="large" />
          </div>
        ) : !filteredAndSortedItems.length ? (
          <Empty
            description={searchQuery ? "Không tìm thấy xe phù hợp" : "Không có xe trong bãi"}
            className="py-16"
          />
        ) : (
          <Table<ParkingIdleEngineAlert>
            dataSource={filteredAndSortedItems}
            columns={columns}
            rowKey="vehicle_id"
            loading={loading}
            pagination={false}
            size="middle"
            className="custom-table cursor-pointer"
            onRow={(record) => ({
              onClick: () => setSelectedVehicle(record),
            })}
            rowClassName={() => "hover:!bg-indigo-50/30 transition-colors"}
          />
        )}
      </div>

      {/* ═══ VEHICLE DETAIL DRAWER ═══ */}
      <Drawer
        title={
          <div className="flex flex-col">
            <span className="text-base font-black text-slate-800">
              Chi tiết nổ máy
            </span>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {selectedVehicle?.vehicle_name} - {selectedVehicle?.vehicle_license_plate}
            </span>
          </div>
        }
        placement="right"
        width={700}
        onClose={() => setSelectedVehicle(null)}
        open={!!selectedVehicle}
        destroyOnClose
      >
        <div className="flex flex-col gap-6">
          {/* Chart Section */}
          <div className="border border-slate-100 rounded-xl p-5 bg-white shadow-sm">
            <h3 className="text-xs font-bold text-slate-800 mb-4 flex items-center gap-2">
              <BarChart2 size={16} className="text-indigo-500" />
              Biểu đồ thời gian nổ máy theo phiên
            </h3>
            {historyLoading && !historyData ? (
              <div className="h-[200px] flex items-center justify-center">
                <Spin />
              </div>
            ) : !historyData?.items?.length ? (
              <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">
                Không có dữ liệu
              </div>
            ) : (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyData.items.slice().reverse()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="idle_started_at" 
                      tickFormatter={(v) => dayjs(v).format("DD/MM")} 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 10 }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload as ParkingIdleEngineHistoryItem;
                          return (
                            <div className="bg-white border border-slate-100 shadow-lg rounded-lg p-3 flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-slate-400">THỜI GIAN NỔ MÁY</span>
                              <span className="text-lg font-black text-indigo-600">
                                {Math.round(data.elapsed_minutes)} phút
                              </span>
                              <span className="text-xs font-medium text-slate-600 mt-1">
                                {dayjs(data.idle_started_at).format("HH:mm DD/MM/YY")}
                              </span>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="elapsed_minutes" fill="#818cf8" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Filters & Table Section */}
          <div className="border border-slate-100 rounded-xl p-5 bg-white shadow-sm flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 m-0">
                <Clock size={16} className="text-indigo-500" />
                Lịch sử các phiên nổ máy
              </h3>
              <div className="flex items-center gap-2">
                <DatePicker.RangePicker
                  value={historyDateRange}
                  onChange={(dates) => setHistoryDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
                  className="rounded-lg border-slate-200 h-8 text-[11px]"
                  style={{ width: 220 }}
                />
              </div>
            </div>
            
            <Table<ParkingIdleEngineHistoryItem>
              dataSource={historyData?.items ?? []}
              columns={historyColumns}
              rowKey={(r) => `${r.vehicle_id}_${r.idle_started_at}`}
              loading={historyLoading}
              pagination={{
                current: historyPage,
                pageSize: historyLimit,
                total: historyData?.total ?? 0,
                onChange: (page) => setHistoryPage(page),
                size: "small",
              }}
              size="small"
              className="custom-table"
            />
          </div>
        </div>
      </Drawer>

      {/* ═══ SETTINGS DIALOG ═══ */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                <Settings2 size={20} />
              </div>
              <div>
                <DialogTitle className="text-lg font-black">
                  Cấu hình cảnh báo nổ máy
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  Thiết lập ngưỡng cảnh báo xe nổ máy trong bãi
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {settingsLoading ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
              <span className="text-sm text-slate-500">Đang tải…</span>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSaveSettings)}
              className="space-y-6 mt-4"
            >
              {/* Toggle */}
              <div className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Shield size={16} className="text-indigo-500" />
                  <div>
                    <Label className="font-bold text-slate-700">
                      Bật cảnh báo
                    </Label>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Bật/tắt toàn bộ chức năng cảnh báo nổ máy
                    </p>
                  </div>
                </div>
                <Switch
                  checked={watch("enabled")}
                  onChange={(checked) => setValue("enabled", checked)}
                />
              </div>

              {/* Warning after minutes */}
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-500" />
                  <Label className="font-bold text-slate-700">
                    Nổ máy bao nhiêu phút thì cảnh báo
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    className={`h-10 pr-14 font-bold ${errors.warning_after_minutes ? "border-red-400" : ""}`}
                    {...register("warning_after_minutes", {
                      valueAsNumber: true,
                    })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    phút
                  </span>
                </div>
                {errors.warning_after_minutes && (
                  <p className="text-[11px] text-red-500 font-medium">
                    {errors.warning_after_minutes.message}
                  </p>
                )}
              </div>

              {/* Min confidence */}
              <div className="hidden">
                <div className="flex items-center gap-2">
                  <Signal size={14} className="text-emerald-500" />
                  <Label className="font-bold text-slate-700">
                    Độ tin cậy tối thiểu
                  </Label>
                </div>
                <UISelect
                  value={watch("min_confidence")}
                  onValueChange={(v) =>
                    setValue("min_confidence", v as "high" | "medium" | "low")
                  }
                >
                  <SelectTrigger className="h-10 font-bold">
                    <SelectValue placeholder="Chọn độ tin cậy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Cao (High) — chỉ ACC / Ignition
                      </span>
                    </SelectItem>
                    <SelectItem value="medium">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Trung bình (Medium)
                      </span>
                    </SelectItem>
                    <SelectItem value="low">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Thấp (Low) — bao gồm dự phòng
                      </span>
                    </SelectItem>
                  </SelectContent>
                </UISelect>
              </div>

              {/* Notification TTL */}
              <div className="hidden">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-500" />
                  <Label className="font-bold text-slate-700">
                    Thời gian giữ thông báo
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min={60}
                    className={`h-10 pr-14 font-bold ${errors.notification_ttl_seconds ? "border-red-400" : ""}`}
                    {...register("notification_ttl_seconds", {
                      valueAsNumber: true,
                    })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    giây
                  </span>
                </div>
                {errors.notification_ttl_seconds && (
                  <p className="text-[11px] text-red-500 font-medium">
                    {errors.notification_ttl_seconds.message}
                  </p>
                )}
              </div>

              <DialogFooter className="pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSettingsOpen(false)}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={settingsSaving}>
                  {settingsSaving ? (
                    <RefreshCw className="animate-spin" size={14} />
                  ) : null}
                  Lưu cấu hình
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
