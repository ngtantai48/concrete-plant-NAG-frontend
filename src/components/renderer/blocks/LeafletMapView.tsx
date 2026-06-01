"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import { colorToHex, toneMeta } from "@/components/renderer/tokens";
import type { MapViewBlock } from "@/components/renderer/types";

type LatLngTuple = [number, number];
type MapMarker = MapViewBlock["markers"][number];

function isValidLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function markerTone(marker: MapMarker) {
  return toneMeta(
    marker.tone ??
      (marker.kind === "alert" ? "amber" : marker.kind === "vehicle" ? "green" : "blue")
  );
}

function toLatLng(lat: number, lng: number): LatLngTuple {
  return [lat, lng];
}

function collectMapPoints(data: MapViewBlock, center: LatLngTuple): LatLngTuple[] {
  const markerPoints = data.markers
    .filter((marker) => isValidLatLng(marker.lat, marker.lng))
    .map((marker): LatLngTuple => toLatLng(marker.lat, marker.lng));
  const routePoints =
    data.routes?.flatMap((route) =>
      route.points
        .filter(([lat, lng]) => isValidLatLng(lat, lng))
        .map(([lat, lng]): LatLngTuple => toLatLng(lat, lng))
    ) ?? [];
  return [center, ...markerPoints, ...routePoints];
}

function MapAutoFit({
  center,
  points,
  zoom,
}: {
  center: LatLngTuple;
  points: LatLngTuple[];
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { maxZoom: Math.max(zoom, 15), padding: [28, 28] });
      return;
    }

    map.setView(points[0] ?? center, zoom);
  }, [center, map, points, zoom]);

  return null;
}

export function LeafletMapView({ data }: { data: MapViewBlock }) {
  const center: LatLngTuple = isValidLatLng(data.center.lat, data.center.lng)
    ? [data.center.lat, data.center.lng]
    : [17.482, 106.6];
  const zoom = data.zoom ?? 13;
  const points = useMemo(() => collectMapPoints(data, center), [center, data]);

  return (
    <div className="relative mt-1 h-[260px] overflow-hidden rounded-md border border-black/[0.07] bg-zinc-100 dark:border-white/10 dark:bg-zinc-900">
      <MapContainer
        attributionControl
        center={center}
        className="size-full"
        scrollWheelZoom
        zoom={zoom}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapAutoFit center={center} points={points} zoom={zoom} />

        {data.routes?.map((route) => {
          const positions = route.points
            .filter(([lat, lng]) => isValidLatLng(lat, lng))
            .map(([lat, lng]): LatLngTuple => toLatLng(lat, lng));
          if (positions.length < 2) return null;

          return (
            <Polyline
              key={route.id}
              pathOptions={{
                color: colorToHex(route.color ?? "blue"),
                opacity: 0.85,
                weight: 4,
              }}
              positions={positions}
            />
          );
        })}

        {data.markers.map((marker) => {
          if (!isValidLatLng(marker.lat, marker.lng)) return null;
          const tone = markerTone(marker);

          return (
            <CircleMarker
              center={[marker.lat, marker.lng]}
              key={marker.id}
              pathOptions={{
                color: "#FFFFFF",
                fillColor: tone.hex,
                fillOpacity: 0.92,
                opacity: 1,
                weight: 2,
              }}
              radius={8}
            >
              {marker.label && (
                <Tooltip direction="right" offset={[10, 0]} opacity={0.95} permanent>
                  <span className="text-[11px] font-bold text-zinc-700">{marker.label}</span>
                </Tooltip>
              )}
              <Popup>
                <div className="space-y-1 text-[12px]">
                  <div className="font-bold">{marker.label ?? marker.id}</div>
                  <div>Loại: {marker.kind}</div>
                  <div>
                    {marker.lat.toFixed(6)}, {marker.lng.toFixed(6)}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-white/95 px-2 py-1 font-mono text-[10.5px] text-zinc-500 shadow-sm dark:bg-zinc-950/95 dark:text-zinc-400">
        {data.markers.length} marker · z{zoom}
      </div>
    </div>
  );
}
