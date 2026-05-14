// "use client";

// import React, { useState, useEffect, useCallback, useMemo } from "react";
// import { exportToExcel } from "@/utils/exportReport";
// import { Table, Tag, Button, Drawer, Typography, Space, Card, Row, Col, DatePicker, Spin, Empty, Input, Select } from "antd";
// import {
//   AlertCircle,
//   CheckCircle2,
//   Clock,
//   ChevronRight,
//   FileText,
//   Truck,
//   User,
//   MapPin,
//   AlertTriangle,
//   Info,
//   Search,
// } from "lucide-react";
// import { motion } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import dayjs from "dayjs";
// import vehicleApi from "@/services/vehicle.service";
// import type { EndOfDayStatusResponse, EndOfDayVehicle, EndOfDayOperationItem } from "@/services/vehicle.service";

// const { Title, Text } = Typography;

// const LEVEL_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
//   warning: { color: "#f59e0b", icon: <AlertTriangle size={12} /> },
//   info: { color: "#3b82f6", icon: <Info size={12} /> },
//   status: { color: "#64748b", icon: <Clock size={12} /> },
// };

// export default function EndOfDayTable() {
//   const [data, setData] = useState<EndOfDayStatusResponse | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [selectedVehicle, setSelectedVehicle] = useState<EndOfDayVehicle | null>(null);
//   const [isDrawerOpen, setIsDrawerOpen] = useState(false);
//   const [searchText, setSearchText] = useState("");
//   const [statusFilter, setStatusFilter] = useState<string>("all");
//   const [date, setDate] = useState(dayjs());

//   const fetchData = useCallback(async () => {
//     setLoading(true);
//     try {
//       const res = await vehicleApi.getEndOfDayStatus(date.format("YYYY-MM-DD"));
//       setData(res.data as unknown as EndOfDayStatusResponse);
//     } catch (e) {
//       console.error("Failed to load end-of-day status", e);
//     } finally {
//       setLoading(false);
//     }
//   }, [date]);

//   useEffect(() => { fetchData(); }, [fetchData]);

//   const handleExport = () => {
//     if (!data) return;
//     exportToExcel((data.vehicles ?? []).map((v, i) => ({ "#": i + 1, "Xe": v.vehicle_name, "Biển số": v.vehicle_license_plate, "Tài xế": v.driver_name, "Trạm": v.station_name, "Lệnh": v.order_number, "Kết thúc": v.finished_at ?? "", "Trạng thái": v.is_abnormal ? "Bất thường" : "Hoàn thành", "Ghi chú": v.abnormal_notes?.join("; ") ?? "" })), `chot-cuoi-ngay_${date.format("YYYY-MM-DD")}`, "Chốt cuối ngày");
//   };

//   const filtered = useMemo(() =>
//     (data?.vehicles ?? [])
//       .filter(v => statusFilter === "all" || (statusFilter === "abnormal" ? v.is_abnormal : !v.is_abnormal))
//       .filter(v =>
//         searchText === "" ||
//         v.vehicle_name.toLowerCase().includes(searchText.toLowerCase()) ||
//         v.vehicle_license_plate.toLowerCase().includes(searchText.toLowerCase()) ||
//         v.driver_name.toLowerCase().includes(searchText.toLowerCase())
//       ),
//     [data, statusFilter, searchText]);

//   const normalCount = (data?.total ?? 0) - (data?.abnormal_total ?? 0);
//   const abnormalCount = data?.abnormal_total ?? 0;
//   const completionRate = (data?.total ?? 0) > 0 ? Math.round(normalCount / (data?.total ?? 1) * 100) : 0;

//   const piData = useMemo(() => [
//     { name: "Hoàn thành", value: normalCount, color: "#10b981" },
//     { name: "Bất thường", value: abnormalCount, color: "#ef4444" },
//   ].filter(d => d.value > 0), [normalCount, abnormalCount]);

//   const stationBreakdown = useMemo(() => {
//     const map: Record<string, { name: string; total: number; abnormal: number }> = {};
//     (data?.vehicles ?? []).forEach(v => {
//       const s = v.station_name || "Không rõ";
//       if (!map[s]) map[s] = { name: s, total: 0, abnormal: 0 };
//       map[s].total++;
//       if (v.is_abnormal) map[s].abnormal++;
//     });
//     return Object.values(map).sort((a, b) => b.total - a.total);
//   }, [data]);

//   const columns = [
//     {
//       title: "Xe",
//       key: "vehicle",
//       render: (_: any, r: EndOfDayVehicle) => (
//         <Space size="middle">
//           <div style={{ width: 40, height: 40, borderRadius: 12, background: r.is_abnormal ? "#fef2f2" : "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
//             <Truck size={18} style={{ color: r.is_abnormal ? "#ef4444" : "#3b82f6" }} />
//           </div>
//           <div>
//             <Text strong className="text-gray-800 block">{r.vehicle_name}</Text>
//             <Text type="secondary" className="text-xs font-mono">{r.vehicle_license_plate}</Text>
//           </div>
//         </Space>
//       ),
//     },
//     {
//       title: "Tài xế",
//       dataIndex: "driver_name",
//       key: "driver",
//       render: (text: string) => <Space><User size={14} className="text-gray-400" /><Text>{text}</Text></Space>,
//     },
//     {
//       title: "Trạm",
//       key: "station",
//       render: (_: any, r: EndOfDayVehicle) => (
//         <div>
//           <Space className="text-sm"><MapPin size={14} className="text-gray-400" /> {r.station_name}</Space>
//           <br /><Tag color="blue" className="mt-1 rounded-full px-2 border-0 text-xs">#{r.order_number}</Tag>
//         </div>
//       ),
//     },
//     {
//       title: "Kết thúc",
//       dataIndex: "finished_at",
//       key: "time",
//       width: 120,
//       render: (time: string | null) => time
//         ? <span className="text-gray-500 text-sm">{dayjs(time).format("HH:mm:ss")}</span>
//         : <Text type="secondary" className="text-sm italic">—</Text>,
//       sorter: (a: any, b: any) => {
//         if (!a.finished_at) return 1;
//         if (!b.finished_at) return -1;
//         return dayjs(a.finished_at).unix() - dayjs(b.finished_at).unix();
//       },
//     },
//     {
//       title: "Trạng thái",
//       key: "status",
//       width: 140,
//       filters: [{ text: "Bất thường", value: true }, { text: "Hoàn thành", value: false }],
//       onFilter: (value: any, record: any) => record.is_abnormal === value,
//       render: (_: any, r: EndOfDayVehicle) => r.is_abnormal
//         ? <Tag color="red" className="px-2.5 py-0.5 rounded-full border-0 font-semibold inline-flex items-center gap-1"><AlertCircle size={11} /> Bất thường</Tag>
//         : <Tag color="green" className="px-2.5 py-0.5 rounded-full border-0 font-semibold inline-flex items-center gap-1"><CheckCircle2 size={11} /> Hoàn thành</Tag>,
//     },
//     {
//       title: "",
//       key: "actions",
//       width: 50,
//       render: (_: any, r: EndOfDayVehicle) => (
//         <Button type="text" icon={<ChevronRight size={18} />}
//           onClick={() => { setSelectedVehicle(r); setIsDrawerOpen(true); }}
//           className="hover:bg-blue-50 text-blue-500 rounded-lg"
//         />
//       ),
//     },
//   ];

//   return (
//     <div className="space-y-5">
//       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
//         <Card className="border-0 shadow-lg rounded-2xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
//           <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 80% 50%, rgba(139,92,246,0.12), transparent 60%)" }} />
//           <Row justify="space-between" align="middle" gutter={[16, 16]} className="relative z-10">
//             <Col>
//               <Space direction="vertical" size={0}>
//                 <Text style={{ color: "rgba(167,139,250,0.9)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Chốt ca vận hành</Text>
//                 <Title level={3} style={{ margin: "4px 0 0", color: "#fff", fontWeight: 800 }}>Quản lý Chốt Cuối Ngày</Title>
//                 <Text style={{ color: "#94a3b8", fontSize: 13, marginTop: 2 }}>Ngày {date.format("DD/MM/YYYY")} — {data?.total ?? 0} xe đã vận hành</Text>
//               </Space>
//             </Col>
//             <Col>
//               <Space size="middle" wrap>
//                 <DatePicker value={date} onChange={(d) => d && setDate(d)} className="rounded-xl" />
//                 <Button icon={<FileText size={16} />} type="primary" onClick={handleExport} disabled={!data} style={{ background: "#7c3aed", border: 0, height: 40, padding: "0 24px", borderRadius: 12, fontWeight: 700 }}>Xuất Excel</Button>
//               </Space>
//             </Col>
//           </Row>
//         </Card>
//       </motion.div>

//       <Row gutter={[12, 12]}>
//         <Col xs={12} sm={12} lg={5}>
//           <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
//             <Card className="border-0 shadow-sm rounded-2xl" bodyStyle={{ padding: 20 }}>
//               <div className="flex items-start justify-between">
//                 <div>
//                   <Text type="secondary" className="text-[11px] font-bold uppercase tracking-widest block mb-1">Tổng xe</Text>
//                   <Title level={3} className="m-0">{data?.total ?? 0}</Title>
//                 </div>
//                 <div style={{ background: "#eff6ff", width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6" }}><Truck size={22} /></div>
//               </div>
//             </Card>
//           </motion.div>
//         </Col>
//         <Col xs={12} sm={12} lg={5}>
//           <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
//             <Card className="border-0 shadow-sm rounded-2xl" bodyStyle={{ padding: 20 }}>
//               <div className="flex items-start justify-between">
//                 <div>
//                   <Text type="secondary" className="text-[11px] font-bold uppercase tracking-widest block mb-1">Hoàn thành</Text>
//                   <Title level={3} className="m-0" style={{ color: "#10b981" }}>{normalCount}</Title>
//                 </div>
//                 <div style={{ background: "#ecfdf5", width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}><CheckCircle2 size={22} /></div>
//               </div>
//             </Card>
//           </motion.div>
//         </Col>
//         <Col xs={12} sm={12} lg={5}>
//           <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
//             <Card className="border-0 shadow-sm rounded-2xl" bodyStyle={{ padding: 20 }}>
//               <div className="flex items-start justify-between">
//                 <div>
//                   <Text type="secondary" className="text-[11px] font-bold uppercase tracking-widest block mb-1">Bất thường</Text>
//                   <Title level={3} className="m-0" style={{ color: abnormalCount > 0 ? "#ef4444" : "#10b981" }}>{abnormalCount}</Title>
//                 </div>
//                 <div style={{ background: abnormalCount > 0 ? "#fef2f2" : "#ecfdf5", width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: abnormalCount > 0 ? "#ef4444" : "#10b981" }}><AlertCircle size={22} /></div>
//               </div>
//             </Card>
//           </motion.div>
//         </Col>
//         <Col xs={12} sm={12} lg={9}>
//           <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
//             <Card className="border-0 shadow-sm rounded-2xl" bodyStyle={{ padding: "12px 20px" }}>
//               <div className="flex items-center gap-4">
//                 <div className="w-[120px] h-[100px]">
//                   <ResponsiveContainer width="100%" height="100%">
//                     <PieChart>
//                       <Pie data={piData} cx="50%" cy="50%" innerRadius={30} outerRadius={45} paddingAngle={3} dataKey="value">
//                         {piData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
//                       </Pie>
//                     </PieChart>
//                   </ResponsiveContainer>
//                 </div>
//                 <div>
//                   <Text type="secondary" className="text-[11px] font-bold uppercase tracking-widest block mb-0.5">Tỷ lệ hoàn thành</Text>
//                   <Title level={3} className="m-0" style={{ color: completionRate >= 90 ? "#10b981" : completionRate >= 70 ? "#f59e0b" : "#ef4444" }}>{completionRate}%</Title>
//                   <div className="flex gap-4 mt-1">
//                     {piData.map(d => (
//                       <div key={d.name} className="flex items-center gap-1 text-xs">
//                         <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
//                         <Text type="secondary">{d.name}</Text>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               </div>
//             </Card>
//           </motion.div>
//         </Col>
//       </Row>

//       {stationBreakdown.length > 0 && (
//         <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
//           <Card className="border-0 shadow-sm rounded-2xl" bodyStyle={{ padding: "16px 20px" }}>
//             <div className="flex items-center gap-2 mb-3">
//               <MapPin size={16} className="text-violet-500" />
//               <Title level={5} className="m-0 font-bold">Phân bổ theo trạm</Title>
//             </div>
//             <div className="flex flex-wrap gap-3">
//               {stationBreakdown.map(s => (
//                 <div key={s.name} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-100 bg-gray-50/50">
//                   <Text strong className="text-sm">{s.name}</Text>
//                   <Tag color="blue" className="rounded-full px-2 border-0 text-xs">{s.total} xe</Tag>
//                   {s.abnormal > 0 && <Tag color="red" className="rounded-full px-2 border-0 text-xs">{s.abnormal} bất thường</Tag>}
//                 </div>
//               ))}
//             </div>
//           </Card>
//         </motion.div>
//       )}

//       <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
//         <Card className="border-0 shadow-sm rounded-2xl overflow-hidden" bodyStyle={{ padding: 0 }}>
//           <div className="px-6 py-4 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
//             <Title level={5} className="m-0 font-bold">Trạng thái từng xe</Title>
//             <Space>
//               <Input prefix={<Search size={14} className="text-gray-400" />} placeholder="Tìm xe, biển số, tài xế..." className="w-60 rounded-lg" value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear />
//               <Select value={statusFilter} onChange={setStatusFilter} className="min-w-[140px]" options={[
//                 { label: "Tất cả", value: "all" },
//                 { label: "Bất thường", value: "abnormal" },
//                 { label: "Hoàn thành", value: "normal" },
//               ]} />
//             </Space>
//           </div>
//           {loading ? (
//             <div className="flex items-center justify-center py-24"><Spin size="large" /></div>
//           ) : filtered.length === 0 ? (
//             <Empty className="py-16" description="Không có dữ liệu" />
//           ) : (
//             <Table columns={columns} dataSource={filtered.map(v => ({ ...v, key: v.vehicle_id }))} pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ["10", "15", "25", "50"], showTotal: (total) => `Tổng ${total} xe` }} className="custom-pro-table"
//               rowClassName={(r) => (r as EndOfDayVehicle).is_abnormal ? "abnormal-row" : ""}
//             />
//           )}
//         </Card>
//       </motion.div>

//       <Drawer
//         title={<Space><Truck size={20} className="text-violet-500" /><Title level={5} className="m-0">Chi tiết: {selectedVehicle?.vehicle_name}</Title></Space>}
//         placement="right" onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen} width={480}
//       >
//         {selectedVehicle && (
//           <div className="space-y-5">
//             <div style={{ background: "#f8fafc", padding: 16, borderRadius: 16 }}>
//               {[
//                 ["Biển số", selectedVehicle.vehicle_license_plate],
//                 ["Tài xế", selectedVehicle.driver_name],
//                 ["Trạm", selectedVehicle.station_name],
//                 ["Lệnh", `#${selectedVehicle.order_number}`],
//                 ["Kết thúc", selectedVehicle.finished_at ? dayjs(selectedVehicle.finished_at).format("HH:mm:ss DD/MM/YYYY") : "—"],
//               ].map(([k, v]) => (
//                 <div key={k as string} className="flex justify-between py-1.5"><Text type="secondary">{k}</Text><Text strong>{v}</Text></div>
//               ))}
//             </div>

//             {selectedVehicle.is_abnormal && selectedVehicle.abnormal_notes && selectedVehicle.abnormal_notes.length > 0 && (
//               <div style={{ background: "#fef2f2", padding: 16, borderRadius: 16, border: "1px solid #fecaca" }}>
//                 <div className="flex items-center gap-2 text-red-600 mb-3"><AlertCircle size={18} /><Text strong className="text-red-600">Chi tiết bất thường</Text></div>
//                 <ul className="m-0 pl-4 space-y-1.5">
//                   {selectedVehicle.abnormal_notes.map((note, i) => <li key={i} className="text-red-700 text-sm">{note}</li>)}
//                 </ul>
//               </div>
//             )}

//             {selectedVehicle.is_abnormal && selectedVehicle.abnormal_event_items && selectedVehicle.abnormal_event_items.length > 0 && (
//               <div style={{ background: "#fffbeb", padding: 16, borderRadius: 16, border: "1px solid #fde68a" }}>
//                 <div className="flex items-center gap-2 text-amber-700 mb-3"><AlertTriangle size={18} /><Text strong className="text-amber-700">Sự kiện bất thường</Text></div>
//                 <div className="space-y-2">
//                   {selectedVehicle.abnormal_event_items.map((ev: EndOfDayOperationItem, i: number) => (
//                     <div key={i} className="flex gap-2 items-start text-sm">
//                       <span style={{ color: LEVEL_STYLE[ev.level]?.color ?? "#64748b", marginTop: 2 }}>{LEVEL_STYLE[ev.level]?.icon ?? <Clock size={12} />}</span>
//                       <div>
//                         <Text strong className="text-sm block">{ev.event}</Text>
//                         <Text className="text-gray-500 text-xs">{ev.message}</Text>
//                         {ev.occurred_at && <Text className="text-gray-400 text-xs block">{dayjs(ev.occurred_at).format("HH:mm:ss DD/MM")}</Text>}
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {selectedVehicle.operation_items && selectedVehicle.operation_items.length > 0 && (
//               <div>
//                 <Title level={5} className="mb-4">Dòng thời gian vận hành</Title>
//                 <div className="space-y-4 relative before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-100">
//                   {selectedVehicle.operation_items.map((ev: EndOfDayOperationItem, i: number) => {
//                     const levelColor = LEVEL_STYLE[ev.level]?.color ?? "#94a3b8";
//                     return (
//                       <div key={i} className="flex gap-4 relative">
//                         <div className="w-4 h-4 rounded-full border-4 border-white shadow-sm z-10 shrink-0 mt-0.5" style={{ background: levelColor }} />
//                         <div className="flex-1">
//                           <div className="flex justify-between items-start">
//                             <Text strong className="text-sm" style={{ color: levelColor }}>{ev.event}</Text>
//                             {ev.occurred_at && <Text className="text-gray-400 text-xs shrink-0">{dayjs(ev.occurred_at).format("HH:mm")}</Text>}
//                           </div>
//                           <Text className="text-gray-500 text-sm">{ev.message}</Text>
//                           {ev.station_name && <Tag className="mt-1 text-xs rounded-full border-0" color="blue">{ev.station_name}</Tag>}
//                         </div>
//                       </div>
//                     );
//                   })}
//                 </div>
//               </div>
//             )}

//             {selectedVehicle.operation_note && (
//               <div className="pt-4 border-t">
//                 <Text type="secondary" className="block mb-2 text-xs uppercase tracking-wider font-bold">Ghi chú cuối ngày</Text>
//                 <div style={{ background: "#f8fafc", padding: 12, borderRadius: 12, color: "#475569", fontSize: 14, fontStyle: "italic" }}>&ldquo;{selectedVehicle.operation_note}&rdquo;</div>
//               </div>
//             )}
//           </div>
//         )}
//       </Drawer>

//       <style jsx global>{`
//         .custom-pro-table .ant-table-thead > tr > th {
//           background: transparent !important;
//           font-weight: 600; color: #94a3b8; font-size: 12px;
//           text-transform: uppercase; letter-spacing: 0.04em;
//           border-bottom: 1px solid #f1f5f9 !important;
//         }
//         .custom-pro-table .ant-table-tbody > tr > td { border-bottom: 1px solid #f8fafc !important; }
//         .custom-pro-table .ant-table-tbody > tr:hover > td { background: #f8fafc !important; }
//         .custom-pro-table .abnormal-row > td { background: rgba(254,242,242,0.3) !important; }
//         .custom-pro-table .abnormal-row:hover > td { background: rgba(254,242,242,0.5) !important; }
//       `}</style>
//     </div>
//   );
// }
