"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Input, Select, Drawer, Form, InputNumber, Spin, Empty, Pagination, message, DatePicker } from "antd";
import { Plus, Edit, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import fuelApi from "@/services/fuel.service";
import type { VehicleFuelProfile } from "@/types/report";

import type { Vehicle } from "@/types/vehicle";

const safe = (v: any) => Number(v || 0);

export default function FuelProfilesTab({ vehicle_id, vehicles }: { vehicle_id?: number; vehicles: Vehicle[] }) {
  const [data, setData] = useState<VehicleFuelProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<VehicleFuelProfile | null>(null);
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const fixedVehicle = useMemo(() => vehicles.find(v => v.vehicle_id === vehicle_id), [vehicles, vehicle_id]);

  const fetchData = useCallback(() => {
    setLoading(true);
    fuelApi.getProfiles({ vehicle_id, limit: 200 })
      .then(res => { const p = res.data; setData(Array.isArray(p) ? p : p?.data || []); })
      .catch(console.error).finally(() => setLoading(false));
  }, [vehicle_id]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const visibleData = useMemo(
    () => (vehicle_id ? data.filter(item => item.vehicle_id === vehicle_id) : data),
    [data, vehicle_id]
  );

  useEffect(() => { setPage(1); }, [visibleData]);

  const paged = visibleData.slice((page - 1) * pageSize, page * pageSize);

  const openDrawer = (item?: VehicleFuelProfile) => {
    setEditItem(item || null);
    if (item) {
      form.setFieldsValue({
        vehicle_id: item.vehicle_id,
        fuel_type: item.fuel_type || "diesel",
        tank_capacity_liters: item.tank_capacity_liters,
        default_l_per_100km: item.default_l_per_100km,
        idle_l_per_hour: item.idle_l_per_hour,
        load_factor: item.load_factor,
        opening_fuel_liters: item.opening_fuel_liters,
        opening_fuel_at: item.opening_fuel_at ? dayjs(item.opening_fuel_at) : undefined,
      });
    } else {
      form.resetFields();
      if (vehicle_id) {
        form.setFieldValue("vehicle_id", vehicle_id);
      }
    }
    setDrawerOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      const targetVehicleId = values.vehicle_id ?? vehicle_id;
      if (!targetVehicleId) {
        message.error("Không xác định được xe để lưu cấu hình");
        return;
      }

      const payload: any = {
        tank_capacity_liters: values.tank_capacity_liters,
        default_l_per_100km: values.default_l_per_100km,
        idle_l_per_hour: values.idle_l_per_hour,
        load_factor: values.load_factor,
        opening_fuel_liters: values.opening_fuel_liters,
      };
      
      if (values.opening_fuel_at) {
        payload.opening_fuel_at = values.opening_fuel_at.toISOString();
      }

      // Upsert profile via vehicle_id
      await fuelApi.updateProfile(targetVehicleId, payload);
      message.success(editItem ? "Cập nhật thành công" : "Thêm cấu hình thành công");
      setDrawerOpen(false); form.resetFields(); setEditItem(null); fetchData();
    } catch { message.error("Lỗi khi lưu"); }
  };

  if (loading) return <div className="flex justify-center py-24"><Spin size="large" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* ═══ HEADER ═══ */}
        <div className="px-6 py-5 flex flex-wrap justify-between items-start gap-4">
          <div>
            <h3 className="font-black text-lg text-slate-800 m-0">Thiết lập Định mức Phương tiện</h3>
            <p className="text-slate-400 text-sm font-medium m-0 mt-1">Quản lý định mức nhiên liệu, mức tiêu hao và hệ số tải của phương tiện.</p>
          </div>
          <button onClick={() => openDrawer()} className="flex items-center gap-2 bg-emerald-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors">
            <Plus size={16}/> Thêm cấu hình
          </button>
        </div>

        {/* ═══ TABLE HEADER ═══ */}
        <div className="grid grid-cols-12 px-6 py-2.5 bg-slate-50 border-t border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
          <div className="col-span-2">Xe</div>
          <div className="col-span-2">Loại nhiên liệu</div>
          <div className="col-span-2 text-right">Bình (Lít)</div>
          <div className="col-span-2 text-right">Chạy (Lít/100km)</div>
          <div className="col-span-1 text-right">Dừng (Lít/h)</div>
          <div className="col-span-1 text-right">Hệ số tải</div>
          <div className="col-span-2 text-right">Thao tác</div>
        </div>

        {/* ═══ ROWS ═══ */}
        {paged.length === 0 && <Empty description="Không có cấu hình" className="py-12" />}
        {paged.map(d => (
          <div key={d.vehicle_fuel_profile_id} className="grid grid-cols-12 px-6 py-3.5 border-b border-slate-50 hover:bg-slate-50/50 transition-colors items-center">
            <div className="col-span-2">
              <div className="font-black text-sm text-slate-800">{d.vehicle_name}</div>
              <div className="text-[11px] font-bold text-slate-400">{d.vehicle_license_plate}</div>
            </div>
            <div className="col-span-2">
              <span className="bg-blue-50 text-blue-700 font-bold text-xs px-2.5 py-1 rounded-full">{d.fuel_type || "Diesel"}</span>
            </div>
            <div className="col-span-2 text-right font-bold text-sm text-slate-700">{safe(d.tank_capacity_liters).toFixed(2)}</div>
            <div className="col-span-2 text-right"><span className="font-black text-emerald-600 text-base">{safe(d.default_l_per_100km).toFixed(2)}</span></div>
            <div className="col-span-1 text-right"><span className="font-black text-orange-500 text-sm">{safe(d.idle_l_per_hour).toFixed(2)}</span></div>
            <div className="col-span-1 text-right font-bold text-sm text-slate-500">{safe(d.load_factor).toFixed(3)}</div>
            <div className="col-span-2 flex justify-end gap-1.5">
              <button onClick={() => openDrawer(d)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors"><Edit size={14}/></button>
              <button className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}

        {/* ═══ PAGINATION ═══ */}
        <div className="px-6 py-3 border-t border-slate-100 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-400">Hiển thị {Math.min((page-1)*pageSize+1, visibleData.length)}–{Math.min(page*pageSize, visibleData.length)} trong {visibleData.length} cấu hình</span>
          <Pagination current={page} pageSize={pageSize} total={visibleData.length} onChange={setPage} size="small" showSizeChanger={false} />
        </div>
      </div>

      {/* ═══ DRAWER THÊM/SỬA CẤU HÌNH ═══ */}
      <Drawer title={null} open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditItem(null); }}
        width={420} closable={false} styles={{ body: { padding: 0 }, header: { display: "none" } }}>
        <div className="h-full flex flex-col">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
            <div><h3 className="font-black text-lg text-slate-800 m-0">{editItem ? "Chỉnh sửa cấu hình" : "Thêm / Chỉnh sửa cấu hình"}</h3></div>
            <button onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg">×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <Form form={form} layout="vertical" onFinish={handleSave} size="large">
              {fixedVehicle ? (
                <>
                  <Form.Item name="vehicle_id" hidden rules={[{ required: true }]}>
                    <InputNumber />
                  </Form.Item>
                  <Form.Item label={<span className="font-bold text-slate-600 text-sm">* Xe đang chọn</span>}>
                    <Input
                      readOnly
                      value={`${fixedVehicle.vehicle_name} — ${fixedVehicle.vehicle_license_plate}`}
                      className="font-bold"
                    />
                  </Form.Item>
                </>
              ) : (
                <Form.Item name="vehicle_id" label={<span className="font-bold text-slate-600 text-sm">* Chọn xe</span>} rules={[{ required: true }]}>
                  <Select placeholder="Chọn xe..." showSearch optionFilterProp="label"
                    options={vehicles.map(v => ({ label: `${v.vehicle_name} - ${v.vehicle_license_plate}`, value: v.vehicle_id }))} />
                </Form.Item>
              )}

              <Form.Item name="fuel_type" label={<span className="font-bold text-slate-600 text-sm">* Loại nhiên liệu</span>} rules={[{ required: true }]}>
                <Select placeholder="Chọn loại nhiên liệu..." options={[{ label: "Diesel", value: "diesel" }, { label: "Xăng", value: "gasoline" }]} />
              </Form.Item>

              <Form.Item name="tank_capacity_liters" label={<span className="font-bold text-slate-600 text-sm">* Dung tích bình (Lít)</span>} rules={[{ required: true }]}>
                <InputNumber className="w-full" addonAfter="Lít" min={0} placeholder="Nhập dung tích bình..." />
              </Form.Item>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="default_l_per_100km" label={<span className="font-bold text-slate-600 text-sm">* Mức tiêu hao khi chạy</span>} rules={[{ required: true }]}>
                  <InputNumber className="w-full" addonAfter="Lít/100km" min={0} placeholder="Nhập Lít/100km" />
                </Form.Item>
                <Form.Item name="idle_l_per_hour" label={<span className="font-bold text-slate-600 text-sm">* Mức tiêu hao khi dừng</span>} rules={[{ required: true }]}>
                  <InputNumber className="w-full" addonAfter="Lít/h" min={0} placeholder="Nhập Lít/h" />
                </Form.Item>
              </div>

              <Form.Item name="load_factor" label={<span className="font-bold text-slate-600 text-sm">* Hệ số tải <span className="text-slate-300 ml-1">ⓘ</span></span>} rules={[{ required: true }]}>
                <InputNumber className="w-full" min={0} max={5} step={0.01} placeholder="Nhập hệ số tải..." />
              </Form.Item>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 mt-2">
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Mốc tồn dầu ban đầu</div>
                <div className="grid grid-cols-2 gap-3">
                  <Form.Item name="opening_fuel_liters" label={<span className="font-bold text-slate-600 text-sm">Số dầu (Lít)</span>} className="mb-0">
                    <InputNumber className="w-full" addonAfter="Lít" min={0} placeholder="VD: 285" />
                  </Form.Item>
                  <Form.Item name="opening_fuel_at" label={<span className="font-bold text-slate-600 text-sm">Thời điểm chốt</span>} className="mb-0">
                    <DatePicker showTime className="w-full" format="DD/MM/YYYY HH:mm" placeholder="Chọn thời điểm..." />
                  </Form.Item>
                </div>
              </div>

              <Form.Item name="note" label={<span className="font-bold text-slate-600 text-sm">Ghi chú (tùy chọn)</span>}>
                <Input.TextArea rows={3} placeholder="Nhập ghi chú..." showCount maxLength={200} />
              </Form.Item>
            </Form>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
            <button onClick={() => setDrawerOpen(false)} className="flex-1 h-10 rounded-xl border border-slate-200 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-colors">Hủy bỏ</button>
            <button onClick={() => form.submit()} className="flex-1 h-10 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors">Lưu cấu hình</button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
