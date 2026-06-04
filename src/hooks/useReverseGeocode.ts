import { useCallback, useRef, useState } from "react";
import { useAppSelector } from "@/hooks/use-app-selector";
import {
  getCachedGeocode,
  setCachedGeocode,
  formatAddress,
  cleanExpiredCache,
  type GeocodeResult,
} from "@/lib/geocode-cache";

export interface VehicleAddressState {
  loading: boolean;
  address: string;
  source?: "google" | "here" | "osm";
  updatedAt?: string;
}

const INITIAL_STATE: VehicleAddressState = {
  loading: false,
  address: "",
};

/**
 * Hook for on-demand reverse geocoding.
 *
 * - Only fetches when `fetchAddress(lat, lng)` is called (e.g. on popup open / click).
 * - Uses FE cache (10 min TTL, 20m proximity).
 * - Falls back to existing `geocoding` field from Vtracking if API fails.
 * - Calls `/api/geocode/reverse?lat=...&lng=...` (Next.js route → backend fallback chain).
 */
export function useReverseGeocode() {
  const [state, setState] = useState<VehicleAddressState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  // Periodic cache cleanup (every 50 calls)
  const callCountRef = useRef(0);
  
  // Retrieve token from redux store
  const tokenState = useAppSelector((state: any) => state.auth.token);

  const fetchAddress = useCallback(
    async (lat: number, lng: number, fallbackGeocoding?: string) => {
      // Cleanup expired cache entries periodically
      callCountRef.current += 1;
      if (callCountRef.current % 50 === 0) {
        cleanExpiredCache();
      }

      // 1. Check FE cache first
      const cached = getCachedGeocode(lat, lng);
      if (cached) {
        setState({
          loading: false,
          address: cached.address,
          source: cached.source,
          updatedAt: cached.updatedAt,
        });
        return;
      }

      // 2. Show loading state
      setState({ loading: true, address: "Đang lấy địa chỉ..." });

      // Cancel any previous in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const headers: Record<string, string> = {};
        if (tokenState) {
          headers.Authorization = `Bearer ${tokenState}`;
        }

        const res = await fetch(
          `/api/geocode/reverse?lat=${lat}&lng=${lng}`,
          {
            signal: controller.signal,
            headers,
          },
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const formattedAddress = formatAddress(data.address);

        if (formattedAddress) {
          const result: GeocodeResult = {
            address: formattedAddress,
            source: data.source,
            updatedAt: new Date().toISOString(),
          };

          // Store in cache
          setCachedGeocode(lat, lng, result);

          setState({
            loading: false,
            address: result.address,
            source: result.source,
            updatedAt: result.updatedAt,
          });
        } else {
          // API returned empty address — fallback to Vtracking geocoding
          const fallback = formatAddress(fallbackGeocoding);
          setState({
            loading: false,
            address: fallback || "Không xác định",
          });
        }
      } catch (err: unknown) {
        // Ignore aborted requests
        if (err instanceof DOMException && err.name === "AbortError") return;

        // Fallback to existing Vtracking geocoding field
        const fallback = formatAddress(fallbackGeocoding);
        setState({
          loading: false,
          address: fallback || "Không xác định",
        });
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return { ...state, fetchAddress, reset };
}
