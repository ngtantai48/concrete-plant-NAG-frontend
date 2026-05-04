"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Input, Select, Tag, Button, DatePicker, Form, InputNumber, Drawer, Spin, Empty, Pagination, message } from "antd";
import { Plus, Search, Edit, Trash2, ArrowDown } from "lucide-react";
import dayjs from "dayjs";
import fuelApi from "@/services/fuel.service";
import type { FuelEvent } from "@/types/report";
import type { Vehicle } from "@/types/vehicle";

const safe = (v: any) => Number(v || 0);
const dec = (v: any) => safe(v).toFixed(1);

const typeMap: Record<string, { color: string; text: string; icon: string }> = {
  refuel_full: { color: "green", text: "Đổ đầy", icon: "↑" },
  refuel_partial: { color: "blue", text: "Đổ thêm", icon: "↑" },
  drain: { color: "red", text: "Rút dầu", icon: "↓" },
  adjust_plus: { color: "orange", text: "Điều chỉnh (+)", icon: "↑" },
  adjust_minus: { color: "magenta", text: "Điều chỉnh (−)", icon: "↓" },
};

export default function FuelEventsTabNew({ from, to, vehicle_id, vehicles, onMutated }: { from: string; to: string; vehicle_id?: number; vehicles: Vehicle[]; onMutated?: () => void }) {
  const [data, setData] = useState<FuelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<FuelEvent | null>(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const fixedVehicle = useMemo(() => vehicles.find(v => v.vehicle_id === vehicle_id), [vehicles, vehicle_id]);

  const fetchData = useCallback(() => {
    setLoading(true);
    fuelApi.getEvents({ from, to, vehicle_id, limit: 200 })
      .then(res => { const p = res.data; setData(Array.isArray(p) ? p : p?.data || []); })
      .catch(console.error).finally(() => setLoading(false));
  }, [from, to, vehicle_id]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const openDrawer = (item?: FuelEvent) => {
    setEditItem(item || null);
    if (item) {
      form.setFieldsValue({
        ...item,
        event_time: dayjs(item.event_time)
      });
    } else {
      form.resetFields();
      form.setFieldValue("event_time", dayjs());
      if (vehicle_id) {
        form.setFieldValue("vehicle_id", vehicle_id);
      }
    }
    setDrawerOpen(true);
  };

  const handleSave = async (values: any) => {
    try {
      const payload = { ...values, event_time: values.event_time.format() };
      delete payload.odometer_km;
      if (editItem) {
        await fuelApi.updateEvent(editItem.fuel_event_id, payload);
        message.success("Cập nhật sự kiện thành công");
      } else {
        await fuelApi.createEvent(payload);
        message.success("Thêm sự kiện thành công");
      }
      setDrawerOpen(false); form.resetFields(); setEditItem(null); fetchData();
      onMutated?.();
    } catch { message.error("Lỗi khi lưu"); }
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Bạn có chắc muốn xóa giao dịch này?")) {
      fuelApi.deleteEvent(id).then(() => {
        message.success("Đã xóa giao dịch");
        fetchData();
        onMutated?.();
      }).catch(() => message.error("Lỗi khi xóa"));
    }
  };

  // Filter + search
  const filtered = useMemo(() => {
    let list = data;
    if (filterType) list = list.filter(e => e.event_type === filterType);
    if (searchText) {
      const s = searchText.toLowerCase();
      list = list.filter(e => e.vehicle_name?.toLowerCase().includes(s) || e.vehicle_license_plate?.toLowerCase().includes(s) || e.note?.toLowerCase().includes(s));
    }
    return list;
  }, [data, filterType, searchText]);

  useEffect(() => { setPage(1); }, [searchText, filterType]);

  // Summary
  const totalIn = filtered.filter(e => safe(e.liters) > 0).reduce((s, e) => s + safe(e.liters), 0);
  const totalOut = filtered.filter(e => safe(e.liters) < 0).reduce((s, e) => s + safe(e.liters), 0);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, FuelEvent[]>();
    filtered.forEach(e => {
      const d = dayjs(e.event_time).format("DD/MM/YYYY");
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const paged = grouped; // show all groups, paginate events
  const totalEvents = filtered.length;
  const pagedEvents = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Get dates in current page
  const pagedDates = useMemo(() => {
    const dates = new Map<string, FuelEvent[]>();
    pagedEvents.forEach(e => {
      const d = dayjs(e.event_time).format("DD/MM/YYYY");
      if (!dates.has(d)) dates.set(d, []);
      dates.get(d)!.push(e);
    });
    return Array.from(dates.entries());
  }, [pagedEvents]);

  if (loading) return <div className="flex justify-center py-24"><Spin size="large" /></div>;

  return (
    <div className="space-y-4">
      {/* ═══ HEADER ═══ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h3 className="font-black text-lg text-slate-800 m-0">Nhật ký Đổ dầu / Điều chỉnh</h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest m-0">Toàn bộ giao dịch nhiên liệu</p>
          </div>

          {/* Summary badges */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2">
              <ArrowDown size={14} className="text-emerald-600" />
              <div><div className="text-[10px] font-bold text-emerald-600 uppercase">Tổng đổ</div><div className="font-black text-emerald-700 text-base">+{dec(totalIn)} Lít</div></div>
            </div>
          </div>

          <Button type="primary" icon={<Plus size={16}/>} onClick={() => openDrawer()}
            className="bg-emerald-600 border-0 rounded-xl h-10 px-5 font-bold hover:bg-emerald-700">+ Thêm giao dịch</Button>
        </div>

        {/* ═══ FILTERS ═══ */}
        <div className="px-6 py-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <Input prefix={<Search size={14} className="text-slate-400"/>} placeholder="Tìm kiếm xe, biển số, ghi chú..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-[220px] rounded-xl" size="small" allowClear />
          <Select placeholder="Loại giao dịch" allowClear value={filterType} onChange={setFilterType} className="w-[160px]" size="small"
            options={[{ label: "Đổ đầy", value: "refuel_full" }, { label: "Đổ thêm", value: "refuel_partial" }, { label: "Điều chỉnh (+)", value: "adjust_plus" }, { label: "Điều chỉnh (−)", value: "adjust_minus" }]} />
        </div>

        {/* ═══ TABLE HEADER ═══ */}
        <div className="grid grid-cols-12 px-6 py-2.5 bg-slate-50 border-t border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
          <div className="col-span-1">Thời gian</div>
          <div className="col-span-2">Xe</div>
          <div className="col-span-2">Loại</div>
          <div className="col-span-2 text-right">Số lít</div>
          <div className="col-span-4">Ghi chú</div>
          <div className="col-span-1 text-right">Thao tác</div>
        </div>

        {/* ═══ DATE-GROUPED ROWS ═══ */}
        {pagedDates.length === 0 && <Empty description="Không có giao dịch" className="py-12" />}
        {pagedDates.map(([date, events]) => (
          <div key={date}>
            <div className="px-6 py-2 bg-slate-50/50 border-b border-slate-100">
              <span className="font-black text-sm text-slate-700">{date}</span>
              <span className="ml-2 text-xs font-bold text-slate-400">{events.length} giao dịch</span>
            </div>
            {events.map(e => {
              const t = typeMap[e.event_type] || { color: "default", text: e.event_type, icon: "" };
              return (
                <div key={e.fuel_event_id} className="grid grid-cols-12 px-6 py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors items-center">
                  <div className="col-span-1 font-bold text-sm text-slate-600">{dayjs(e.event_time).format("HH:mm")}</div>
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="font-black text-sm text-slate-800">{e.vehicle_name}</span>
                    <span className="bg-slate-800 text-white font-bold text-[10px] px-1.5 py-0.5 rounded">{e.vehicle_license_plate}</span>
                  </div>
                  <div className="col-span-2">
                    <Tag color={t.color} className="border-0 rounded-full font-bold text-xs px-2.5 m-0">{t.icon} {t.text}</Tag>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className={`font-black text-base ${safe(e.liters) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{safe(e.liters) > 0 ? '+' : ''}{dec(e.liters)} Lít</span>
                  </div>
                  <div className="col-span-4 text-sm text-slate-500 truncate">{e.note || "—"}</div>
                  <div className="col-span-1 flex justify-end gap-1">
                    <button onClick={() => openDrawer(e)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors"><Edit size={13}/></button>
                    <button onClick={() => handleDelete(e.fuel_event_id)} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* ═══ PAGINATION ═══ */}
        <div className="px-6 py-3 border-t border-slate-100 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-400">Hiển thị {Math.min((page-1)*pageSize+1, totalEvents)}-{Math.min(page*pageSize, totalEvents)} trong {totalEvents} giao dịch</span>
          <Pagination current={page} pageSize={pageSize} total={totalEvents} onChange={setPage} size="small" showSizeChanger={false} />
        </div>
      </div>

      {/* ═══ DRAWER THÊM GIAO DỊCH ═══ */}
      <Drawer title={null} open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditItem(null); }}
        width={420} closable={false} styles={{ body: { padding: 0, background: "#fff" }, header: { display: "none" } }}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
            <div><h3 className="font-black text-lg text-slate-800 m-0">{editItem ? "Chỉnh sửa giao dịch" : "Thêm giao dịch nhiên liệu"}</h3><p className="text-xs font-bold text-slate-400 m-0">Thông tin giao dịch</p></div>
            <button onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg">×</button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <Form form={form} layout="vertical" onFinish={handleSave} size="large">
              {fixedVehicle ? (
                <>
                  <Form.Item name="vehicle_id" hidden rules={[{ required: true, message: "Vui lòng chọn xe" }]}>
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
                <Form.Item name="vehicle_id" label={<span className="font-bold text-slate-600 text-sm">* Chọn xe</span>} rules={[{ required: true, message: "Vui lòng chọn xe" }]}>
                  <Select placeholder="Chọn xe..." showSearch optionFilterProp="label"
                    options={vehicles.map(v => ({ label: `${v.vehicle_name} — ${v.vehicle_license_plate}`, value: v.vehicle_id }))}
                    optionRender={(option) => { const veh = vehicles.find(v => v.vehicle_id === option.value); return (<div className="flex items-center gap-3 py-1"><span className="font-black text-sm">{veh?.vehicle_name}</span><span className="bg-slate-800 text-white font-bold text-xs px-2 py-0.5 rounded">{veh?.vehicle_license_plate}</span></div>); }} />
                </Form.Item>
              )}

              {/* Loại giao dịch — toggle buttons */}
              <Form.Item name="event_type" label={<span className="font-bold text-slate-600 text-sm">* Loại giao dịch</span>} rules={[{ required: true, message: "Chọn loại" }]}>
                <Select options={[
                  { label: "↑ Đổ thêm", value: "refuel_partial" },
                  { label: "↑ Đổ đầy bình", value: "refuel_full" },
                  { label: "↑ Điều chỉnh (+)", value: "adjust_plus" },
                  { label: "↓ Điều chỉnh (−)", value: "adjust_minus" },
                ]} />
              </Form.Item>

              {/* Số lít + quick buttons */}
              <Form.Item name="liters" label={<span className="font-bold text-slate-600 text-sm">* Số lít (Lít)</span>} rules={[{ required: true, message: "Nhập số lít" }]}>
                <InputNumber className="w-full" addonAfter="Lít" min={0} placeholder="Nhập số lít..." />
              </Form.Item>
              <div className="flex gap-2 -mt-3 mb-4">
                {[50, 100, 200].map(n => (
                  <button key={n} type="button" onClick={() => form.setFieldValue("liters", n)}
                    className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">+{n} Lít</button>
                ))}
                <button type="button" className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">Khác</button>
              </div>

              {/* Thời gian */}
              <Form.Item name="event_time" label={<span className="font-bold text-slate-600 text-sm">* Thời gian</span>} rules={[{ required: true, message: "Chọn thời gian" }]}
                initialValue={dayjs()}>
                <DatePicker showTime className="w-full" format="DD/MM/YYYY HH:mm" />
              </Form.Item>

              {/* Ghi chú */}
              <Form.Item name="note" label={<span className="font-bold text-slate-600 text-sm">Ghi chú</span>}>
                <Input.TextArea rows={3} placeholder="VD: Đổ dầu tại trạm ABC, tài xế Nguyễn Văn A..." showCount maxLength={200} />
              </Form.Item>
            </Form>
          </div>

          {/* Footer buttons */}
          <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
            <button onClick={() => setDrawerOpen(false)} className="flex-1 h-10 rounded-xl border border-slate-200 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-colors">Hủy</button>
            <button onClick={() => form.submit()} className="flex-1 h-10 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors">Lưu giao dịch</button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
