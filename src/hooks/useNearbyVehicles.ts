import vtrackingApi from "@/services/vtracking.service";
import type { VtrackingVehicle } from "@/types/vtracking";
import { useCallback, useEffect, useRef, useState } from "react";

export interface NearbyVehicle extends VtrackingVehicle {
  distance: number;
  inRange: boolean;
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useNearbyVehicles(
  stationLongitude: number | null,
  stationLatitude: number | null,
  radiusMeters: number,
  intervalMs = 60000,
) {
  const [vehicles, setVehicles] = useState<NearbyVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  const fetchAndFilter = useCallback(async () => {
    if (stationLongitude == null || stationLatitude == null) return;

    const stationLng = stationLongitude;
    const stationLat = stationLatitude;

    setLoading(true);
    setError(null);
    try {
      const res = await vtrackingApi.fetchVehicles();
      const list = res.data.vehicles;

      const results: NearbyVehicle[] = list
        .filter((v) => v.latitude && v.longitude)
        .map((v) => {
          const dist = haversineDistance(
            stationLat,
            stationLng,
            v.latitude,
            v.longitude,
          );
          return {
            ...v,
            distance: Math.round(dist),
            inRange: dist <= radiusMeters,
          };
        });

      setVehicles(results);
      setLastUpdated(new Date());
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Lỗi kết nối";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [stationLongitude, stationLatitude, radiusMeters]);

  useEffect(() => {
    fetchAndFilter();
    timerRef.current = setInterval(fetchAndFilter, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAndFilter, intervalMs]);

  const inRangeCount = vehicles.filter((v) => v.inRange).length;

  return { vehicles, inRangeCount, loading, lastUpdated, error, refetch: fetchAndFilter };
}
