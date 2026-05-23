"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import vtrackingApi from "@/services/vtracking.service";
import type { VtrackingVehicle } from "@/types/vtracking";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000;

function normalizeVtrackingStatus(status: string, timestamp?: number): "run" | "park" | "offline" {
  if (timestamp && Date.now() - timestamp > OFFLINE_THRESHOLD_MS) {
    return "offline";
  }

  const normalizedStatus = (status || "").toLowerCase();
  if (normalizedStatus === "run" || normalizedStatus === "running") return "run";
  if (normalizedStatus === "stop" || normalizedStatus === "park" || normalizedStatus === "idle" || normalizedStatus === "parking" || normalizedStatus === "stopped") {
    return "park";
  }

  return "offline";
}

const VehicleLeafletMap = dynamic(() => import("./VehicleLeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <RefreshCw className="w-5 h-5 text-sky-500 animate-spin" />
    </div>
  ),
});

function normalizePlate(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[-.]/g, "");
}

function matchVtrackingVehicle(
  vehicles: VtrackingVehicle[],
  licensePlate?: string | null,
  vehicleName?: string | null,
) {
  const plateKey = normalizePlate(licensePlate);
  const nameKey = String(vehicleName ?? "").trim();

  return vehicles.find((v) => {
    const vPlate = normalizePlate(v.license_plate);
    if (plateKey && vPlate && vPlate === plateKey) return true;
    if (nameKey && v.vehicle_name === nameKey) return true;
    return false;
  });
}

function formatTs(ts?: number) {
  if (!ts) return "--";
  const d = new Date(ts);
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export interface VehicleLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleLicensePlate?: string | null;
  vehicleName?: string | null;
  t: (key: string) => string;
  cachedVehicles?: VtrackingVehicle[];
}

export default function VehicleLocationDialog({
  open,
  onOpenChange,
  vehicleLicensePlate,
  vehicleName,
  t,
  cachedVehicles,
}: VehicleLocationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vtVehicle, setVtVehicle] = useState<VtrackingVehicle | null>(null);

  const title = useMemo(() => {
    const plate = vehicleLicensePlate?.trim();
    const name = vehicleName?.trim();
    return `${t("vehicleLocationTitle")} ${plate || ""}${name ? ` | ${name}` : ""}`.trim();
  }, [t, vehicleLicensePlate, vehicleName]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (cachedVehicles && cachedVehicles.length > 0) {
        const cachedMatch = matchVtrackingVehicle(cachedVehicles, vehicleLicensePlate, vehicleName);
        if (cachedMatch && cachedMatch.latitude && cachedMatch.longitude) {
          setVtVehicle(cachedMatch);
        }
      }

      const res = await vtrackingApi.fetchVehicles();
      const list = res.data.vehicles || [];
      const match = matchVtrackingVehicle(list, vehicleLicensePlate, vehicleName);

      if (!match || !match.latitude || !match.longitude) {
        setVtVehicle(null);
        setError(t("gpsNotFound"));
        return;
      }

      setVtVehicle(match);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t("gpsLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [cachedVehicles, t, vehicleLicensePlate, vehicleName]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const speed = typeof vtVehicle?.speed === "number" ? `${vtVehicle.speed} km/h` : "--";
  const mapsUrl = vtVehicle ? `https://www.google.com/maps?q=${vtVehicle.latitude},${vtVehicle.longitude}` : null;
  const displayStatus = useMemo(
    () => normalizeVtrackingStatus(vtVehicle?.status || "", vtVehicle?.timestamp),
    [vtVehicle],
  );
  const statusMeta = {
    run: {
      label: t("moving") || "Đang di chuyển",
      className: "border-sky-200 bg-sky-100 text-sky-700",
      dotClassName: "bg-sky-500",
    },
    park: {
      label: t("stopped") || "Đang dừng",
      className: "border-amber-200 bg-amber-100 text-amber-700",
      dotClassName: "bg-amber-500",
    },
    offline: {
      label: t("disconnected") || "Mất kết nối",
      className: "border-slate-200 bg-slate-100 text-slate-600",
      dotClassName: "bg-slate-400",
    },
  }[displayStatus];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[50vw]! w-[99vw]! max-h-[94vh] p-0 gap-0 overflow-hidden border-slate-200 bg-slate-50 shadow-2xl flex flex-col rounded-xl" showCloseButton={false}>
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur flex-row items-center justify-between space-y-0">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <MapPin className="h-5 w-5 text-sky-500" />
              <span className="truncate">{title}</span>
            </DialogTitle>
          </div>
          <Button size="sm" variant="destructive" onClick={() => onOpenChange(false)} className="shrink-0">
            {t("close")}
          </Button>
        </DialogHeader>

        <div className="flex-1 min-h-0 p-3 sm:p-4">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center min-h-96">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <RefreshCw className="w-5 h-5 text-sky-500 animate-spin" />
                  <span className="text-sm font-medium">Đang tải vị trí xe...</span>
                </div>
              </div>
            ) : vtVehicle ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="relative aspect-video w-full shrink-0 bg-slate-100">
                  <VehicleLeafletMap vehicle={vtVehicle} />
                </div>
                <div className="border-t border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-500">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <span>{t("gpsSpeed")}: {speed}</span>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.className}`}>
                      <span className={`h-2 w-2 rounded-full ${statusMeta.dotClassName}`} />
                      {statusMeta.label}
                    </span>
                    {mapsUrl && (
                      <a
                        className="ml-auto font-bold text-sky-600 hover:underline"
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("openGoogleMaps")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="max-w-sm text-sm font-medium leading-6 text-slate-600">
                  {error || t("gpsNotFound")}
                </div>
                <Button size="sm" variant="outline" onClick={load} className="border-slate-300">
                  {t("retry")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
