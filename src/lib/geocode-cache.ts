/**
 * Frontend geocode cache for reverse geocoding results.
 *
 * - Cache key: lat.toFixed(5) + lng.toFixed(5)
 * - TTL: 10 minutes
 * - Proximity check: reuse cached result if vehicle moved < 20m
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PROXIMITY_THRESHOLD_M = 20; // 20 meters

export interface GeocodeResult {
  address: string;
  source?: "google" | "here" | "osm";
  updatedAt: string;
}

interface CacheEntry {
  lat: number;
  lng: number;
  result: GeocodeResult;
  expiresAt: number;
}

/** In-memory cache store */
const cache = new Map<string, CacheEntry>();

/** Build cache key from coordinates (rounded to 5 decimals ≈ 1.1m precision) */
function buildKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Haversine distance in meters between two points */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Get cached geocode result for given coordinates.
 * Returns cached result if:
 * 1. Exact key match exists and not expired, OR
 * 2. A nearby entry (< 20m) exists and not expired.
 */
export function getCachedGeocode(lat: number, lng: number): GeocodeResult | null {
  const now = Date.now();
  const key = buildKey(lat, lng);

  // 1. Exact match
  const exact = cache.get(key);
  if (exact && exact.expiresAt > now) {
    return exact.result;
  }

  // 2. Proximity match — scan for nearby entries within 20m
  for (const entry of cache.values()) {
    if (entry.expiresAt <= now) continue;
    const dist = haversineDistance(lat, lng, entry.lat, entry.lng);
    if (dist < PROXIMITY_THRESHOLD_M) {
      return entry.result;
    }
  }

  return null;
}

/**
 * Store a geocode result in cache.
 */
export function setCachedGeocode(lat: number, lng: number, result: GeocodeResult): void {
  const key = buildKey(lat, lng);
  cache.set(key, {
    lat,
    lng,
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Periodically clean expired entries (call sparingly).
 */
export function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

/**
 * Format address string — removes null/undefined/empty segments.
 * Input: raw address from API
 * Output: clean formatted address or null if empty
 */
export function formatAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "null" && s !== "undefined")
    .join(", ");

  // If result is empty or just commas/spaces
  if (!cleaned || /^[\s,]*$/.test(cleaned)) return null;

  return cleaned;
}
