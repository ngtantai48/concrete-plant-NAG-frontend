import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeviceStationStatus } from "@/hooks/useDeviceHeartbeat";
import stationApi from "@/services/station.service";
import transportApi from "@/services/transport.service";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import { LogIn, LogOut, RotateCw, Video, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

interface StationStatusPanelProps {
  stations: Station[];
  orders: Order[];
  deviceStationStatusMap?: Record<string, DeviceStationStatus>;
  onStationUpdated?: () => void;
  pendingOrders?: Order[];
  hasManualFallbackAccess?: boolean;
  yardOrders?: Order[];
  isPastDate?: boolean;
}

const EMPTY_DEVICE_STATION_STATUS_MAP: Record<string, DeviceStationStatus> = {};

interface CameraFeedConfig {
  name: string;       // Nhãn hiển thị, ví dụ: "Hướng xe vào (Cổng A)"
  port: string;       // Cổng NAT được ánh xạ
  channel?: string;   // Kênh Hikvision (mặc định '102')
}

// Cấu hình linh hoạt camera cho các trạm (STATION_CAMERAS_CONFIG)
const STATION_CAMERAS_CONFIG: Record<number, CameraFeedConfig[]> = {
  1: [
    {
      name: "Trạm C (Hướng chính)",
      port: "81",
      channel: "102"
    },
    {
      name: "Trạm C (Hướng phụ)",
      port: "83",
      channel: "102"
    }
  ]
};

// Hàm phân giải danh sách camera động cho từng trạm
const getStationCameras = (station: Station): CameraFeedConfig[] => {
  const configured = STATION_CAMERAS_CONFIG[station.station_id];
  if (configured && configured.length > 0) {
    return configured;
  }

  // Phân giải cổng mặc định (fallback) cho các trạm thông thường khác
  const defaultPort = station.station_id === 2 ? "82" : "80";
  return [
    {
      name: `Camera ${station.station_name}`,
      port: defaultPort,
      channel: "102"
    }
  ];
};

const StationStatusPanel = ({
  stations,
  orders,
  deviceStationStatusMap = EMPTY_DEVICE_STATION_STATUS_MAP,
  onStationUpdated,
  pendingOrders = [],
  hasManualFallbackAccess = false,
  yardOrders = [],
  isPastDate = false,
}: StationStatusPanelProps) => {
  const t = useTranslations("DashboardPage");

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
  const [incidentDesc, setIncidentDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stationToPause, setStationToPause] = useState<Station | null>(null);
  const [viewingCameraStation, setViewingCameraStation] = useState<Station | null>(null);
  const [cameraKey, setCameraKey] = useState(() => Date.now());

  const activeCameras = useMemo(() => {
    if (!viewingCameraStation) return [];
    return getStationCameras(viewingCameraStation);
  }, [viewingCameraStation]);

  // Manual camera fallback states
  const [manualEntryStation, setManualEntryStation] = useState<Station | null>(null);
  const [manualEntrySubmitting, setManualEntrySubmitting] = useState<number | null>(null);
  const [confirmManualEntryOrder, setConfirmManualEntryOrder] = useState<{ order: Order; station: Station } | null>(null);
  const [manualExitOrder, setManualExitOrder] = useState<{ order: Order; station: Station } | null>(null);
  const [manualExitSubmitting, setManualExitSubmitting] = useState(false);

  const vehiclesByStation = useMemo(() => {
    const map: Record<number, { license_plate: string; status: string; order_number: number }[]> = {};
    // Use yardOrders (current active vehicles) only if we are looking at today.
    // If looking at a past date, only use the historical 'orders' array for that day.
    const source = (!isPastDate && yardOrders.length > 0) ? yardOrders : orders;

    source.forEach((order) => {
      const isAtStation =
        order.order_status === "collecting" ||
        (order.station_checks?.check_in_datetime && !order.station_checks?.check_out_datetime);

      if (isAtStation && order.stations?.station_id) {
        if (!map[order.stations.station_id]) {
          map[order.stations.station_id] = [];
        }

        map[order.stations.station_id].push({
          license_plate: order.vehicles?.vehicle_license_plate
            ? `${order.vehicles.vehicle_license_plate}${order.vehicles.vehicle_name ? ` | ${order.vehicles.vehicle_name}` : ""
            }`
            : `#${order.order_id}`,
          status: order.order_status,
          order_number: order.order_number,
        });
      }
    });

    Object.values(map).forEach((items) => {
      items.sort((a, b) => a.order_number - b.order_number);
    });

    return map;
  }, [orders, yardOrders, isPastDate]);

  const performToggleStatus = async (station: Station) => {
    const nextStatus = station.station_status === "operating" ? "stopped" : "operating";
    setTogglingId(station.station_id);

    try {
      if (nextStatus === "stopped") {
        await stationApi.reportStop(station.station_id);
      } else {
        await stationApi.reportOperating(station.station_id);
      }

      toast.success(`${station.station_name}: ${nextStatus === "operating" ? t("stationRestored") : t("stationPaused")}`,
        { position: "top-right" },
      );
      onStationUpdated?.();
    } catch {
      toast.error(t("stationStatusUpdateFailed"), { position: "top-right" });
    } finally {
      setTogglingId(null);
      setStationToPause(null);
    }
  };

  const handleSubmitIncident = async () => {
    if (!incidentStation) return;
    setSubmitting(true);

    try {
      await stationApi.reportIncident(incidentStation.station_id, {
        station_incident_description: incidentDesc.trim(),
      });

      toast.success(`${incidentStation.station_name}: ${t("incidentReportSuccess")}`, { position: "top-right" });
      setIncidentStation(null);
      setIncidentDesc("");
      onStationUpdated?.();
    } catch {
      toast.error(t("incidentReportFailed"), { position: "top-right" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenCamera = (station: Station) => {
    setCameraKey(Date.now());
    setViewingCameraStation(station);
  };

  // ─── Manual Camera Fallback: Vehicle Enter Station ───
  const collectingOrdersByStation = useMemo(() => {
    const map: Record<number, Order[]> = {};
    // Use yardOrders only for the current date to ensure manual fallback logic 
    // works for orders started on previous days but still active.
    const source = (!isPastDate && yardOrders.length > 0) ? yardOrders : orders;
    source.forEach((order) => {
      if (order.order_status === "collecting" && order.stations?.station_id) {
        if (!map[order.stations.station_id]) {
          map[order.stations.station_id] = [];
        }
        map[order.stations.station_id].push(order);
      }
    });
    return map;
  }, [orders, yardOrders, isPastDate]);

  const handleManualEntry = useCallback(async () => {
    if (!confirmManualEntryOrder) return;
    const { order, station } = confirmManualEntryOrder;
    setManualEntrySubmitting(order.order_id);
    try {
      const vehicleName = order.vehicles?.vehicle_name;
      if (!vehicleName) {
        toast.error(t('manualEntryFailed'), { position: 'top-right' });
        return;
      }
      await transportApi.cmrStationCheck({
        vehicle_name: vehicleName,
        station_id: station.station_id,
      });
      toast.success(
        t('manualEntrySuccess', {
          vehiclePlate: order.vehicles?.vehicle_license_plate
            ? `${order.vehicles.vehicle_license_plate}${order.vehicles.vehicle_name ? ` | ${order.vehicles.vehicle_name}` : ''}`
            : `#${order.order_id}`,
          stationName: station.station_name,
        }),
        { position: 'top-right' },
      );
      setManualEntryStation(null);
      setConfirmManualEntryOrder(null);
      onStationUpdated?.();
    } catch {
      toast.error(t('manualEntryFailed'), { position: 'top-right' });
    } finally {
      setManualEntrySubmitting(null);
    }
  }, [confirmManualEntryOrder, onStationUpdated, t]);

  // ─── Manual Camera Fallback: Vehicle Leave Station ───
  const handleManualExit = useCallback(async () => {
    if (!manualExitOrder) return;
    setManualExitSubmitting(true);
    try {
      await transportApi.cmrStationCheckout({
        station_id: manualExitOrder.station.station_id,
      });
      toast.success(
        t('manualExitSuccess', {
          vehiclePlate: manualExitOrder.order.vehicles?.vehicle_license_plate
            ? `${manualExitOrder.order.vehicles.vehicle_license_plate}${manualExitOrder.order.vehicles.vehicle_name ? ` | ${manualExitOrder.order.vehicles.vehicle_name}` : ''}`
            : `#${manualExitOrder.order.order_id}`,
          stationName: manualExitOrder.station.station_name,
        }),
        { position: 'top-right' },
      );
      setManualExitOrder(null);
      onStationUpdated?.();
    } catch {
      toast.error(t('manualExitFailed'), { position: 'top-right' });
    } finally {
      setManualExitSubmitting(false);
    }
  }, [manualExitOrder, onStationUpdated, t]);

  const getStatusTheme = (status: string) => {
    if (status === "operating") {
      return {
        label: t("operating"),
        tone: "#34d399",
        dot: "#10b981",
        dotGlow: "rgba(16, 185, 129, 0.5)",
        chipClass: "dd-chip dd-chip-emerald",
        borderGlow: "rgba(16, 185, 129, 0.2)",
      };
    }

    if (status === "stopped") {
      return {
        label: t("stopped"),
        tone: "#fbbf24",
        dot: "#f59e0b",
        dotGlow: "rgba(245, 158, 11, 0.5)",
        chipClass: "dd-chip dd-chip-amber",
        borderGlow: "rgba(245, 158, 11, 0.15)",
      };
    }

    if (status === "incident") {
      return {
        label: t("incident"),
        tone: "#f87171",
        dot: "#ef4444",
        dotGlow: "rgba(239, 68, 68, 0.5)",
        chipClass: "dd-chip dd-chip-red",
        borderGlow: "rgba(239, 68, 68, 0.2)",
      };
    }

    if (status === "collecting") {
      return {
        label: t("collecting"),
        tone: "#38bdf8",
        dot: "#0ea5e9",
        dotGlow: "rgba(14, 165, 233, 0.5)",
        chipClass: "dd-chip dd-chip-sky",
        borderGlow: "rgba(14, 165, 233, 0.2)",
      };
    }

    return {
      label: t("unknown"),
      tone: "#94a3b8",
      dot: "#64748b",
      dotGlow: "rgba(100, 116, 139, 0.3)",
      chipClass: "dd-chip dd-chip-slate",
      borderGlow: "rgba(100, 116, 139, 0.1)",
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
          const deviceStatus = deviceStationStatusMap[String(station.station_id)]?.cameraStatus;
          const cameraStatusClass =
            deviceStatus === "connected"
              ? "border-emerald-200 bg-emerald-50/50 text-emerald-600"
              : deviceStatus === "disconnected"
                ? "animate-pulse border-red-200 bg-red-50/50 text-red-600"
                : "border-slate-200 bg-slate-50/80 text-slate-500";
          const cameraStatusLabel =
            deviceStatus === "connected"
              ? t("cameraConnected")
              : deviceStatus === "disconnected"
                ? t("cameraDisconnected")
                : t("cameraChecking");

          return (
            <div
              key={station.station_id}
              className="dd-card dd-glow-border flex min-h-0 flex-row overflow-hidden"
              style={{ borderColor: theme.borderGlow }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
                <div className="flex flex-wrap items-center gap-2 p-1">
                  <h3 className="whitespace-nowrap text-base font-black text-slate-900">
                    {station.station_name}
                  </h3>

                  <Badge onClick={() => handleOpenCamera(station)}
                    className={`shrink-0 cursor-pointer text-sm transition-all hover:bg-slate-300 ${cameraStatusClass}`}
                  >
                    {cameraStatusLabel}
                  </Badge>

                  <Badge
                    variant="secondary"
                    className={`ml-auto h-7 shrink-0 gap-1.5 px-2.5 py-0 text-sm font-normal shadow-none ${station.station_status === "operating"
                      ? "border-transparent bg-emerald-100 text-emerald-700"
                      : station.station_status === "stopped"
                        ? "border-transparent bg-amber-100 text-amber-700"
                        : station.station_status === "incident"
                          ? "border-transparent bg-red-100 text-red-700"
                          : station.station_status === "collecting"
                            ? "border-transparent bg-sky-100 text-sky-700"
                            : "border-transparent bg-slate-100 text-slate-700"
                      }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.dot }} />
                    {theme.label}
                  </Badge>
                </div>

                <div className="flex flex-1 flex-col gap-1 p-1">
                  <div
                    className="rounded-md px-3 py-1 shadow-sm"
                    style={{ border: "1px solid var(--dd-border)" }}
                  >
                    <div className="flex min-h-7 items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase">{t("vehicleUnloading")}</span>

                        {hasManualFallbackAccess && deviceStatus === "disconnected" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="iconSquare"
                                className={`h-6 w-6 transition-all ${activeVehicle
                                  ? "text-amber-500 hover:text-amber-800 hover:border-amber-400"
                                  : "text-sky-500 hover:text-sky-800 hover:border-sky-400"
                                  }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activeVehicle) {
                                    const stationCollecting = collectingOrdersByStation[station.station_id];
                                    if (stationCollecting && stationCollecting.length > 0) {
                                      setManualExitOrder({ order: stationCollecting[0], station });
                                    }
                                  } else {
                                    setManualEntryStation(station);
                                  }
                                }}
                              >
                                {activeVehicle ? <LogOut /> : <LogIn />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              {activeVehicle ? t("manualVehicleExit") : t("manualVehicleEntry")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>

                      {activeVehicle ? (
                        <div className="flex items-center">
                          <span
                            className="inline-flex items-center gap-2 rounded-md text-sm font-black"
                            style={{ color: "var(--dd-text-accent)" }}
                          >
                            <RotateCw className="h-4 w-4 animate-spin" />
                            {activeVehicle.license_plate}
                          </span>
                          {remainingVehicles > 0 && (
                            <span className="dd-chip dd-chip-slate px-1 py-0.5 text-[10px]">
                              +{remainingVehicles}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs italic">{t("noVehicleAtStation")}</span>
                      )}
                    </div>
                  </div>


                </div>
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
            setIncidentDesc("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="text-left">
                <DialogTitle className="text-2xl font-bold uppercase text-slate-900">
                  {t("incidentReportTitle")}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xl font-bold text-slate-500">
                  {incidentStation?.station_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-2">
            <label className="mb-2 block text-lg font-bold uppercase text-slate-700">
              {t("incidentDescription")}
            </label>
            <Textarea
              value={incidentDesc}
              onChange={(e) => setIncidentDesc(e.target.value)}
              placeholder={t("incidentPlaceholder")}
              rows={4}
              className="bg-white font-mono"
            />
          </div>
          <DialogFooter className="mt-2 flex gap-3 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIncidentStation(null);
                setIncidentDesc("");
              }}
              disabled={submitting}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmitIncident}
              disabled={!incidentDesc.trim() || submitting}
              className="font-bold uppercase"
            >
              {submitting ? t("processing") : t("sendAndStop")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stationToPause} onOpenChange={(isOpen) => !isOpen && setStationToPause(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase text-slate-900">
              {t("confirmPauseStation")}
            </DialogTitle>
            <DialogDescription className="text-lg text-slate-500">
              {t.rich("confirmStopStationDescription", {
                stationName: stationToPause?.station_name ?? "",
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-3 sm:justify-end">
            <Button variant="outline" onClick={() => setStationToPause(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => stationToPause && performToggleStatus(stationToPause)}
              disabled={togglingId === stationToPause?.station_id}
            >
              {togglingId === stationToPause?.station_id ? t("processing") : t("stopped")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Manual Entry Dialog: Choose a pending vehicle ─── */}
      <Dialog
        open={!!manualEntryStation}
        onOpenChange={(isOpen) => {
          if (!isOpen) setManualEntryStation(null);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Wrench className="h-5 w-5 text-sky-500" />
              <div className="text-left">
                <DialogTitle className="text-lg font-bold uppercase text-slate-900">
                  {t("manualEntryTitle")} — {manualEntryStation?.station_name}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-slate-500">
                  {t("manualEntryDescription", { stationName: manualEntryStation?.station_name ?? "" })}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2">
            {pendingOrders.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm font-bold uppercase text-slate-400">
                {t("manualNoPendingVehicles")}
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pendingOrders.map((order, idx) => {
                  const plate = order.vehicles?.vehicle_license_plate
                    ? `${order.vehicles.vehicle_license_plate}${order.vehicles.vehicle_name ? ` | ${order.vehicles.vehicle_name}` : ""}`
                    : `#${order.order_id}`;
                  const isSubmitting = manualEntrySubmitting === order.order_id;
                  return (
                    <li
                      key={order.order_id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:border-sky-300 hover:bg-sky-50/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold"
                          style={{ background: "rgba(14, 165, 233, 0.1)", color: "#0ea5e9" }}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-base font-bold">{plate}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => manualEntryStation && setConfirmManualEntryOrder({ order, station: manualEntryStation })}
                        disabled={isSubmitting || manualEntrySubmitting !== null}
                        className="text-xs font-bold uppercase text-sky-700 hover:bg-sky-100 shrink-0"
                      >
                        {isSubmitting ? (<RotateCw className="animate-spin" />) : (<LogIn />)}
                        {t("manualSelectVehicleToEnter")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter className="mt-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setManualEntryStation(null)}
              disabled={manualEntrySubmitting !== null}
            >
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Manual Exit Dialog: Confirm vehicle leaving ─── */}
      <Dialog
        open={!!manualExitOrder}
        onOpenChange={(isOpen) => {
          if (!isOpen) setManualExitOrder(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <div className="text-left">
                <DialogTitle className="text-lg font-bold uppercase text-slate-900">
                  {t("manualExitTitle")}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-slate-500">
                  {t("manualExitDescription", {
                    vehiclePlate: manualExitOrder?.order.vehicles?.vehicle_license_plate
                      ? `${manualExitOrder.order.vehicles.vehicle_license_plate}${manualExitOrder.order.vehicles.vehicle_name ? ` | ${manualExitOrder.order.vehicles.vehicle_name}` : ""}`
                      : `#${manualExitOrder?.order.order_id ?? ""}`,
                    stationName: manualExitOrder?.station.station_name ?? "",
                  })}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-3 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setManualExitOrder(null)}
              disabled={manualExitSubmitting}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={handleManualExit}
              disabled={manualExitSubmitting}
              className="gap-1.5 font-bold uppercase bg-amber-500 hover:bg-amber-600 text-white"
            >
              {manualExitSubmitting ? (
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              {t("manualExitConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Manual Entry Confirmation Dialog ─── */}
      <Dialog
        open={!!confirmManualEntryOrder}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirmManualEntryOrder(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <div className="text-left">
                <DialogTitle className="text-lg font-bold uppercase text-slate-900">
                  {t("manualEntryConfirmTitle")}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-slate-500">
                  {t("manualEntryConfirmDescription", {
                    vehiclePlate: confirmManualEntryOrder?.order.vehicles?.vehicle_license_plate
                      ? `${confirmManualEntryOrder.order.vehicles.vehicle_license_plate}${confirmManualEntryOrder.order.vehicles.vehicle_name ? ` | ${confirmManualEntryOrder.order.vehicles.vehicle_name}` : ""}`
                      : `#${confirmManualEntryOrder?.order.order_id ?? ""}`,
                    stationName: confirmManualEntryOrder?.station.station_name ?? "",
                  })}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-3 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setConfirmManualEntryOrder(null)}
              disabled={manualEntrySubmitting !== null}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={handleManualEntry}
              disabled={manualEntrySubmitting !== null}
              className="gap-1.5 font-bold uppercase bg-sky-500 hover:bg-sky-600 text-white"
            >
              {manualEntrySubmitting !== null ? (<RotateCw className="animate-spin" />) : (<LogIn />)}
              {t("manualEntryConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewingCameraStation}
        onOpenChange={(isOpen) => !isOpen && setViewingCameraStation(null)}
      >
        <DialogContent className={`flex max-h-[90vh] flex-col bg-white/95 p-4 backdrop-blur-md transition-all duration-300 ${activeCameras.length > 1 ? "sm:max-w-6xl" : "sm:max-w-3xl"}`}>
          <DialogHeader className="flex-none">
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-800">
              <Video className="h-5 w-5 text-indigo-500" />
              Camera Giám Sát - {viewingCameraStation?.station_name}
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-slate-500">
              IP: {viewingCameraStation?.station_ip_address || "Chưa cấu hình"}
              {activeCameras.length === 1 && ` | Port: ${activeCameras[0].port}`}
            </DialogDescription>
          </DialogHeader>

          {viewingCameraStation?.station_ip_address ? (
            <div className={`grid w-full gap-4 ${activeCameras.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              {activeCameras.map((cam, idx) => (
                <div key={idx} className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-black shadow-inner">
                  {/* Nhãn Tên Camera Đẹp Mắt */}
                  <div className="absolute left-3 top-3 z-10 rounded bg-black/60 px-2 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
                    {cam.name}
                  </div>
                  <img className="h-full w-full bg-black object-contain" alt={cam.name} loading="eager" decoding="async"
                    src={`/api/camera/proxy?ip=${viewingCameraStation.station_ip_address}&port=${cam.port}&channel=${cam.channel || "102"}&t=${cameraKey}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-40 w-full items-center justify-center font-medium text-slate-400 bg-black/5 rounded-md border border-dashed">
              Vui lòng cấu hình IP cho camera của trạm này trong phần quản lý trạm.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default React.memo(StationStatusPanel);
