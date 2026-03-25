import React, { useMemo, useState } from 'react';
import type { Station } from '@/services/station.service';
import type { Order } from '@/services/order.service';
import stationApi from '@/services/station.service';
import { Modal, Input } from 'antd';
import { toast } from 'sonner';

interface StationStatusPanelProps {
  stations: Station[];
  orders: Order[];
  onStationUpdated?: () => void;
}

export default function StationStatusPanel({ stations, orders, onStationUpdated }: StationStatusPanelProps) {
  const workingStations = stations.filter(s => s.station_types?.station_type_id === 1);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [incidentStation, setIncidentStation] = useState<Station | null>(null);
  const [incidentDesc, setIncidentDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const vehiclesByStation = useMemo(() => {
    const map: Record<number, { license_plate: string; status: string }[]> = {};
    orders.forEach(o => {
      const isAtStation = o.order_status === "collecting" || 
        (o.station_checks?.check_in_datetime && !o.station_checks?.check_out_datetime);
      if (isAtStation && o.stations?.station_id) {
        if (!map[o.stations.station_id]) map[o.stations.station_id] = [];
        map[o.stations.station_id].push({
          license_plate: o.vehicles?.vehicle_license_plate || `#${o.order_id}`,
          status: o.order_status,
        });
      }
    });
    return map;
  }, [orders]);

  const nextVehicleByStation = useMemo(() => {
    const map: Record<number, string> = {};
    orders
      .filter(o => o.order_status === 'pending' && o.stations?.station_id)
      .sort((a, b) => a.order_number - b.order_number)
      .forEach(o => {
        const sId = o.stations!.station_id;
        if (!map[sId]) {
          map[sId] = o.vehicles?.vehicle_license_plate || `#${o.order_id}`;
        }
      });
    return map;
  }, [orders]);

  const handleToggleStatus = async (station: Station) => {
    const nextStatus = station.station_status === 'operating' ? 'stopped' : 'operating';
    setTogglingId(station.station_id);
    try {
      if(nextStatus === 'stopped'){
        await stationApi.reportStop(station.station_id);
      }else{
        await stationApi.reportOperating(station.station_id);
      }
      toast.success(
        `${station.station_name}: ${nextStatus === 'operating' ? 'Đã khôi phục hoạt động' : 'Đã tạm dừng'}`,
        { position: 'top-right' }
      );
      onStationUpdated?.();
    } catch {
      toast.error('Cập nhật trạng thái thất bại', { position: 'top-right' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmitIncident = async () => {
    if (!incidentStation || !incidentDesc.trim()) return;
    setSubmitting(true);
    try {
      await stationApi.reportIncident(incidentStation.station_id, {
        station_incident_description: incidentDesc.trim(),
      });
      toast.success(
        `${incidentStation.station_name}: Đã báo cáo sự cố và dừng trạm`,
        { position: 'top-right' }
      );
      setIncidentStation(null);
      setIncidentDesc('');
      onStationUpdated?.();
    } catch {
      toast.error('Gửi báo cáo sự cố thất bại', { position: 'top-right' });
    } finally {
      setSubmitting(false);
    }
  };

  const openIncidentModal = (station: Station) => {
    setIncidentStation(station);
    setIncidentDesc('');
  };

  const getButtonConfig = (station: Station) => {
    if (station.station_status === 'operating' || station.station_status === 'collecting') {
      return { label: 'TẠM DỪNG', style: 'bg-white text-amber-600 hover:bg-amber-500 hover:text-white' };
    }
    return { label: 'KHÔI PHỤC', style: 'bg-white text-emerald-600 hover:bg-emerald-600 hover:text-white' };
  };

  return (
    <>
      <div className="flex flex-wrap gap-4 items-start py-2 w-full">
        {workingStations.map((station) => {
          const getStatusTheme = (s: string) => {
            if (s === 'operating') return { code: 'H.ĐỘNG', bg: 'bg-emerald-400', txt: 'text-slate-900' };
            if (s === 'stopped') return { code: 'DỪNG', bg: 'bg-amber-400', txt: 'text-slate-900' };
            if (s === 'incident') return { code: 'S.CỐ', bg: 'bg-red-500', txt: 'text-white' };
            if (s === 'collecting') return { code: 'Đ.NHẬN', bg: 'bg-cyan-400', txt: 'text-slate-900' };
            return { code: 'UNK', bg: 'bg-slate-300', txt: 'text-slate-800' };
          };
          const theme = getStatusTheme(station.station_status);
          const stationVehicles = vehiclesByStation[station.station_id] || [];
          const isToggling = togglingId === station.station_id;
          const btnConfig = getButtonConfig(station);
          
          return (
            <div key={station.station_id} className="flex flex-col border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-40 relative transition-transform hover:-translate-y-1 hover:shadow-[4px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className={`px-2 py-1 text-[10px] font-black tracking-widest uppercase border-b-2 border-slate-900 flex justify-between items-center ${theme.bg} ${theme.txt}`}>
                <span>TRẠNG THÁI</span>
                <span>{theme.code}</span>
              </div>
              
              <div className="p-3 bg-slate-50 flex-1 flex items-center justify-center font-mono font-bold text-center border-b-2 border-slate-900 min-h-[50px] text-lg leading-tight uppercase text-slate-800">
                {station.station_name}
              </div>

              <div className="border-b-2 border-slate-900 px-2 py-1.5 bg-white">
                {stationVehicles.length === 0 ? (
                  <p className="text-[10px] font-mono text-slate-400 uppercase text-center tracking-wider">Trống</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {stationVehicles.map((v, i) => (
                      <span key={i} className="text-[9px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 border border-blue-200">
                        {v.license_plate}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {station.station_status === 'operating' && nextVehicleByStation[station.station_id] && (
                <div className="px-2 py-1.5 bg-amber-50 border-b-2 border-slate-900 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-[9px] font-mono font-bold text-amber-700 uppercase">
                    SẮp tới: {nextVehicleByStation[station.station_id]}
                  </span>
                </div>
              )}

              <div className="flex divide-x-2 divide-slate-900 border-t-2 border-slate-900">
                <button
                  onClick={() => handleToggleStatus(station)}
                  disabled={isToggling}
                  className={`flex-1 py-2 text-[10px] font-mono font-black uppercase tracking-widest transition-colors border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${btnConfig.style}`}
                >
                  {isToggling ? '...' : btnConfig.label}
                </button>
                {station.station_status !== 'incident' && (
                  <button
                    onClick={() => openIncidentModal(station)}
                    className="flex-1 py-2 text-[10px] font-mono font-black uppercase tracking-widest transition-colors border-0 cursor-pointer bg-white text-red-600 hover:bg-red-600 hover:text-white"
                  >
                    SỰ CỐ
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
            <div className="w-3 h-3 bg-red-500 border border-slate-900" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">
                Báo cáo sự cố
              </h2>
              <p className="text-sm font-normal text-slate-500 mt-0.5">
                {incidentStation?.station_name}
              </p>
            </div>
          </div>
        }
        open={!!incidentStation}
        onCancel={() => { setIncidentStation(null); setIncidentDesc(''); }}
        onOk={handleSubmitIncident}
        okText="Gửi & Dừng trạm"
        cancelText="Huỷ"
        confirmLoading={submitting}
        okButtonProps={{ 
          danger: true, 
          disabled: !incidentDesc.trim(),
          className: 'font-bold uppercase'
        }}
        destroyOnClose
      >
        <div className="py-4">
          <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
            Mô tả sự cố
          </label>
          <Input.TextArea
            value={incidentDesc}
            onChange={(e) => setIncidentDesc(e.target.value)}
            placeholder="Nhập chi tiết sự cố tại trạm..."
            rows={4}
            className="font-mono"
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
