import { Modal, Table, Button, Spin, Tag, Badge, Typography } from "antd";
import { useEffect, useState } from "react";
import vehicleApi, { EndOfDayVehicle, EndOfDayStatusResponse } from "@/services/vehicle.service";
import { toast } from "sonner";
import { Save, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import dayjs from "dayjs";

const { Text } = Typography;

interface EndOfDayModalProps {
  open: boolean;
  onCancel: () => void;
  onAccept?: () => void;
}

export default function EndOfDayModal({ open, onCancel, onAccept }: EndOfDayModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EndOfDayStatusResponse | null>(null);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await vehicleApi.getEndOfDayStatus();
      // Handle cases where response might be wrapped in `{ data: ... }`
      const responseData = (res.data as any)?.data ? (res.data as any).data : res.data;
      setData(responseData);
    } catch (error: any) {
      console.error("Lỗi lấy dữ liệu chốt ngày:", error);
      toast.error(`Không thể tải dữ liệu chốt ngày: ${error?.response?.data?.message || error?.message || "Lỗi không xác định"}`);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "Mã Xe",
      dataIndex: "vehicle_name",
      key: "vehicle_name",
      width: 100,
      sorter: (a: EndOfDayVehicle, b: EndOfDayVehicle) => a.vehicle_name.localeCompare(b.vehicle_name),
      render: (text: string) => <strong className="text-gray-800">{text}</strong>,
    },
    {
      title: "Biển số",
      dataIndex: "vehicle_license_plate",
      key: "vehicle_license_plate",
      width: 130,
      sorter: (a: EndOfDayVehicle, b: EndOfDayVehicle) => a.vehicle_license_plate.localeCompare(b.vehicle_license_plate),
      render: (text: string) => (
        <div className="inline-flex items-center justify-center px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[13px] font-bold tracking-wide shadow-sm">
          {text}
        </div>
      ),
    },
    // Cột tài xế đã bị xoá theo yêu cầu
    {
      title: "Giờ kết thúc",
      dataIndex: "finished_at",
      key: "finished_at",
      width: 130,
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
        const { operation_notes, operation_note } = record;
        
        let parts: string[] = [];
        if (operation_notes && operation_notes.length > 0) {
          parts = operation_notes;
        } else if (operation_note) {
          parts = operation_note.split(" | ");
        }

        if (parts.length === 0) return <Text type="secondary">-</Text>;

        return (
          <div className="flex flex-col gap-1.5">
            {parts.map((part, idx) => {
              const isPartAbnormal = part.toLowerCase().includes("bat thuong") || part.toLowerCase().includes("bất thường");
              return (
                <div 
                  key={idx} 
                  className={`flex items-start gap-2 text-[14.5px] leading-snug ${isPartAbnormal ? 'text-red-600 font-semibold' : 'text-gray-700 font-medium'}`}
                >
                  {isPartAbnormal ? (
                    <AlertCircle className="w-4.5 h-4.5 mt-[2px] shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4.5 h-4.5 mt-[2px] shrink-0 text-emerald-500" />
                  )}
                  <span>{part}</span>
                </div>
              );
            })}
          </div>
        );
      },
    },
  ];

  return (
    <Modal
      title={
        <div className="flex items-center gap-3 py-2 border-b">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Save className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 m-0">Nhật ký trong ngày</h3>
            {data && (
              <p className="text-sm text-gray-500 m-0 mt-0.5 font-medium">
                {dayjs(data.date).format("DD/MM/YYYY")} • Tổng: {data.total} xe
                {data.abnormal_total > 0 && (
                  <span className="text-red-500 ml-2">({data.abnormal_total} bất thường)</span>
                )}
              </p>
            )}
          </div>
        </div>
      }
      open={open}
      onCancel={onCancel}
      width={1000}
      style={{ top: 20 }}
      footer={
        <div className="flex justify-end pt-4 border-t mt-4">
          <Button 
            type="primary"
            className="h-10 px-8 font-medium rounded-lg bg-blue-600 hover:bg-blue-700"
            onClick={onCancel}
          >
            Đóng
          </Button>
        </div>
      }
      className="end-of-day-modal"
      closeIcon={false}
    >
      <div className="pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spin size="large" />
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <Table
              dataSource={data?.vehicles || []}
              columns={columns}
              rowKey="vehicle_id"
              pagination={false}
              scroll={{ y: 'calc(100vh - 350px)' }}
              size="middle"
              className="custom-table"
              rowClassName={(record) => (record.is_abnormal && record.final_status !== 'delivering') ? 'bg-red-50/30' : ''}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
