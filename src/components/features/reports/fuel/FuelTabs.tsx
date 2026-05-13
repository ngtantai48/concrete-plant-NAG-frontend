"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Table, Tag, Button, Select, DatePicker, Modal, Form, Input, InputNumber, Row, Col, message, Spin, Empty, Typography } from "antd";
import { Plus, Edit, MapPin } from "lucide-react";
import dayjs from "dayjs";
import fuelApi from "@/services/fuel.service";
import vtrackingApi from "@/services/vtracking.service";
import type { VehicleFuelProfile, FuelEvent, OrderFuelMetric, FuelAlert } from "@/types/report";
import type { Vehicle } from "@/types/vehicle";

const { Title, Text } = Typography;
const fmtNum = (n: number | null | undefined) => n ? Math.round(n).toLocaleString("vi-VN") : "0";
const safe = (v: any) => Number(v || 0);

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2: FUEL EVENTS
   ═══════════════════════════════════════════════════════════════════════════ */
export function FuelEventsTab({ from, to, vehicle_id, vehicles }: { from: string; to: string; vehicle_id?: number; vehicles: Vehicle[] }) {
  const [data, setData] = useState<FuelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [odometerLoading, setOdometerLoading] = useState(false);
  const [odometerValue, setOdometerValue] = useState<number | null>(null);
  const [selectedVehicleInfo, setSelectedVehicleInfo] = useState<Vehicle | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fuelApi.getEvents({ from, to, vehicle_id, limit: 100 })
      .then(res => { const p = res.data; setData(Array.isArray(p) ? p : p?.data || []); })
      .catch(console.error).finally(() => setLoading(false));
  }, [from, to, vehicle_id]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-fetch odometer from vtracking when vehicle is selected
  const onVehicleSelect = async (vehicleId: number) => {
    const veh = vehicles.find(v => v.vehicle_id === vehicleId);
    setSelectedVehicleInfo(veh || null);
    setOdometerLoading(true);
    setOdometerValue(null);
    try {
      const res = await vtrackingApi.fetchVehicles();
      const gpsVehicles = res.data?.vehicles || [];
      // Match by vehicle name or license plate
      const match = gpsVehicles.find(g =>
        g.vehicle_name === veh?.vehicle_name ||
        g.license_plate === veh?.vehicle_license_plate
      );
      if (match?.attributes) {
        const odoAttr = match.attributes.find(a => a.attribute_key === "totalOdometer" || a.attribute_key === "odometer");
        if (odoAttr) {
          const km = Number(odoAttr.value) / 1000; // vtracking returns meters
          setOdometerValue(Math.round(km * 10) / 10);
          form.setFieldValue("odometer_km", Math.round(km * 10) / 10);
        }
      }
    } catch (e) { console.error("Không lấy được odometer từ GPS", e); }
    setOdometerLoading(false);
  };

  const handleSave = async (values: any) => {
    try {
      await fuelApi.createEvent({ ...values, event_time: values.event_time.format(), odometer_km: odometerValue || values.odometer_km });
      message.success("Thêm sự kiện thành công");
      setModalOpen(false); form.resetFields(); setOdometerValue(null); setSelectedVehicleInfo(null); fetchData();
    } catch { message.error("Lỗi khi lưu"); }
  };

  const typeMap: Record<string, { color: string; text: string }> = {
    refuel_full: { color: "green", text: "Đổ đầy" },
    refuel_partial: { color: "blue", text: "Đổ thêm" },
    drain: { color: "red", text: "Rút dầu" },
    adjust_plus: { color: "orange", text: "Điều chỉnh (+)" },
    adjust_minus: { color: "magenta", text: "Điều chỉnh (-)" },
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
        <div><Title level={4} className="m-0 font-black text-slate-800">Nhật ký Đổ dầu / Điều chỉnh</Title><Text className="text-slate-400 text-xs font-bold uppercase tracking-widest">Toàn bộ giao dịch nhiên liệu</Text></div>
        <Button type="primary" icon={<Plus size={16}/>} onClick={() => { setModalOpen(true); setOdometerValue(null); setSelectedVehicleInfo(null); }} className="bg-blue-600 border-0 rounded-xl h-10 px-5 font-bold">Thêm giao dịch</Button>
      </div>
      <Table dataSource={data} rowKey="fuel_event_id" loading={loading} className="fuel-table" columns={[
        { title: "Thời gian", dataIndex: "event_time", render: v => <span className="font-bold text-slate-700">{dayjs(v).format("DD/MM/YYYY HH:mm")}</span> },
        { title: "Phương tiện", dataIndex: "vehicle_name", render: (v, r) => (
          <div className="flex items-center gap-2">
            <span className="font-black text-lg text-slate-800">{v}</span>
            <span className="bg-slate-800 text-white font-bold text-xs px-2 py-0.5 rounded tracking-wider">{r.vehicle_license_plate}</span>
          </div>
        )},
        { title: "Loại", dataIndex: "event_type", render: v => { const t = typeMap[v] || { color: "default", text: v }; return <Tag color={t.color} className="border-0 rounded-full font-bold px-3">{t.text}</Tag>; } },
        { title: "Số lít", dataIndex: "liters", align: "right" as const, render: v => <span className={`font-black text-base ${v < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{v > 0 ? '+' : ''}{v} L</span> },
        { title: "Odometer", dataIndex: "odometer_km", align: "right" as const, render: v => v ? <span className="font-bold text-slate-500">{safe(v).toFixed(1)} km</span> : "—" },
        { title: "Ghi chú", dataIndex: "note", render: v => <span className="text-slate-500">{v || "—"}</span> },
      ]} />

      {/* ═══ MODAL THÊM GIAO DỊCH ═══ */}
      <Modal
        title={<div className="pb-2 border-b border-slate-100"><span className="font-black text-xl text-slate-800">Thêm giao dịch nhiên liệu</span></div>}
        open={modalOpen} onCancel={() => { setModalOpen(false); setSelectedVehicleInfo(null); setOdometerValue(null); }}
        onOk={() => form.submit()} okText="Lưu giao dịch" cancelText="Hủy" width={520}
        okButtonProps={{ className: "bg-blue-600 border-0 font-bold h-10 px-6 rounded-xl" }}
        cancelButtonProps={{ className: "font-bold h-10 rounded-xl" }}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} className="mt-4" size="large">
          {/* Chọn xe — hiển thị tên + biển số */}
          <Form.Item name="vehicle_id" label={<span className="font-extrabold text-slate-700">Chọn phương tiện</span>} rules={[{ required: true, message: "Vui lòng chọn xe" }]}>
            <Select
              placeholder="Chọn xe..."
              showSearch
              optionFilterProp="label"
              onChange={onVehicleSelect}
              options={vehicles.map(v => ({ label: `${v.vehicle_name} — ${v.vehicle_license_plate}`, value: v.vehicle_id }))}
              optionRender={(option) => {
                const veh = vehicles.find(v => v.vehicle_id === option.value);
                return (
                  <div className="flex items-center gap-3 py-1">
                    <span className="font-black text-base text-slate-800">{veh?.vehicle_name}</span>
                    <span className="bg-slate-800 text-white font-bold text-xs px-2 py-0.5 rounded">{veh?.vehicle_license_plate}</span>
                  </div>
                );
              }}
            />
          </Form.Item>

          {/* Hiển thị xe đã chọn + odometer tự động */}
          {selectedVehicleInfo && (
            <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-black text-lg text-slate-800">{selectedVehicleInfo.vehicle_name}</span>
                <span className="bg-slate-800 text-white font-black text-sm px-3 py-0.5 rounded tracking-wider">{selectedVehicleInfo.vehicle_license_plate}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={14} className="text-blue-500" />
                <span className="font-bold text-slate-500">Odometer (GPS):</span>
                {odometerLoading ? <Spin size="small" /> : (
                  <span className="font-black text-blue-600">{odometerValue ? `${odometerValue.toFixed(1)} km` : "Không có dữ liệu"}</span>
                )}
              </div>
            </div>
          )}

          <Form.Item name="event_type" label={<span className="font-extrabold text-slate-700">Loại giao dịch</span>} rules={[{ required: true, message: "Chọn loại" }]}>
            <Select options={[
              { label: "🟢 Đổ đầy bình", value: "refuel_full" },
              { label: "🔵 Đổ thêm", value: "refuel_partial" },
              { label: "🔴 Rút dầu", value: "drain" },
              { label: "🟠 Điều chỉnh tăng (+)", value: "adjust_plus" },
              { label: "🟣 Điều chỉnh giảm (−)", value: "adjust_minus" },
            ]} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="liters" label={<span className="font-extrabold text-slate-700">Số lít</span>} rules={[{ required: true, message: "Nhập số lít" }]}>
                <InputNumber className="w-full" addonAfter="L" min={0} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="event_time" label={<span className="font-extrabold text-slate-700">Thời gian đổ</span>} rules={[{ required: true, message: "Chọn thời gian" }]}>
                <DatePicker showTime className="w-full" format="DD/MM/YYYY HH:mm" />
              </Form.Item>
            </Col>
          </Row>

          {/* Odometer hidden field - auto populated */}
          <Form.Item name="odometer_km" hidden><InputNumber /></Form.Item>

          <Form.Item name="note" label={<span className="font-extrabold text-slate-700">Ghi chú</span>}>
            <Input.TextArea rows={2} placeholder="VD: Đổ dầu tại trạm ABC, tài xế Nguyễn Văn A..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3: ORDER METRICS
   ═══════════════════════════════════════════════════════════════════════════ */
export function FuelMetricsTab({ from, to, vehicle_id }: { from: string; to: string; vehicle_id?: number }) {
  const [data, setData] = useState<OrderFuelMetric[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fuelApi.getOrderMetrics({ from, to, vehicle_id, limit: 100 })
      .then(res => { const p = res.data; setData(Array.isArray(p) ? p : p?.data || []); })
      .catch(console.error).finally(() => setLoading(false));
  }, [from, to, vehicle_id]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100">
        <Title level={4} className="m-0 font-black text-slate-800">Tiêu hao theo chuyến (Nội suy GPS)</Title>
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest">drive_fuel + idle_fuel = total_fuel</Text>
      </div>
      <Table dataSource={data} rowKey="order_fuel_metric_id" loading={loading} className="fuel-table" columns={[
        { title: "Chuyến", dataIndex: "order_id", render: v => <span className="font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">#{v}</span> },
        { title: "Xe", dataIndex: "vehicle_name", render: v => <span className="font-extrabold text-slate-800">{v}</span> },
        { title: "Trạm", dataIndex: "station_name", render: v => <span className="font-bold text-slate-600">{v}</span> },
        { title: "Km", dataIndex: "distance_km", align: "right" as const, render: v => <span className="font-black text-slate-700">{safe(v)} km</span> },
        { title: "Dừng", dataIndex: "idle_minutes", align: "right" as const, render: v => <span className="font-bold text-orange-500">{safe(v)} phút</span> },
        { title: "Lít chạy", dataIndex: "drive_fuel_liters", align: "right" as const, render: v => <span className="font-bold text-slate-600">{safe(v).toFixed(1)} L</span> },
        { title: "Lít dừng", dataIndex: "idle_fuel_liters", align: "right" as const, render: v => <span className="font-bold text-slate-600">{safe(v).toFixed(1)} L</span> },
        { title: "Tổng", dataIndex: "total_fuel_liters", align: "right" as const, render: v => <span className="font-black text-emerald-600 text-base">{safe(v).toFixed(1)} L</span> },
      ]} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4: ALERTS
   ═══════════════════════════════════════════════════════════════════════════ */
export function FuelAlertsTab({ from, to, vehicle_id }: { from: string; to: string; vehicle_id?: number }) {
  const [data, setData] = useState<FuelAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch2 = useCallback(() => {
    setLoading(true);
    fuelApi.getAlerts({ from, to, vehicle_id, limit: 100 })
      .then(res => { const p = res.data; setData(Array.isArray(p) ? p : p?.data || []); })
      .catch(console.error).finally(() => setLoading(false));
  }, [from, to, vehicle_id]);
  useEffect(() => { fetch2(); }, [fetch2]);

  const alertTypeLabels: Record<string, string> = { high_consumption: "Tiêu hao cao", suspicious_drop: "Giảm đột ngột", long_idle_consumption: "Nổ máy lâu", missing_refuel_pattern: "Thiếu đổ dầu" };

  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-red-50 bg-red-50/30">
        <Title level={4} className="m-0 font-black text-red-600">⚠ Cảnh báo bất thường</Title>
      </div>
      <Table dataSource={data} rowKey="fuel_alert_id" loading={loading} className="fuel-table" columns={[
        { title: "Thời điểm", dataIndex: "detected_at", render: v => <span className="font-bold text-slate-700">{dayjs(v).format("DD/MM HH:mm")}</span> },
        { title: "Xe", dataIndex: "vehicle_name", render: (v, r) => <span className="font-extrabold text-slate-800">{v}</span> },
        { title: "Loại", dataIndex: "alert_type", render: v => <Tag color="red" className="border-0 font-bold rounded-lg">{alertTypeLabels[v] || v}</Tag> },
        { title: "Mức độ", dataIndex: "severity", align: "center" as const, render: v => <span className={`font-black uppercase text-xs ${v === 'high' ? 'text-red-600' : v === 'medium' ? 'text-orange-500' : 'text-blue-500'}`}>{v}</span> },
        { title: "Chi tiết", dataIndex: "note", render: v => <span className="text-slate-500">{v}</span> },
        { title: "Trạng thái", dataIndex: "status", align: "center" as const, render: v => <Tag color={v === 'open' ? 'error' : v === 'ack' ? 'processing' : 'success'} className="border-0 rounded-full font-bold">{v === 'open' ? 'Chưa xử lý' : v === 'ack' ? 'Đã xem' : 'Đã xử lý'}</Tag> },
        { title: "", key: "act", align: "right" as const, render: (_: any, r: FuelAlert) => r.status === 'open' && <Button size="small" onClick={async () => { await fuelApi.ackAlert(r.fuel_alert_id); message.success("Đã xác nhận"); fetch2(); }} className="bg-slate-900 text-white border-0 font-bold rounded-lg px-4">Xác nhận</Button> },
      ]} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 5: PROFILES
   ═══════════════════════════════════════════════════════════════════════════ */
export function FuelProfilesTab({ vehicle_id }: { vehicle_id?: number }) {
  const [data, setData] = useState<VehicleFuelProfile[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fuelApi.getProfiles({ vehicle_id, limit: 100 })
      .then(res => { const p = res.data; setData(Array.isArray(p) ? p : p?.data || []); })
      .catch(console.error).finally(() => setLoading(false));
  }, [vehicle_id]);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100">
        <Title level={4} className="m-0 font-black text-slate-800">Thiết lập Định mức Phương tiện</Title>
      </div>
      <Table dataSource={data} rowKey="vehicle_fuel_profile_id" loading={loading} className="fuel-table" columns={[
        { title: "Xe", dataIndex: "vehicle_name", render: (v, r) => <span className="font-extrabold text-slate-800">{v} <span className="text-xs text-slate-400 ml-1">{r.vehicle_license_plate}</span></span> },
        { title: "Bình (L)", dataIndex: "tank_capacity_liters", align: "right" as const, render: v => <span className="font-bold">{v || '—'}</span> },
        { title: "Chạy (L/100km)", dataIndex: "default_l_per_100km", align: "right" as const, render: v => <span className="font-black text-blue-600 text-base">{v}</span> },
        { title: "Dừng (L/h)", dataIndex: "idle_l_per_hour", align: "right" as const, render: v => <span className="font-black text-orange-500">{v}</span> },
        { title: "Hệ số tải", dataIndex: "load_factor", align: "right" as const, render: v => <span className="font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded">{v}</span> },
        { title: "", key: "act", align: "right" as const, render: () => <Button type="text" icon={<Edit size={16}/>} className="text-slate-400 hover:text-blue-600" /> },
      ]} />
    </div>
  );
}
