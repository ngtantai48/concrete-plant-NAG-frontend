import { NextResponse } from "next/server";
import { loginPresence, getCachedPresence, BASE_URL } from "@/lib/vtracking-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const orgId = process.env.VTRACKING_ORG_ID;
  if (!orgId) {
    return NextResponse.json({ error: "Thiếu VTRACKING_ORG_ID" }, { status: 500 });
  }

  let presence = getCachedPresence();
  if (!presence) {
    presence = await loginPresence();
    if (!presence) {
      presence = process.env.VTRACKING_PRESENCE || null;
    }
    if (!presence) {
      return NextResponse.json(
        { error: "Không thể đăng nhập Vtracking." },
        { status: 401 },
      );
    }
  }

  try {
    let res = await fetchVehicles(presence, orgId);
    let raw = res.ok ? await res.json() : null;

    const needsRelogin =
      !res.ok ||
      !raw?.content?.vehicles ||
      raw?.resultString?.includes("đăng nhập") ||
      raw?.resultString?.includes("hết") ||
      raw?.status === 401;

    if (needsRelogin) {
      const newPresence = await loginPresence();
      if (newPresence) {
        res = await fetchVehicles(newPresence, orgId);
        if (res.ok) {
          raw = await res.json();
        }
      }
    }

    if (!raw?.content?.vehicles) {
      return NextResponse.json(
        { error: raw?.resultString || "Không có dữ liệu" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      total: raw.content.total,
      vehicles: parseVehicles(raw.content.vehicles),
    });
  } catch {
    return NextResponse.json(
      { error: "Không thể kết nối đến Vtracking" },
      { status: 502 },
    );
  }
}

async function fetchVehicles(presence: string, orgId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(`${BASE_URL}/portDataWithParamAndProjectId`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE_URL}/monitorMapV2`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      Cookie: `PLAY_LANG=vi;presence=${presence}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      param: `/api/devices/vtracking/vehicle/filter?limit=500&offset=0&expand=true&getAllAttributes=true`,
      body: {
        org_ids: [orgId],
        vehicle_type: "",
        status: [],
        svc_status: ["expired"],
      },
    }),
  });

  clearTimeout(timeout);
  return res;
}

function parseVehicles(rawVehicles: Record<string, unknown>[]) {
  return rawVehicles.map((v) => {
    const attrs = (v.attributes as Record<string, unknown>[]) || [];
    const datas =
      (attrs.find(
        (a: Record<string, unknown>) => a.attribute_key === "datas",
      )?.value as Record<string, unknown>) || {};
    const plateAttr = attrs.find(
      (a: Record<string, unknown>) => a.attribute_key === "plateNo",
    );

    return {
      id: v.id as string,
      device_id: v.device_id,
      vehicle_name: v.vehicle_name,
      license_plate: v.license_plate || (plateAttr?.value as string) || "",
      latitude: Number(datas.latitude) || 0,
      longitude: Number(datas.longitude) || 0,
      speed: Number(datas.speed) || 0,
      status: (datas.status as string) || "unknown",
      geocoding: (datas.geocoding as string) || "",
      direction: Number(datas.direction) || 0,
      timestamp: Number(datas.timestamp) || 0,
      attributes: attrs.filter(
        (a: Record<string, unknown>) => a.attribute_type === "SCOPE_CLIENT",
      ),
    };
  });
}
