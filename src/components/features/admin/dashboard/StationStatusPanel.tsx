import stationApi from '@/services/station.service';
import type { Order } from '@/types/order';
import type { Station } from '@/types/station';
import type { DeviceStationStatus } from '@/hooks/useDeviceHeartbeat';
import { Input, Modal } from 'antd';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

interface StationStatusPanelProps {
  stations: Station[];
  orders: Order[];
  deviceStationStatusMap?: Record<string, DeviceStationStatus>;
  onStationUpdated?: () => void;
}

export default function StationStatusPanel({ stations, orders, deviceStationStatusMap = {}, onStationUpdated }: StationStatusPanelProps) {
  const t = useTranslations('DashboardPage');

  const workingStations = useMemo(() => {
    const getStationOrder = (station: Station) => {
      const match = station.station_name.match(/(\d+)/);
      return match ? Number(match[1]) : station.station_id;
    };

    return stations
      .filter((station) => station.station_types?.station_type_id === 1)
      .sort((a, b) => getStationOrder(a) - getStationOrder(b));
  }, [stations]);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [incidentStation, setIncidentStation] = useState<Station | null>(null);
  const [incidentDesc, setIncidentDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const vehiclesByStation = useMemo(() => {
    const map: Record<number, { license_plate: string; status: string; order_number: number }[]> = {};

    orders.forEach((order) => {
      const isAtStation =
        order.order_status === 'collecting' ||
        (order.station_checks?.check_in_datetime && !order.station_checks?.check_out_datetime);

      if (isAtStation && order.stations?.station_id) {
        if (!map[order.stations.station_id]) {
          map[order.stations.station_id] = [];
        }

        map[order.stations.station_id].push({
          license_plate: order.vehicles?.vehicle_license_plate || `#${order.order_id}`,
          status: order.order_status,
          order_number: order.order_number,
        });
      }
    });

    Object.values(map).forEach((items) => {
      items.sort((a, b) => a.order_number - b.order_number);
    });

    return map;
  }, [orders]);

  const nextVehicleByStation = useMemo(() => {
    const map: Record<number, { license_plate: string; order_number: number }> = {};

    orders
      .filter((order) => order.order_status === 'pending' && order.stations?.station_id)
      .sort((a, b) => a.order_number - b.order_number)
      .forEach((order) => {
        const stationId = order.stations!.station_id;
        if (!map[stationId]) {
          map[stationId] = {
            license_plate: order.vehicles?.vehicle_license_plate || `#${order.order_id}`,
            order_number: order.order_number,
          };
        }
      });

    return map;
  }, [orders]);

  const handleToggleStatus = async (station: Station) => {
    const nextStatus = station.station_status === 'operating' ? 'stopped' : 'operating';

    if (nextStatus === 'stopped' && !window.confirm(t('confirmPauseStation'))) {
      return;
    }

    setTogglingId(station.station_id);

    try {
      if (nextStatus === 'stopped') {
        await stationApi.reportStop(station.station_id);
      } else {
        await stationApi.reportOperating(station.station_id);
      }

      toast.success(`${station.station_name}: ${nextStatus === 'operating' ? t('stationRestored') : t('stationPaused')}`, {
        position: 'top-right',
      });
      onStationUpdated?.();
    } catch {
      toast.error(t('stationStatusUpdateFailed'), { position: 'top-right' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmitIncident = async () => {
    if (!incidentStation) return;
    setSubmitting(true);

    try {
      await stationApi.reportIncident(incidentStation.station_id, {
        station_incident_description: incidentDesc.trim(),
      });

      toast.success(`${incidentStation.station_name}: ${t('incidentReportSuccess')}`, {
        position: 'top-right',
      });
      setIncidentStation(null);
      setIncidentDesc('');
      onStationUpdated?.();
    } catch {
      toast.error(t('incidentReportFailed'), { position: 'top-right' });
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
      return {
        label: t('stopped'),
        style: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100',
      };
    }

    return {
      label: t('restore'),
      style: 'border border-slate-900 bg-slate-900 text-white hover:bg-slate-800',
    };
  };

  const getStatusTheme = (status: string) => {
    if (status === 'operating') {
      return {
        label: t('operating'),
        tone: 'text-emerald-700',
        dot: 'bg-emerald-500',
        chip: 'border border-emerald-500 bg-emerald-50 text-emerald-700',
      };
    }

    if (status === 'stopped') {
      return {
        label: t('stopped'),
        tone: 'text-amber-700',
        dot: 'bg-amber-500',
        chip: 'border border-amber-500 bg-amber-50 text-amber-700',
      };
    }

    if (status === 'incident') {
      return {
        label: t('incident'),
        tone: 'text-red-700',
        dot: 'bg-red-500',
        chip: 'border-2 border-red-500 bg-red-50 text-red-700',
      };
    }

    if (status === 'collecting') {
      return {
        label: t('collecting'),
        tone: 'text-sky-700',
        dot: 'bg-sky-500',
        chip: 'border border-sky-500 bg-sky-50 text-sky-700',
      };
    }

    return {
      label: t('unknown'),
      tone: 'text-slate-500',
      dot: 'bg-slate-300',
      chip: 'border border-slate-300 bg-white text-slate-500',
    };
  };

  return (
    <>
      <div className="grid w-full grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
        {workingStations.map((station) => {
          const theme = getStatusTheme(station.station_status);
          const stationVehicles = vehiclesByStation[station.station_id] || [];
          const activeVehicle = stationVehicles[0] || null;
          const remainingVehicles = Math.max(stationVehicles.length - 1, 0);
          const isToggling = togglingId === station.station_id;
          const btnConfig = getButtonConfig(station);
          const deviceStatus = deviceStationStatusMap[String(station.station_id)]?.deviceStatus;
          const nextVehicle = station.station_status === 'operating' || station.station_status === 'collecting'
            ? nextVehicleByStation[station.station_id]
            : null;

          return (
            <div
              key={station.station_id}
              className="flex min-h-[280px] flex-col border border-slate-300 bg-white transition-colors hover:border-slate-900"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-300 bg-slate-50 px-5 py-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{t('dispatchStationLabel')}</p>
                  <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{station.station_name}</h3>
                  <div className="mt-3 inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                    <span className={`h-2 w-2 ${deviceStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                    RFID {deviceStatus === 'connected' ? t('connected') : t('disconnected')}
                  </div>
                </div>

                <div className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-bold uppercase tracking-wider ${theme.chip}`}>
                  <span className={`h-2 w-2 ${theme.dot}`} />
                  {theme.label}
                </div>
              </div>

              <div className="grid flex-1 gap-3 bg-white px-5 py-4">
                <div className="border border-slate-300 bg-slate-50 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{t('vehicleUnloading')}</span>
                    <span className={`text-xs font-bold uppercase tracking-wider ${theme.tone}`}>{activeVehicle ? t('processing') : t('empty')}</span>
                  </div>

                  {activeVehicle ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-bold tracking-widest text-white">
                        <LoaderCircle className="h-4 w-4 animate-soft-spin" />
                        {activeVehicle.license_plate}
                      </span>
                      {remainingVehicles > 0 && (
                        <span className="border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900">
                          +{remainingVehicles} {t('vehicleCount')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-slate-400">{t('noVehicleAtStation')}</p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 px-2 text-slate-300">
                  <span className="h-px flex-1 bg-slate-300" />
                  <span className="flex h-8 w-8 items-center justify-center border border-slate-300 bg-white text-slate-900">
                    {nextVehicle ? <ArrowUp className="h-4 w-4 animate-flow-arrow-up" /> : <LoaderCircle className="h-4 w-4 animate-soft-spin" />}
                  </span>
                  <span className="h-px flex-1 bg-slate-300" />
                </div>

                <div className="border border-slate-300 bg-white px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-900">{t('nextVehicle')}</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('nextTurn')}</span>
                  </div>

                  {nextVehicle ? (
                    <div className="flex items-center gap-2 text-slate-900">
                      <ArrowUp className="h-4 w-4 animate-flow-arrow-up text-slate-900" />
                      <span className="text-base font-black tracking-widest">{nextVehicle.license_plate}</span>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-slate-400">{t('noNextVehicle')}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 border-t border-slate-300 bg-slate-50 px-4 py-4">
                <button
                  onClick={() => handleToggleStatus(station)}
                  disabled={isToggling}
                  className={`flex-1 cursor-pointer py-2.5 text-sm font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${btnConfig.style}`}
                >
                  {isToggling ? '...' : btnConfig.label}
                </button>

                {station.station_status !== 'incident' && (
                  <button
                    onClick={() => openIncidentModal(station)}
                    className="flex-1 cursor-pointer border border-slate-900 bg-white py-2.5 text-sm font-bold uppercase tracking-wider text-slate-900 transition-colors hover:bg-slate-900 hover:text-white"
                  >
                    {t('reportIncident')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-3">
            <div className="h-4 w-4 bg-slate-900" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">{t('incidentReportTitle')}</h2>
              <p className="mt-0.5 text-sm font-bold text-slate-500">{incidentStation?.station_name}</p>
            </div>
          </div>
        }
        open={!!incidentStation}
        onCancel={() => {
          setIncidentStation(null);
          setIncidentDesc('');
        }}
        closable={false}
        footer={
          <div className="mt-6 flex justify-end gap-3 border-t-2 border-slate-900 pt-4">
            <button
              onClick={() => {
                setIncidentStation(null);
                setIncidentDesc('');
              }}
              className="border border-slate-300 bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-900 transition-colors hover:bg-slate-100"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSubmitIncident}
              disabled={submitting}
              className="border border-slate-900 bg-slate-900 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {t('sendAndStop')}
            </button>
          </div>
        }
        className="[&_.ant-modal-content]:rounded-none [&_.ant-modal-content]:p-6 [&_.ant-modal-content]:border-2 [&_.ant-modal-content]:border-slate-900"
        styles={{
          header: { marginBottom: 0 },
          body: { paddingTop: '16px' }
        }}
        destroyOnClose
      >
        <div>
          <label className="mb-2 block text-sm font-bold uppercase tracking-wider text-slate-700">
            {t('incidentDescription')}
          </label>
          <Input.TextArea
            value={incidentDesc}
            onChange={(e) => setIncidentDesc(e.target.value)}
            placeholder={t('incidentPlaceholder')}
            rows={4}
            className="rounded-none border-slate-300 font-mono shadow-none outline-none hover:border-slate-900 focus:border-slate-900 focus:shadow-[0_0_0_1px_rgba(15,23,42,1)] transition-none"
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
