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
          license_plate: order.vehicles?.vehicle_license_plate ? `${order.vehicles.vehicle_license_plate}${order.vehicles.vehicle_name ? ` | ${order.vehicles.vehicle_name}` : ''}` : `#${order.order_id}`,
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
      .filter((order) => order.order_status === 'pending' && order.stations?.station_id && order.vehicles?.vehicle_status === 'available')
      .sort((a, b) => a.order_number - b.order_number)
      .forEach((order) => {
        const stationId = order.stations!.station_id;
        if (!map[stationId]) {
          map[stationId] = {
            license_plate: order.vehicles?.vehicle_license_plate ? `${order.vehicles.vehicle_license_plate}${order.vehicles.vehicle_name ? ` | ${order.vehicles.vehicle_name}` : ''}` : `#${order.order_id}`,
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
        icon: <Pause className="mr-1.5 h-3 w-3" />,
        variant: 'secondary' as const,
      };
    }

    return {
      label: t('restore'),
      icon: <Play className="mr-1.5 h-3 w-3" />,
      variant: 'default' as const,
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
      <div className="grid w-full grid-cols-1 items-stretch gap-2 md:grid-cols-2 xl:grid-cols-3">
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
              className="dd-card dd-glow-border flex min-h-0 flex-row overflow-hidden"
              style={{ borderColor: theme.borderGlow }}
            >
              {/* Left — Header + Vehicle Info */}
              <div className="flex flex-col flex-1 min-w-0 px-3 py-1.5">
                {/* Header — Name | RFID | Status */}
                <div className="flex items-center flex-wrap gap-1.5 px-1 py-0.5 rounded-tl-[7px]">
                  <h3 className="text-base font-black whitespace-nowrap" style={{ color: 'var(--dd-text-primary)' }}>
                    {station.station_name}
                  </h3>
                  <div className={`inline-flex items-center gap-1 dd-chip text-[10px] px-1.5 py-0.5 shrink-0 ${deviceStatus === 'connected' ? '' : 'animate-danger-blink'}`}
                    style={{
                      background: deviceStatus === 'connected' ? 'var(--dd-emerald-glow)' : 'var(--dd-red-glow)',
                      border: `1px solid ${deviceStatus === 'connected' ? 'var(--dd-emerald)' : 'var(--dd-red)'}`,
                      color: deviceStatus === 'connected' ? 'var(--dd-emerald)' : 'var(--dd-red)',
                    }}>
                    <span className="h-1.5 w-1.5 rounded-sm"
                      style={{
                        background: deviceStatus === 'connected' ? '#10b981' : '#ef4444',
                        boxShadow: `0 0 4px ${deviceStatus === 'connected' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
                        display: 'inline-block',
                      }} />
                    RFID {deviceStatus === 'connected' ? t('connected') : t('disconnected')}
                  </div>
                  <div className={`${theme.chipClass} text-[10px] px-2 py-0.5 shrink-0 ml-auto`}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.dot, boxShadow: `0 0 4px ${theme.dotGlow}`, display: 'inline-block' }} />
                    {theme.label}
                  </div>
                </div>

                {/* Content — compact vehicle info */}
                <div className="flex flex-col flex-1 gap-1 px-1 py-1">
                  {/* Active Vehicle */}
                  <div className="rounded-md px-2 py-1 shadow-sm" style={{ background: 'var(--dd-bg-surface)', border: '1px solid var(--dd-border)' }}>
                    <div className="flex items-center justify-between gap-2 min-h-[28px]">
                      <span className="text-xs font-bold uppercase" style={{ color: 'var(--dd-text-muted)' }}>
                        {t('vehicleUnloading')}
                      </span>
                      {activeVehicle ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold"
                            style={{
                              background: 'var(--dd-cyan-glow)',
                              border: '1px solid var(--dd-border-accent)',
                              color: 'var(--dd-text-accent)',
                            }}>
                            <LoaderCircle className="h-2.5 w-2.5 animate-soft-spin" />
                            {activeVehicle.license_plate}
                          </span>
                          {remainingVehicles > 0 && (
                            <span className="dd-chip dd-chip-slate text-[10px] px-1 py-0.5">
                              +{remainingVehicles}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs italic" style={{ color: 'var(--dd-text-muted)', opacity: 0.5 }}>{t('noVehicleAtStation')}</span>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  {/* <div className="flex items-center justify-center gap-1 px-1">
                    <span className="h-px flex-1" style={{ background: 'var(--dd-border)' }} />
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full"
                      style={{
                        background: 'var(--dd-bg-surface)',
                        border: '1px solid var(--dd-border)',
                        color: 'var(--dd-text-accent)',
                      }}>
                      {nextVehicle ? <ArrowUp className="h-3 w-3 animate-flow-arrow-up" /> : <LoaderCircle className="h-3 w-3 animate-soft-spin" />}
                    </span>
                    <span className="h-px flex-1" style={{ background: 'var(--dd-border)' }} />
                  </div> */}

                  {/* Next Vehicle */}
                  {/* <div className="rounded-md px-2 py-1.5 shadow-sm" style={{ background: 'var(--dd-bg-surface)', border: '1px solid var(--dd-border)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--dd-text-secondary)' }}>
                        {t('nextVehicle')}
                      </span>
                      {nextVehicle ? (
                        <div className="flex items-center gap-1" style={{ color: 'var(--dd-text-accent)' }}>
                          <ArrowUp className="h-2.5 w-2.5 animate-flow-arrow-up" />
                          <span className="text-xs font-black">{nextVehicle.license_plate}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] italic" style={{ color: 'var(--dd-text-muted)', opacity: 0.5 }}>{t('noNextVehicle')}</span>
                      )}
                    </div>
                  </div> */}
                </div>
              </div>

              {/* Right — Action Buttons stacked vertically (HIDDEN) */}
              {/* <div className="flex flex-col shrink-0" style={{ borderLeft: '1px solid var(--dd-border)' }}>
                <Button
                  variant={btnConfig.variant}
                  size="sm"
                  onClick={() => handleToggleStatus(station)}
                  disabled={isToggling}
                  className="flex-1 h-auto text-[10px] px-3 uppercase font-bold rounded-none rounded-tr-[7px]"
                  style={{ borderBottom: '1px solid var(--dd-border)' }}
                >
                  {isToggling ? <LoaderCircle className="h-3 w-3 animate-soft-spin" /> : (
                    <div className="flex flex-col items-center gap-0.5">
                      {btnConfig.icon}
                      {btnConfig.label}
                    </div>
                  )}
                </Button>
                {station.station_status !== 'incident' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIncidentStation(station)}
                    className="flex-1 h-auto text-[10px] px-3 uppercase font-bold text-rose-500 border-0 hover:bg-rose-50 hover:text-rose-600 rounded-none rounded-br-[7px]"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" />
                      {t('reportIncident')}
                    </div>
                  </Button>
                )}
              </div> */}
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
                <DialogTitle className="text-2xl font-bold uppercase text-slate-900">
                  {t('incidentReportTitle')}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xl font-bold text-slate-500">
                  {incidentStation?.station_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-2">
            <label className="mb-2 block text-lg font-bold uppercase text-slate-700">
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
            <DialogDescription className="text-lg text-slate-500">
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
