"use client";

import "leaflet/dist/leaflet.css";

import { cn } from "@/lib/utils";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";

export type DispatchMapStatus = "running" | "idle" | "alert" | "offline";

export interface DispatchMapVehicle {
  id: string;
  vehicleName: string;
  licensePlate: string;
  latitude: number;
  longitude: number;
  speed: number;
  direction: number;
  status: DispatchMapStatus;
  labelText?: string;
}

interface DispatchCenterMapProps {
  vehicles: DispatchMapVehicle[];
  selectedVehicleId: string | null;
  center: {
    latitude: number;
    longitude: number;
    radius?: number;
  } | null;
  onSelectVehicle: (vehicleId: string) => void;
}

const STATUS_STYLES: Record<DispatchMapStatus, { accent: string; dot: string; icon: string }> = {
  running: {
    accent: "#17b26a",
    dot: "#17b26a",
    icon: "/icons/truck-run.png",
  },
  idle: {
    accent: "#f59e0b",
    dot: "#f59e0b",
    icon: "/icons/truck-park.png",
  },
  alert: {
    accent: "#ef4444",
    dot: "#ef4444",
    icon: "/icons/truck-run.png",
  },
  offline: {
    accent: "#64748b",
    dot: "#64748b",
    icon: "/icons/truck-offline.png",
  },
};

function createVehicleMarker(vehicle: DispatchMapVehicle, selected: boolean) {
  const style = STATUS_STYLES[vehicle.status];
  const speedLabel = vehicle.labelText || `${Math.round(vehicle.speed || 0)} km/h`;
  const width = selected ? 126 : 112;
  const height = selected ? 56 : 50;
  const borderColor = selected ? "#1d4ed8" : style.accent;
  const ring =
    vehicle.status === "alert"
      ? "box-shadow:0 0 0 5px rgba(239,68,68,0.12);"
      : selected
        ? "box-shadow:0 0 0 5px rgba(37,99,235,0.12);"
        : "";
  const html = `
    <div style="position:relative;width:${width}px;height:${height + 14}px;">
      <div style="
        position:absolute;left:0;top:0;width:${width}px;height:${height}px;
        display:flex;align-items:center;gap:7px;padding:7px 9px;
        background:#ffffff;border:1.5px solid ${borderColor};border-radius:16px;
        box-shadow:0 16px 30px rgba(15,23,42,0.14);${ring}
      ">
        <div style="
          width:30px;height:30px;border-radius:10px;background:${style.accent}12;
          display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;
        ">
          <img src="${style.icon}" alt="" style="width:22px;height:22px;transform:rotate(${vehicle.direction || 0}deg);" />
        </div>
        <div style="min-width:0;font-family:Segoe UI,sans-serif;">
          <div style="font-size:11px;font-weight:800;line-height:1.1;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${vehicle.vehicleName}
          </div>
          <div style="font-size:10px;font-weight:700;line-height:1.1;color:${vehicle.status === "alert" ? "#ef4444" : "#64748b"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${speedLabel}
          </div>
        </div>
      </div>
      <div style="
        position:absolute;left:${Math.round(width / 2) - 1}px;top:${height - 1}px;width:2px;height:10px;
        background:${borderColor};border-radius:999px;
      "></div>
      <div style="
        position:absolute;left:${Math.round(width / 2) - 4}px;top:${height + 7}px;width:8px;height:8px;
        background:${style.dot};border:2px solid #ffffff;border-radius:999px;
        box-shadow:0 4px 10px rgba(15,23,42,0.18);
      "></div>
    </div>
  `;

  return L.divIcon({
    className: "dispatch-center-marker",
    html,
    iconSize: [width, height + 14],
    iconAnchor: [Math.round(width / 2), height + 14],
  });
}

function createCenterMarker() {
  return L.divIcon({
    className: "dispatch-center-root-marker",
    html: `
      <div style="
        width:18px;height:18px;border-radius:999px;background:#2563eb;
        border:3px solid rgba(255,255,255,0.95);box-shadow:0 8px 20px rgba(37,99,235,0.35);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function MapViewport({
  vehicles,
  selectedVehicleId,
  center,
}: {
  vehicles: DispatchMapVehicle[];
  selectedVehicleId: string | null;
  center: DispatchCenterMapProps["center"];
}) {
  const map = useMap();

  useEffect(() => {
    const selected = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
    if (selected) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 14), {
        animate: true,
        duration: 0.8,
      });
      return;
    }

    if (vehicles.length > 1) {
      const bounds = L.latLngBounds(
        vehicles.map((vehicle) => [vehicle.latitude, vehicle.longitude] as [number, number]),
      );
      map.fitBounds(bounds.pad(0.2), { animate: true, duration: 0.8 });
      return;
    }

    if (vehicles.length === 1) {
      map.setView([vehicles[0].latitude, vehicles[0].longitude], 14, { animate: true });
      return;
    }

    if (center) {
      map.setView([center.latitude, center.longitude], 13, { animate: true });
    }
  }, [center, map, selectedVehicleId, vehicles]);

  return null;
}

export default function DispatchCenterMap({
  vehicles,
  selectedVehicleId,
  center,
  onSelectVehicle,
}: DispatchCenterMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const mapCenter = useMemo(() => {
    if (center) {
      return [center.latitude, center.longitude] as [number, number];
    }

    if (vehicles.length) {
      return [vehicles[0].latitude, vehicles[0].longitude] as [number, number];
    }

    return [10.8231, 106.6297] as [number, number];
  }, [center, vehicles]);

  if (!mounted) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-[26px] bg-slate-100 text-sm font-semibold text-slate-500">
        Đang tải bản đồ...
      </div>
    );
  }

  return (
    <div className="relative isolate z-0 h-[380px] overflow-hidden rounded-[26px] border border-slate-200/80 lg:h-[430px]">
      <div className="absolute right-4 top-4 z-[1000] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="space-y-2 text-xs font-semibold text-slate-600">
          {(["running", "idle", "alert", "offline"] as DispatchMapStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-2">
              <span
                className={cn("inline-block h-2.5 w-2.5 rounded-full")}
                style={{ backgroundColor: STATUS_STYLES[status].dot }}
              />
              <span>
                {status === "running" && "Đang chạy"}
                {status === "idle" && "Dừng/idle"}
                {status === "alert" && "Cảnh báo"}
                {status === "offline" && "Không hoạt động"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <MapContainer center={mapCenter} zoom={13} scrollWheelZoom className="h-full w-full [&_.leaflet-control-container]:z-[400] [&_.leaflet-pane]:z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <MapViewport vehicles={vehicles} selectedVehicleId={selectedVehicleId} center={center} />

        {center ? (
          <>
            <Marker position={[center.latitude, center.longitude]} icon={createCenterMarker()} />
            {center.radius ? (
              <Circle
                center={[center.latitude, center.longitude]}
                radius={center.radius}
                pathOptions={{
                  color: "#2563eb",
                  fillColor: "#60a5fa",
                  fillOpacity: 0.08,
                  weight: 1,
                  dashArray: "4 6",
                }}
              />
            ) : null}
          </>
        ) : null}

        {vehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={[vehicle.latitude, vehicle.longitude]}
            icon={createVehicleMarker(vehicle, vehicle.id === selectedVehicleId)}
            eventHandlers={{
              click: () => onSelectVehicle(vehicle.id),
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
