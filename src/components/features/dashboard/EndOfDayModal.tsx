import { Modal, Table, Button, Spin, Typography, DatePicker, Space } from "antd";
import { useEffect, useState } from "react";
import vehicleApi, { EndOfDayVehicle, EndOfDayStatusResponse, EndOfDayOperationItem } from "@/services/vehicle.service";
import { toast } from "sonner";
import { Save, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import dayjs, { Dayjs } from "dayjs";

const { Text } = Typography;

interface EndOfDayModalProps {
  open: boolean;
  onCancel: () => void;
  onAccept?: () => void;
}

export default function EndOfDayModal({ open, onCancel }: EndOfDayModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EndOfDayStatusResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());

  useEffect(() => {
    if (open) fetchData(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedDate]);

  const fetchData = async (date: Dayjs) => {
    setLoading(true);
    try {
      const res = await vehicleApi.getEndOfDayStatus(date.format("YYYY-MM-DD"));
      const raw = (res.data as any)?.data ?? res.data;
      setData(raw);
    } catch (error: any) {
      toast.error(`Không thể tải dữ liệu: ${error?.response?.data?.message || error?.message || "Lỗi không xác định"}`);
    } finally {
      setLoading(false);
    }
  };

  const goDay = (offset: number) => setSelectedDate((d) => d.add(offset, "day"));
  const isToday = selectedDate.isSame(dayjs(), "day");

  const columns = [
    {
      title: "Mã Xe",
      dataIndex: "vehicle_name",
      key: "vehicle_name",
      width: 90,
      sorter: (a: EndOfDayVehicle, b: EndOfDayVehicle) => a.vehicle_name.localeCompare(b.vehicle_name),
      render: (text: string) => <strong className="text-gray-800">{text}</strong>,
    },
    {
      title: "Biển số",
      dataIndex: "vehicle_license_plate",
      key: "vehicle_license_plate",
      width: 130,
      sorter: (a: EndOfDayVehicle, b: EndOfDayVehicle) =>
        a.vehicle_license_plate.localeCompare(b.vehicle_license_plate),
      render: (text: string) => (
        <div className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[13px] font-bold tracking-wide shadow-sm">
          {text}
        </div>
      ),
    },
    {
      title: "Giờ kết thúc",
      dataIndex: "finished_at",
      key: "finished_at",
      width: 120,
      sorter: (a: EndOfDayVehicle, b: EndOfDayVehicle) => {
        if (!a.finished_at && !b.finished_at) return 0;
        if (!a.finished_at) return -1;
        if (!b.finished_at) return 1;
        return new Date(a.finished_at).getTime() - new Date(b.finished_at).getTime();
      },
      render: (text: string | null) => {
        if (!text) return <Text type="secondary">-</Text>;
        return (
          <div className="flex items-center gap-1.5 text-gray-700">
            <Clock className="w-3.5 h-3.5" />
            <span>{dayjs(text).format("HH:mm")}</span>
          </div>
        );
      },
    },
    {
      title: "Nhật ký vận hành",
      key: "notes",
      render: (_: any, record: EndOfDayVehicle) => {
        const { operation_items, operation_notes, operation_note, abnormal_notes } = record;
        const rows: { key: string; message: string; isWarning: boolean }[] = [];
        const normalize = (v: string) => v.trim().toLowerCase();

        if (operation_items && operation_items.length > 0) {
          operation_items.forEach((item: EndOfDayOperationItem, idx: number) => {
            const message = typeof item?.message === "string" ? item.message.trim() : "";
            if (!message) return;
            rows.push({ key: `item-${idx}`, message, isWarning: String(item?.level || "").toLowerCase() === "warning" });
          });
        } else {
          let parts: string[] = [];
          if (operation_notes && operation_notes.length > 0) parts = operation_notes;
          else if (operation_note) parts = operation_note.split(" | ");

          const abnormalSet = new Set((abnormal_notes || []).map(normalize));
          parts.forEach((part, idx) => {
            const message = part.trim();
            if (!message) return;
            const norm = normalize(message);
            rows.push({
              key: `part-${idx}`,
              message,
              isWarning: abnormalSet.has(norm) || norm.includes("bat thuong") || norm.includes("bất thường"),
            });
          });
        }

        if (rows.length === 0) return <Text type="secondary">-</Text>;
        return (
          <div className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <div key={row.key} className={`flex items-start gap-2 text-[14.5px] leading-snug ${row.isWarning ? "text-red-600 font-semibold" : "text-gray-700 font-medium"}`}>
                {row.isWarning
                  ? <AlertCircle className="w-4 h-4 mt-[2px] shrink-0" />
                  : <CheckCircle2 className="w-4 h-4 mt-[2px] shrink-0 text-emerald-500" />}
                <span>{row.message}</span>
              </div>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <Modal
      title={
        <div className="flex items-center justify-between py-2 border-b">
          {/* Left: title + summary */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Save className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 m-0">Nhật ký vận hành</h3>
              {data && (
                <p className="text-sm text-gray-500 m-0 mt-0.5 font-medium">
                  Tổng: {data.total} xe

                </p>
              )}
            </div>
          </div>

          {/* Right: date navigator */}
          <Space size={4} className="mr-8">
            <Button
              size="small"
              icon={<ChevronLeft size={14} />}
              onClick={() => goDay(-1)}
              className="rounded-lg"
              title="Ngày trước"
            />
            <DatePicker
              value={selectedDate}
              onChange={(d) => { if (d) setSelectedDate(d); }}
              format="DD/MM/YYYY"
              disabledDate={(d) => d.isAfter(dayjs(), "day")}
              allowClear={false}
              size="small"
              style={{ width: 128, borderRadius: 8 }}
            />
            <Button
              size="small"
              icon={<ChevronRight size={14} />}
              onClick={() => goDay(1)}
              disabled={isToday}
              className="rounded-lg"
              title="Ngày sau"
            />
          </Space>
        </div>
      }
      open={open}
      onCancel={onCancel}
      width={1000}
      style={{ top: 20 }}
      footer={
        <div className="flex justify-end pt-4 border-t mt-4">
          <Button type="primary" className="h-10 px-8 font-medium rounded-lg bg-blue-600 hover:bg-blue-700" onClick={onCancel}>
            Đóng
          </Button>
        </div>
      }
      className="end-of-day-modal"
      closeIcon={false}
    >
      <div className="pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spin size="large" /></div>
        ) : (
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <Table
              dataSource={data?.vehicles || []}
              columns={columns}
              rowKey="vehicle_id"
              pagination={false}
              scroll={{ y: "calc(100vh - 380px)" }}
              size="middle"
              className="custom-table"
              rowClassName={(record) =>
                record.is_abnormal && record.final_status !== "delivering" ? "bg-red-50/30" : ""
              }
              locale={{ emptyText: `Không có dữ liệu ngày ${selectedDate.format("DD/MM/YYYY")}` }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
