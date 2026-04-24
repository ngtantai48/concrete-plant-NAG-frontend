import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { DeviceStationStatus } from "@/hooks/useDeviceHeartbeat";
import stationApi from "@/services/station.service";
import type { Order } from "@/types/order";
import type { Station } from "@/types/station";
import { RotateCw, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

interface StationStatusPanelProps {
  stations: Station[];
  orders: Order[];
  deviceStationStatusMap?: Record<string, DeviceStationStatus>;
  onStationUpdated?: () => void;
}

const StationStatusPanel = ({
  stations,
  orders,
  deviceStationStatusMap = {},
  onStationUpdated,
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
  const [cameraKey, setCameraKey] = useState(Date.now());

  const vehiclesByStation = useMemo(() => {
    const map: Record<number, { license_plate: string; status: string; order_number: number }[]> = {};

    orders.forEach((order) => {
      const isAtStation =
        order.order_status === "collecting" ||
        (order.station_checks?.check_in_datetime && !order.station_checks?.check_out_datetime);

      if (isAtStation && order.stations?.station_id) {
        if (!map[order.stations.station_id]) {
          map[order.stations.station_id] = [];
        }

        map[order.stations.station_id].push({
          license_plate: order.vehicles?.vehicle_license_plate
            ? `${order.vehicles.vehicle_license_plate}${
                order.vehicles.vehicle_name ? ` | ${order.vehicles.vehicle_name}` : ""
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
  }, [orders]);

  const performToggleStatus = async (station: Station) => {
    const nextStatus = station.station_status === "operating" ? "stopped" : "operating";
    setTogglingId(station.station_id);

    try {
      if (nextStatus === "stopped") {
        await stationApi.reportStop(station.station_id);
      } else {
        await stationApi.reportOperating(station.station_id);
      }

      toast.success(
        `${station.station_name}: ${
          nextStatus === "operating" ? t("stationRestored") : t("stationPaused")
        }`,
        {
          position: "top-right",
        },
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

      toast.success(`${incidentStation.station_name}: ${t("incidentReportSuccess")}`, {
        position: "top-right",
      });
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

          return (
            <div
              key={station.station_id}
              className="dd-card dd-glow-border flex min-h-0 flex-row overflow-hidden"
              style={{ borderColor: theme.borderGlow }}
            >
              <div className="flex min-w-0 flex-1 flex-col p-2">
                <div className="flex flex-wrap items-center gap-1.5 px-1 py-0.5">
                  <h3 className="whitespace-nowrap text-base font-black text-slate-900">
                    {station.station_name}
                  </h3>

                  <Badge
                    variant="outline"
                    onClick={() => handleOpenCamera(station)}
                    className={`h-7 shrink-0 cursor-pointer gap-1.5 px-2 py-0 text-sm font-normal shadow-none transition-all hover:bg-slate-100 ${
                      deviceStatus === "connected"
                        ? "border-emerald-200 bg-emerald-50/50 text-emerald-600"
                        : "animate-pulse border-red-200 bg-red-50/50 text-red-600"
                    }`}
                  >
                    <Video className="h-3.5 w-3.5" />
                    {deviceStatus === "connected" ? t("cameraConnected") : t("cameraDisconnected")}
                  </Badge>

                  <Badge
                    variant="secondary"
                    className={`ml-auto h-7 shrink-0 gap-1.5 px-2.5 py-0 text-sm font-normal shadow-none ${
                      station.station_status === "operating"
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

                <div className="flex flex-1 flex-col gap-1 px-1 py-1">
                  <div
                    className="rounded-md px-3 py-1 shadow-sm"
                    style={{ border: "1px solid var(--dd-border)" }}
                  >
                    <div className="flex min-h-[28px] items-center justify-between">
                      <span className="text-xs font-bold uppercase">{t("vehicleUnloading")}</span>
                      {activeVehicle ? (
                        <div className="flex items-center">
                          <span
                            className="inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 text-sm font-extrabold"
                            style={{ color: "var(--dd-text-accent)" }}
                          >
                            <RotateCw className="h-3 w-3 animate-soft-spin" />
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

      <Dialog
        open={!!viewingCameraStation}
        onOpenChange={(isOpen) => !isOpen && setViewingCameraStation(null)}
      >
        <DialogContent className="flex max-h-[90vh] flex-col bg-white/95 p-4 backdrop-blur-md sm:max-w-3xl">
          <DialogHeader className="flex-none">
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-800">
              <Video className="h-5 w-5 text-indigo-500" />
              Camera Giám Sát - {viewingCameraStation?.station_name}
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-slate-500">
              IP: {viewingCameraStation?.station_ip_address || "Chưa cấu hình"} | Port:{" "}
              {viewingCameraStation?.station_port || "Chưa cấu hình"}
            </DialogDescription>
          </DialogHeader>
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-black shadow-inner">
            {viewingCameraStation?.station_ip_address ? (
              <img
                src={`/api/camera/proxy?ip=${viewingCameraStation.station_ip_address}&port=${
                  viewingCameraStation.station_id === 1
                    ? "81"
                    : viewingCameraStation.station_id === 2
                      ? "82"
                      : viewingCameraStation.station_id === 3
                        ? "80"
                        : "80"
                }&t=${cameraKey}`}
                className="h-full w-full bg-black object-contain"
                alt={`Camera ${viewingCameraStation.station_name}`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-medium text-slate-400">
                Vui lòng cấu hình IP và Port cho camera của trạm này trong phần quản lý trạm.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default React.memo(StationStatusPanel);
