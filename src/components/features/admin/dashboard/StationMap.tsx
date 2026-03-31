import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import type { NearbyVehicle } from "@/hooks/useNearbyVehicles";

// Fix cho lỗi thiếu icon mặc định của marker trong leaflet với webpack
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

// Icon xe chạy (Xanh lá)
const runIcon = L.divIcon({
  className: "custom-div-icon",
  html: `<div style="background-color: #10b981; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Icon xe dừng (Vàng)
const parkIcon = L.divIcon({
  className: "custom-div-icon",
  html: `<div style="background-color: #f59e0b; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Icon xe mất kết nối (Xám)
const offlineIcon = L.divIcon({
  className: "custom-div-icon",
  html: `<div style="background-color: #94a3b8; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface StationMapProps {
  stationLongitude: number | null;
  stationLatitude: number | null;
  radius: number;
  vehicles: NearbyVehicle[];
}

// Component này dùng để tự động fit map với bounds của trạm
function MapUpdater({ stationLat, stationLng }: { stationLat: number; stationLng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([stationLat, stationLng], 15, { animate: true });
  }, [map, stationLat, stationLng]);
  return null;
}

export default function StationMap({ stationLongitude, stationLatitude, radius, vehicles }: StationMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  return (
    <div className="w-full h-full relative z-0 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(56, 189, 248, 0.1)' }}>
      <MapContainer
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

        {/* Vị trí trạm */}
        <Marker position={[stationLat, stationLng]} icon={iconDefault}>
          <Popup>
            <div className="text-base">
              <strong>Vị trí trạm</strong>
              <br />
              Bán kính: {radius}m
            </div>
          </Popup>
        </Marker>

        {/* Vòng tròn bán kính geofencing */}
        <Circle
          center={[stationLat, stationLng]}
          radius={radius}
          pathOptions={{ color: "#06b6d4", fillColor: "#06b6d4", fillOpacity: 0.08, weight: 1.5 }}
        />

        {/* Các xe */}
        {vehicles.map((v) => {
          const icon = v.status === "run" ? runIcon : v.status === "park" ? parkIcon : offlineIcon;

          return (
            <Marker key={v.device_id} position={[v.latitude, v.longitude]} icon={icon}>
              <Popup>
                <div className="font-sans min-w-[200px] p-0.5">
                  <strong className="text-base font-bold text-slate-800 uppercase">{v.license_plate}</strong>
                  <p className="text-xs text-slate-500 mb-3 truncate max-w-[200px] leading-relaxed">{v.vehicle_name}</p>

                  <div className="space-y-2 border-t border-slate-100 pt-3 mt-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Trạng thái</span>
                      <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${v.status === "run" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                          v.status === "park" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                            "bg-slate-50 text-slate-500 border border-slate-100"
                        }`}>
                        {v.status === "run" ? "Đang chạy" : v.status === "park" ? "Đang dừng" : "Mất kết nối"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Vận tốc</span>
                      <span className="font-semibold text-slate-700 tabular-nums">{v.speed} <span className="text-[11px] text-slate-400 font-normal">km/h</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Cách trạm</span>
                      <span className="font-semibold text-slate-700 tabular-nums">
                        {v.distance >= 1000 ? `${(v.distance / 1000).toFixed(1)} km` : `${v.distance} m`}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
