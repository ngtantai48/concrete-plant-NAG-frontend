import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import type { Station } from '@/services/station.service';
import type { Order } from '@/services/order.service';
import stationApi from '@/services/station.service';
import { Input, Modal } from 'antd';
import { toast } from 'sonner';

interface StationStatusPanelProps {
  stations: Station[];
  orders: Order[];
  onStationUpdated?: () => void;
}

export default function StationStatusPanel({ stations, orders, onStationUpdated }: StationStatusPanelProps) {
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
    if (!incidentStation || !incidentDesc.trim()) return;
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
        style: 'bg-white text-amber-600 hover:bg-amber-50',
      };
    }

    return {
      label: t('restore'),
      style: 'bg-white text-emerald-600 hover:bg-emerald-50',
    };
  };

  const getStatusTheme = (status: string) => {
    if (status === 'operating') {
      return {
        label: t('operating'),
        tone: 'text-emerald-600',
        dot: 'bg-emerald-500',
        chip: 'bg-emerald-50 text-emerald-600',
      };
    }

    if (status === 'stopped') {
      return {
        label: t('stopped'),
        tone: 'text-amber-600',
        dot: 'bg-amber-500',
        chip: 'bg-amber-50 text-amber-600',
      };
    }

    if (status === 'incident') {
      return {
        label: t('incident'),
        tone: 'text-red-700',
        dot: 'bg-red-500',
        chip: 'bg-red-50 text-red-700',
      };
    }

    if (status === 'collecting') {
      return {
        label: t('collecting'),
        tone: 'text-sky-600',
        dot: 'bg-sky-500',
        chip: 'bg-sky-50 text-sky-600',
      };
    }

    return {
      label: t('unknown'),
      tone: 'text-slate-600',
      dot: 'bg-slate-400',
      chip: 'bg-slate-100 text-slate-600',
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
          const nextVehicle = station.station_status === 'operating' || station.station_status === 'collecting'
            ? nextVehicleByStation[station.station_id]
            : null;

          return (
            <div
              key={station.station_id}
              className="flex min-h-[280px] flex-col overflow-hidden rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(250,250,250,1))] shadow-[0_0_0_1px_rgba(51,65,85,0.18),0_10px_24px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-start justify-between gap-4 bg-slate-50 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{t('dispatchStationLabel')}</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{station.station_name}</h3>
                </div>

                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${theme.chip}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${theme.dot}`} />
                  {theme.label}
                </div>
              </div>

              <div className="grid flex-1 gap-3 bg-slate-100/70 px-5 py-4">
                <div className="rounded-2xl bg-white px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{t('vehicleUnloading')}</span>
                    <span className={`text-xs font-semibold ${theme.tone}`}>{activeVehicle ? t('processing') : t('empty')}</span>
                  </div>

                  {activeVehicle ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white">
                        <LoaderCircle className="h-4 w-4 animate-soft-spin text-amber-200" />
                        {activeVehicle.license_plate}
                      </span>
                      {remainingVehicles > 0 && (
                        <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                          +{remainingVehicles} {t('vehicleCount')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-slate-400">{t('noVehicleAtStation')}</p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 px-2 text-slate-300">
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sky-500 shadow-[0_0_0_1px_rgba(148,163,184,0.2)]">
                    {nextVehicle ? <ArrowUp className="h-4 w-4 animate-flow-arrow-up" /> : <LoaderCircle className="h-4 w-4 animate-soft-spin" />}
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                </div>

                <div className="rounded-2xl bg-sky-50 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-600">{t('nextVehicle')}</span>
                    <span className="text-xs font-semibold text-sky-600">{t('nextTurn')}</span>
                  </div>

                  {nextVehicle ? (
                    <div className="flex items-center gap-2 text-sky-700">
                      <ArrowUp className="h-4 w-4 animate-flow-arrow-up text-sky-500" />
                      <span className="text-base font-semibold tracking-tight">{nextVehicle.license_plate}</span>
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-slate-400">{t('noNextVehicle')}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 bg-white px-4 py-4">
                <button
                  onClick={() => handleToggleStatus(station)}
                  disabled={isToggling}
                  className={`flex-1 cursor-pointer rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${btnConfig.style}`}
                >
                  {isToggling ? '...' : btnConfig.label}
                </button>

                {station.station_status !== 'incident' && (
                  <button
                    onClick={() => openIncidentModal(station)}
                    className="flex-1 cursor-pointer rounded-xl bg-red-100 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500 hover:text-white"
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
          <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
            <div className="h-3 w-3 border border-slate-900 bg-red-500" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-slate-900">{t('incidentReportTitle')}</h2>
              <p className="mt-0.5 text-sm font-normal text-slate-500">{incidentStation?.station_name}</p>
            </div>
          </div>
        }
        open={!!incidentStation}
        onCancel={() => {
          setIncidentStation(null);
          setIncidentDesc('');
        }}
        onOk={handleSubmitIncident}
        okText={t('sendAndStop')}
        cancelText={t('cancel')}
        confirmLoading={submitting}
        okButtonProps={{
          danger: true,
          disabled: !incidentDesc.trim(),
          className: 'font-bold uppercase',
        }}
        destroyOnClose
      >
        <div className="py-4">
          <label className="mb-2 block text-sm font-bold uppercase tracking-wider text-slate-700">
            {t('incidentDescription')}
          </label>
          <Input.TextArea
            value={incidentDesc}
            onChange={(e) => setIncidentDesc(e.target.value)}
            placeholder={t('incidentPlaceholder')}
            rows={4}
            className="font-mono"
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
