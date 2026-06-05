import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * GET /api/geocode/reverse?lat={lat}&lng={lng}
 *
 * Proxy reverse geocoding request to backend.
 * Backend handles fallback chain: Google → HERE → OSM/Nominatim.
 * FE only receives the final result.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const authHeader = request.headers.get("Authorization");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Missing lat/lng parameters" },
      { status: 400 },
    );
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  if (isNaN(latNum) || isNaN(lngNum)) {
    return NextResponse.json(
      { error: "Invalid lat/lng values" },
      { status: 400 },
    );
  }

  try {
    // 1. Try Backend (Google Maps/HERE) first - most accurate
    const backendResponse = await fallbackBackend(latNum, lngNum, authHeader);
    if (backendResponse.status === 200) {
      const data = await backendResponse.clone().json();
      if (data.address && data.address.length > 0) {
        return backendResponse;
      }
    }

    // 2. Fallback to OSM Nominatim ONLY if backend fails
    return await fallbackNominatim(latNum, lngNum);
  } catch {
    // 3. Fallback to OSM
    return await fallbackNominatim(latNum, lngNum);
  }
}

/**
 * Fallback: use Backend geocoding (Google/HERE)
 */
async function fallbackBackend(lat: number, lng: number, authHeader: string | null) {
  try {
    const backendUrl = `${BACKEND_API_URL}vehicles/geocode?lat=${lat}&lng=${lng}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const res = await fetch(backendUrl, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        address: data.address || data.formatted_address || "",
        source: data.source || "backend",
      });
    }

    return NextResponse.json(
      { address: "", source: "backend", error: `Backend failed with status ${res.status}` },
      { status: res.status === 403 ? 403 : 502 },
    );
  } catch {
    return NextResponse.json(
      { address: "", source: "backend", error: "Backend unreachable" },
      { status: 502 },
    );
  }
}

/**
 * Fallback: use OpenStreetMap Nominatim for reverse geocoding.
 * Free, no API key required, but rate-limited (1 req/s).
 */
async function fallbackNominatim(lat: number, lng: number) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=vi`,
      {
        headers: {
          "User-Agent": "NAG-ConcrePlant/1.0",
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      },
    );

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { address: "", source: "osm", error: "Nominatim failed" },
        { status: 502 },
      );
    }

    const data = await res.json();

    // Build detailed address from addressdetails
    const addr = data.address || {};
    const parts: string[] = [];

    // House number + road
    if (addr.house_number && addr.road) {
      parts.push(`${addr.house_number} ${addr.road}`);
    } else if (addr.road) {
      parts.push(addr.road);
    }

    // Hamlet / village detail (Thôn/Xóm/Ấp/Tổ dân phố)
    if (addr.hamlet) parts.push(addr.hamlet);
    if (addr.village && addr.village !== addr.hamlet) parts.push(addr.village);
    if (addr.neighbourhood && !parts.includes(addr.neighbourhood)) {
      parts.push(addr.neighbourhood);
    }
    if (addr.quarter && !parts.includes(addr.quarter)) {
      parts.push(addr.quarter);
    }

    // Suburb (Phường)
    if (addr.suburb && !parts.includes(addr.suburb)) {
      parts.push(addr.suburb);
    }

    // City district / town (Quận/Huyện/Thị xã)
    const district = addr.city_district || addr.town || addr.county;
    if (district && !parts.includes(district)) {
      parts.push(district);
    }

    // City / State (Thành phố / Tỉnh)
    const city = addr.city || addr.state;
    if (city && !parts.includes(city)) {
      parts.push(city);
    }

    const formattedAddress =
      parts.length > 0 ? parts.join(", ") : data.display_name || "";

    return NextResponse.json({
      address: formattedAddress,
      source: "osm" as const,
    });
  } catch {
    return NextResponse.json(
      { address: "", source: "osm", error: "Fallback failed" },
      { status: 502 },
    );
  }
}
