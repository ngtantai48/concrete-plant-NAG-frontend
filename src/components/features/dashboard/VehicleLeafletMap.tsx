"use client";

import "leaflet/dist/leaflet.css";

import type { VtrackingVehicle } from "@/types/vtracking";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000;

type DisplayStatus = "run" | "stop" | "park" | "offline";

function normalizeStatus(status: string, timestamp?: number): DisplayStatus {
  if (timestamp && Date.now() - timestamp > OFFLINE_THRESHOLD_MS) return "offline";

  const s = (status || "").toLowerCase();
  if (s === "run" || s === "running") return "run";
  if (s === "stop" || s === "idle" || s === "stopped") return "stop";
  if (s === "park" || s === "parking") return "park";
  return "park";
}

function directionToCompass(direction: number): string {
  const dirs = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
  const index = Math.round(direction / 45) % 8;
  return dirs[index];
}

function formatTimestamp(ts: number): string {
  if (!ts) return "--";
  const d = new Date(ts);
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function getIconFilter(status: DisplayStatus): string {
  switch (status) {
    case "run":
      return ""; // default blue
    case "stop":
      return "filter:hue-rotate(165deg) saturate(1.7) brightness(1.05);"; // orange
    case "park":
      return "filter:grayscale(100%) brightness(1.05);"; // gray
    case "offline":
      return "filter:hue-rotate(-90deg) saturate(2) brightness(1.05);"; // red
    default:
      return "";
  }
}

function createVehicleIcon(status: DisplayStatus, direction: number): L.DivIcon {
  const w = 54;
  const h = Math.round(w * 9 / 16);
  const rotation = direction || 0;
  const cssFilter = getIconFilter(status);

  const vehicleHtml = `<div style="width:${w}px;height:${h}px;overflow:hidden;transform:rotate(${rotation}deg);">` +
    `<img src="/car.svg" style="width:${w}px;height:${h}px;display:block;${cssFilter}" alt="" />` +
    `</div>`;

  return L.divIcon({
    className: "vt-single-vehicle-icon",
    html: `<div style="position:relative;width:${w}px;height:${h}px;">${vehicleHtml}</div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    popupAnchor: [0, -(h / 2 + 6)],
  });
}

export default function VehicleLeafletMap({ vehicle }: { vehicle: VtrackingVehicle }) {
  const lat = vehicle.latitude;
  const lng = vehicle.longitude;
  const displayStatus = normalizeStatus(vehicle.status, vehicle.timestamp);
  const icon = createVehicleIcon(displayStatus, vehicle.direction);
  const statusMeta = {
    run: {
      label: "Đang di chuyển",
      className: "bg-sky-50 text-sky-700 border border-sky-100",
    },
    stop: {
      label: "Đang dừng",
      className: "bg-amber-50 text-amber-700 border border-amber-100",
    },
    park: {
      label: "Đỗ",
      className: "bg-slate-50 text-slate-600 border border-slate-100",
    },
    offline: {
      label: "Mất kết nối",
      className: "bg-red-50 text-red-700 border border-red-100",
    },
  }[displayStatus];

  return (
    <MapContainer center={[lat, lng]} zoom={17} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <Marker position={[lat, lng]} icon={icon}>
        <Popup>
          <div className="font-sans min-w-55 p-0.5">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="flex flex-col">
                <strong className="text-base font-bold text-slate-800 uppercase">{vehicle.license_plate} | {vehicle.vehicle_name}</strong>
                {/* <span className="text-xs text-slate-500 truncate max-w-50"></span> */}
              </div>
              <span className={`ml-auto shrink-0 font-semibold px-2 py-0.5 rounded-full text-[11px] ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            </div>

            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Vận tốc</span>
                <span className="font-semibold text-slate-700 tabular-nums">
                  {vehicle.speed} <span className="text-[11px] text-slate-400 font-normal">km/h</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Hướng</span>
                <span className="font-semibold text-slate-700">
                  {directionToCompass(vehicle.direction)} <span className="text-[11px] text-slate-400 font-normal">({Math.round(vehicle.direction)}°)</span>
                </span>
              </div>
              {vehicle.geocoding && (
                <div className="flex justify-between items-start text-sm gap-2">
                  <span className="text-slate-400 shrink-0">Vị trí</span>
                  <span className="font-medium text-slate-600 text-right text-[11px] leading-relaxed">{vehicle.geocoding}</span>
                </div>
              )}
              {vehicle.timestamp && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Cập nhật</span>
                  <span className="font-medium text-slate-500 text-[11px]">{formatTimestamp(vehicle.timestamp)}</span>
                </div>
              )}
            </div>
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
