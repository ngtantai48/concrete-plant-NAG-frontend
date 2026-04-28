import "leaflet/dist/leaflet.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import type { NearbyVehicle } from "@/hooks/useNearbyVehicles";

// Default marker icon fix for leaflet + webpack
const iconDefault = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

// Normalize Vtracking status to one of: 'run' | 'park' | 'offline'
// Note: speed field is the LAST RECORDED speed, not real-time.
// Offline is determined by signal age (timestamp), matching Vtracking's ~10 min threshold.
const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function normalizeStatus(status: string, timestamp?: number): 'run' | 'park' | 'offline' {
  // Check if signal is stale (no data for over 10 minutes = offline)
  if (timestamp) {
    const age = Date.now() - timestamp;
    if (age > OFFLINE_THRESHOLD_MS) return 'offline';
  }

  // Check status field from Vtracking API
  const s = (status || '').toLowerCase();
  if (s === 'run' || s === 'running') return 'run';
  if (s === 'stop' || s === 'park' || s === 'idle' || s === 'parking' || s === 'stopped') return 'park';
  return 'offline';
}

// Compute icon width based on map zoom level (car.svg is 16:9 ratio)
function getIconWidthForZoom(zoom: number): number {
  if (zoom >= 18) return 72;
  if (zoom >= 17) return 60;
  if (zoom >= 16) return 50;
  if (zoom >= 15) return 42;
  if (zoom >= 14) return 36;
  if (zoom >= 13) return 30;
  return 24;
}

// Vehicle icon using /car.svg - rotates based on direction, scales with zoom
function createVehicleIcon(
  status: string,
  direction: number,
  speed: number,
  zoom: number,
  vehicleName?: string,
  licensePlate?: string,
): L.DivIcon {
  const rotation = direction || 0;
  const w = getIconWidthForZoom(zoom);
  const h = Math.round(w * 9 / 16); // maintain 16:9 aspect ratio

  // CSS filter to tint car.svg based on status
  // run = original blue, park = orange/yellow hue shift, offline = grayscale
  let cssFilter = '';
  if (status === 'park') cssFilter = 'filter:hue-rotate(180deg) saturate(1.8) brightness(1.1);';
  if (status === 'offline') cssFilter = 'filter:grayscale(100%) opacity(0.6);';

  // Vehicle image - use 16:9 container matching car.svg aspect ratio
  const vehicleHtml = `<div style="width:${w}px;height:${h}px;overflow:hidden;transform:rotate(${rotation}deg);">` +
    `<img src="/car.svg" style="width:${w}px;height:${h}px;display:block;${cssFilter}" alt="" />` +
    `</div>`;

  // Label (Vtracking style): vehicle code on top (bold), license plate below
  const labelFontSize1 = Math.max(9, Math.round(w * 0.26));
  const labelFontSize2 = Math.max(8, Math.round(w * 0.22));
  let labelHtml = '';
  if (vehicleName || licensePlate) {
    const line1 = vehicleName
      ? `<div style="font-weight:700;font-size:${labelFontSize1}px;line-height:1.2;color:#333;">${vehicleName}</div>`
      : '';
    const line2 = licensePlate
      ? `<div style="font-size:${labelFontSize2}px;line-height:1.2;color:#666;">${licensePlate}</div>`
      : '';
    labelHtml = `<div style="
      position:absolute;bottom:${h + 1}px;left:50%;transform:translateX(-50%);
      white-space:nowrap;font-family:Arial,sans-serif;
      background:#fff;padding:1px 5px;border-radius:3px;
      border:1px solid #d1d5db;
      box-shadow:0 1px 3px rgba(0,0,0,0.12);
      pointer-events:none;text-align:center;
    ">${line1}${line2}</div>`;
  }

  return L.divIcon({
    className: 'vt-vehicle-icon',
    html: `<div style="position:relative;width:${w}px;height:${h}px;overflow:visible;">${vehicleHtml}${labelHtml}</div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    popupAnchor: [0, -(h / 2 + 2)],
  });
}

// Track map zoom level changes
function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoomChange(map.getZoom());
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map, onZoomChange]);
  return null;
}


interface StationMapProps {
  stationLongitude: number | null;
  stationLatitude: number | null;
  radius: number;
  vehicles: NearbyVehicle[];
  focusVehicle?: { latitude: number; longitude: number } | null;
  focusDeviceId?: string | null;
}

// Auto-center map to station position
function MapUpdater({ stationLat, stationLng }: { stationLat: number; stationLng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([stationLat, stationLng], 15, { animate: true });
  }, [map, stationLat, stationLng]);
  return null;
}

// FlyTo selected vehicle + open popup
function FlyToVehicle({ focusVehicle, focusDeviceId, markerRefs }: {
  focusVehicle: { latitude: number; longitude: number } | null;
  focusDeviceId: string | null;
  markerRefs: React.RefObject<Record<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (focusVehicle) {
      map.flyTo([focusVehicle.latitude, focusVehicle.longitude], 17, { animate: true, duration: 1 });

      // Open popup after flyTo animation completes
      if (focusDeviceId && markerRefs.current) {
        setTimeout(() => {
          const marker = markerRefs.current[focusDeviceId];
          if (marker) marker.openPopup();
        }, 1100);
      }
    }
  }, [map, focusVehicle, focusDeviceId, markerRefs]);
  return null;
}

// Convert direction (degrees) to compass string
function directionToCompass(direction: number): string {
  const dirs = ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'];
  const index = Math.round(direction / 45) % 8;
  return dirs[index];
}

// Format timestamp for display
function formatTimestamp(ts: number): string {
  if (!ts) return '--';
  const d = new Date(ts);
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit',
  }).format(d);
}

const StationMap = ({ stationLongitude, stationLatitude, radius, vehicles, focusVehicle, focusDeviceId }: StationMapProps) => {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(15);
  const markerRefs = useRef<Record<string, L.Marker>>({});

  const setMarkerRef = useCallback((deviceId: string, ref: L.Marker | null) => {
    if (ref) {
      markerRefs.current[deviceId] = ref;
    } else {
      delete markerRefs.current[deviceId];
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted || stationLongitude == null || stationLatitude == null) {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-lg" style={{ background: 'rgba(10, 14, 30, 0.8)', border: '1px solid rgba(56, 189, 248, 0.08)' }}>
        <p className="text-base animate-pulse" style={{ color: '#22d3ee' }}>Đang tải bản đồ...</p>
      </div>
    );
  }

  const stationLng = stationLongitude;
  const stationLat = stationLatitude;

  // Vehicle status counts (using normalized status with speed + timestamp)
  const runCount = vehicles.filter(v => normalizeStatus(v.status, v.timestamp) === 'run').length;
  const parkCount = vehicles.filter(v => normalizeStatus(v.status, v.timestamp) === 'park').length;
  const offlineCount = vehicles.filter(v => normalizeStatus(v.status, v.timestamp) === 'offline').length;

  return (
    <div className="w-full h-full relative z-0 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(56, 189, 248, 0.1)' }}>
      {/* Legend overlay */}
      <div className="absolute top-2 left-2 z-1000 flex flex-col gap-1">
        <div className="bg-white/95 backdrop-blur-sm rounded-md shadow-md px-2.5 py-1.5 flex items-center gap-3 border border-slate-200">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }}></span>
            <span className="text-[10px] font-bold text-slate-600">Di chuyển {runCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#f97316' }}></span>
            <span className="text-[10px] font-bold text-slate-600">Dừng {parkCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#94a3b8' }}></span>
            <span className="text-[10px] font-bold text-slate-600">Mất KN {offlineCount}</span>
          </div>
        </div>
      </div>

      <MapContainer
        key={`${stationLat}-${stationLng}`}
        center={[stationLat, stationLng]}
        zoom={15}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        <MapUpdater stationLat={stationLat} stationLng={stationLng} />
        <FlyToVehicle focusVehicle={focusVehicle ?? null} focusDeviceId={focusDeviceId ?? null} markerRefs={markerRefs} />
        <ZoomTracker onZoomChange={setZoom} />

        {/* Station position marker */}
        <Marker position={[stationLat, stationLng]} icon={iconDefault}>
          <Popup>
            <div className="text-base">
              <strong>Vị trí trạm</strong>
              <br />
              Bán kính: {radius}m
            </div>
          </Popup>
        </Marker>

        {/* Geofencing radius circle */}
        <Circle
          center={[stationLat, stationLng]}
          radius={radius}
          pathOptions={{ color: "#06b6d4", fillColor: "#06b6d4", fillOpacity: 0.08, weight: 1.5 }}
        />

        {/* Vehicle markers - rotated car icon (Vtracking style) */}
        {vehicles.map((v) => {
          const nStatus = normalizeStatus(v.status, v.timestamp);
          const icon = createVehicleIcon(nStatus, v.direction, v.speed, zoom, v.vehicle_name, v.license_plate);

          return (
            <Marker key={v.device_id} position={[v.latitude, v.longitude]} icon={icon}
              ref={(ref) => setMarkerRef(v.device_id, ref as unknown as L.Marker | null)}>
              <Popup>
                <div className="font-sans min-w-55 p-0.5">
                  {/* Header */}
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <div className="flex flex-col">
                      <strong className="text-base font-bold text-slate-800 uppercase">{v.license_plate}</strong>
                      <span className="text-xs text-slate-500 truncate max-w-50">{v.vehicle_name}</span>
                    </div>
                    <span className={`ml-auto shrink-0 font-semibold px-2 py-0.5 rounded-full text-[11px] ${normalizeStatus(v.status, v.timestamp) === "run" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                      normalizeStatus(v.status, v.timestamp) === "park" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                        "bg-slate-50 text-slate-500 border border-slate-100"
                      }`}>
                      {normalizeStatus(v.status, v.timestamp) === "run" ? "Đang chạy" : normalizeStatus(v.status, v.timestamp) === "park" ? "Đang dừng" : "Mất kết nối"}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Vận tốc</span>
                      <span className="font-semibold text-slate-700 tabular-nums">{v.speed} <span className="text-[11px] text-slate-400 font-normal">km/h</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Hướng</span>
                      <span className="font-semibold text-slate-700">
                        {directionToCompass(v.direction)} <span className="text-[11px] text-slate-400 font-normal">({Math.round(v.direction)}°)</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Cách trạm</span>
                      <span className="font-semibold text-slate-700 tabular-nums">
                        {v.distance >= 1000 ? `${(v.distance / 1000).toFixed(1)} km` : `${v.distance} m`}
                      </span>
                    </div>
                    {v.geocoding && (
                      <div className="flex justify-between items-start text-sm gap-2">
                        <span className="text-slate-400 shrink-0">Vị trí</span>
                        <span className="font-medium text-slate-600 text-right text-[11px] leading-relaxed">{v.geocoding}</span>
                      </div>
                    )}
                    {v.timestamp && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Cập nhật</span>
                        <span className="font-medium text-slate-500 text-[11px]">{formatTimestamp(v.timestamp)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default React.memo(StationMap);
