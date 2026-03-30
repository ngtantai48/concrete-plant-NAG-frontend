import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { DeviceStationStatus } from '@/hooks/useDeviceHeartbeat';
import stationApi from '@/services/station.service';
import type { Order } from '@/types/order';
import type { Station } from '@/types/station';
import { AlertTriangle, ArrowUp, LoaderCircle, Pause, Play } from 'lucide-react';
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
  const [stationToPause, setStationToPause] = useState<Station | null>(null);

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

  const performToggleStatus = async (station: Station) => {
    const nextStatus = station.station_status === 'operating' ? 'stopped' : 'operating';
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
      setStationToPause(null);
    }
  };

  const handleToggleStatus = (station: Station) => {
    if (station.station_status === 'operating') {
      setStationToPause(station);
    } else {
      performToggleStatus(station);
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

  const getButtonConfig = (station: Station) => {
    if (station.station_status === 'operating' || station.station_status === 'collecting') {
      return {
        label: t('stopped'),
        icon: <Pause className="mr-1.5 h-3.5 w-3.5" />,
        className: 'dd-btn dd-btn-ghost',
      };
    }

    return {
      label: t('restore'),
      icon: <Play className="mr-1.5 h-3.5 w-3.5" />,
      className: 'dd-btn dd-btn-primary',
    };
  };

  const getStatusTheme = (status: string) => {
    if (status === 'operating') {
      return {
        label: t('operating'),
        tone: '#34d399',
        dot: '#10b981',
        dotGlow: 'rgba(16, 185, 129, 0.5)',
        chipClass: 'dd-chip dd-chip-emerald',
        borderGlow: 'rgba(16, 185, 129, 0.2)',
      };
    }

    if (status === 'stopped') {
      return {
        label: t('stopped'),
        tone: '#fbbf24',
        dot: '#f59e0b',
        dotGlow: 'rgba(245, 158, 11, 0.5)',
        chipClass: 'dd-chip dd-chip-amber',
        borderGlow: 'rgba(245, 158, 11, 0.15)',
      };
    }

    if (status === 'incident') {
      return {
        label: t('incident'),
        tone: '#f87171',
        dot: '#ef4444',
        dotGlow: 'rgba(239, 68, 68, 0.5)',
        chipClass: 'dd-chip dd-chip-red',
        borderGlow: 'rgba(239, 68, 68, 0.2)',
      };
    }

    if (status === 'collecting') {
      return {
        label: t('collecting'),
        tone: '#38bdf8',
        dot: '#0ea5e9',
        dotGlow: 'rgba(14, 165, 233, 0.5)',
        chipClass: 'dd-chip dd-chip-sky',
        borderGlow: 'rgba(14, 165, 233, 0.2)',
      };
    }

    return {
      label: t('unknown'),
      tone: '#94a3b8',
      dot: '#64748b',
      dotGlow: 'rgba(100, 116, 139, 0.3)',
      chipClass: 'dd-chip dd-chip-slate',
      borderGlow: 'rgba(100, 116, 139, 0.1)',
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
              className="dd-card dd-glow-border flex min-h-[280px] flex-col overflow-hidden"
              style={{ borderColor: theme.borderGlow }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 px-5 py-4 rounded-t-[19px]"
                style={{ background: 'var(--dd-bg-header)', borderBottom: '1px solid var(--dd-border)' }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em]"
                    style={{ color: 'var(--dd-text-muted)' }}>
                    {t('dispatchStationLabel')}
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-tight" style={{ color: 'var(--dd-text-primary)' }}>
                    {station.station_name}
                  </h3>
                  <div className={`mt-3 dd-chip ${deviceStatus === 'connected' ? '' : 'animate-danger-blink'}`}
                    style={{
                      background: deviceStatus === 'connected' ? 'var(--dd-emerald-glow)' : 'var(--dd-red-glow)',
                      border: `1px solid ${deviceStatus === 'connected' ? 'var(--dd-emerald)' : 'var(--dd-red)'}`,
                      color: deviceStatus === 'connected' ? 'var(--dd-emerald)' : 'var(--dd-red)',
                    }}>
                    <span className="h-2 w-2 rounded-sm"
                      style={{
                        background: deviceStatus === 'connected' ? '#10b981' : '#ef4444',
                        boxShadow: `0 0 6px ${deviceStatus === 'connected' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
                        display: 'inline-block',
                      }} />
                    RFID {deviceStatus === 'connected' ? t('connected') : t('disconnected')}
                  </div>
                </div>

                <div className={theme.chipClass}>
                  <span className="h-2 w-2 rounded-full" style={{ background: theme.dot, boxShadow: `0 0 6px ${theme.dotGlow}`, display: 'inline-block' }} />
                  {theme.label}
                </div>
              </div>

              {/* Content */}
              <div className="grid flex-1 gap-3 px-5 py-4">
                {/* Active Vehicle */}
                <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--dd-bg-surface)', border: '1px solid var(--dd-border)' }}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--dd-text-muted)' }}>
                      {t('vehicleUnloading')}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.tone }}>
                      {activeVehicle ? t('processing') : t('empty')}
                    </span>
                  </div>

                  {activeVehicle ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold tracking-widest"
                        style={{
                          background: 'var(--dd-cyan-glow)',
                          border: '1px solid var(--dd-border-accent)',
                          color: 'var(--dd-text-accent)',
                        }}>
                        <LoaderCircle className="h-4 w-4 animate-soft-spin" />
                        {activeVehicle.license_plate}
                      </span>
                      {remainingVehicles > 0 && (
                        <span className="dd-chip dd-chip-slate">
                          +{remainingVehicles} {t('vehicleCount')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-bold italic" style={{ color: 'var(--dd-text-muted)', opacity: 0.6 }}>{t('noVehicleAtStation')}</p>
                  )}
                </div>

                {/* Divider Arrow */}
                <div className="flex items-center justify-center gap-3 px-2">
                  <span className="h-px flex-1" style={{ background: 'var(--dd-border)' }} />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: 'var(--dd-bg-surface)',
                      border: '1px solid var(--dd-border)',
                      color: 'var(--dd-text-accent)',
                    }}>
                    {nextVehicle ? <ArrowUp className="h-4 w-4 animate-flow-arrow-up" /> : <LoaderCircle className="h-4 w-4 animate-soft-spin" />}
                  </span>
                  <span className="h-px flex-1" style={{ background: 'var(--dd-border)' }} />
                </div>

                {/* Next Vehicle */}
                <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--dd-bg-surface)', border: '1px solid var(--dd-border)' }}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--dd-text-secondary)' }}>
                      {t('nextVehicle')}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--dd-text-muted)' }}>
                      {t('nextTurn')}
                    </span>
                  </div>

                  {nextVehicle ? (
                    <div className="flex items-center gap-2" style={{ color: 'var(--dd-text-accent)' }}>
                      <ArrowUp className="h-4 w-4 animate-flow-arrow-up" />
                      <span className="text-base font-black tracking-widest">{nextVehicle.license_plate}</span>
                    </div>
                  ) : (
                      <span className="text-[13px] italic" style={{ color: 'var(--dd-text-muted)', opacity: 0.6 }}>{t('noNextVehicle')}</span>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex gap-2 px-4 py-4 rounded-b-[19px]" style={{ background: 'var(--dd-bg-surface)', borderTop: '1px solid var(--dd-border)' }}>
                <button
                  onClick={() => handleToggleStatus(station)}
                  disabled={isToggling}
                  className={`flex items-center justify-center flex-1 disabled:cursor-not-allowed disabled:opacity-50 ${btnConfig.className}`}
                >
                  {isToggling ? <LoaderCircle className="h-4 w-4 animate-soft-spin" /> : (
                    <>
                      {btnConfig.icon}
                      {btnConfig.label}
                    </>
                  )}
                </button>

                {station.station_status !== 'incident' && (
                  <button
                    onClick={() => setIncidentStation(station)}
                    className="flex items-center justify-center flex-1 dd-btn dd-btn-danger"
                  >
                    <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                    {t('reportIncident')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!incidentStation}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setIncidentStation(null);
            setIncidentDesc('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="text-left">
                <DialogTitle className="text-xl font-bold uppercase text-slate-900">
                  {t('incidentReportTitle')}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-lg font-bold text-slate-500">
                  {incidentStation?.station_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-2">
            <label className="mb-2 block text-md font-bold uppercase text-slate-700">
              {t('incidentDescription')}
            </label>
            <Textarea
              value={incidentDesc}
              onChange={(e) => setIncidentDesc(e.target.value)}
              placeholder={t('incidentPlaceholder')}
              rows={4}
              className="font-mono bg-white"
            />
          </div>
          <DialogFooter className="mt-2 flex gap-3 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIncidentStation(null);
                setIncidentDesc('');
              }}
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmitIncident}
              disabled={!incidentDesc.trim() || submitting}
              className="font-bold uppercase"
            >
              {submitting ? "Đang xử lý..." : t('sendAndStop')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stationToPause} onOpenChange={(isOpen) => !isOpen && setStationToPause(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase text-slate-900">{t('confirmPauseStation')}</DialogTitle>
            <DialogDescription className="text-base text-slate-500">
              Bạn có chắc chắn muốn báo <strong>{stationToPause?.station_name}</strong> dừng hoạt động không? Hành động này sẽ khiến trạm tạm thời không nhận thêm xe đổ bê tông.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-3 sm:justify-end">
            <Button variant="outline" onClick={() => setStationToPause(null)}>{t('cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => stationToPause && performToggleStatus(stationToPause)}
              disabled={togglingId === stationToPause?.station_id}
            >
              {togglingId === stationToPause?.station_id ? 'Đang xử lý...' : t('stopped')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
