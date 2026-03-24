"use client";

import stationApi from "@/services/station.service";
import type { Station } from "@/services/station.service";
import { Skeleton, Tooltip } from "antd";
import {
  MapPin,
  RefreshCw,
  Building2,
  Radar,
  Factory,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardCard from "@/components/features/admin/dashboard/DashboardCard";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNearbyVehicles } from "@/hooks/useNearbyVehicles";
import dynamic from "next/dynamic";

const StationMap = dynamic(
  () => import("@/components/features/admin/dashboard/StationMap"),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    )
  }
);

export default function AdminDashboard() {
  const t = useTranslations("DashboardPage");
  const tCommon = useTranslations("Common");

  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshDisabled, setRefreshDisabled] = useState(0);
  const [clock, setClock] = useState("");
  const clockRef = useRef<ReturnType<typeof setInterval>>(null);



  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleString("vi-VN", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    };
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const sRes = await stationApi.getAll();
      setStations(sRes.data?.data || sRes.data || []);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = () => {
    if (refreshDisabled > 0) return;
    fetchAll();
    setRefreshDisabled(15);
    const interval = setInterval(() => {
      setRefreshDisabled((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const activeStations = useMemo(
    () => stations.filter((s) => s.station_status === "operating"),
    [stations],
  );

  const geofenceStation = useMemo(
    () => stations.find((s) => s.station_types?.station_type_id === 2),
    [stations],
  );

  const { vehicles: vtrackingVehicles, inRangeCount, loading: nearbyLoading, lastUpdated, error: nearbyError } = useNearbyVehicles(
    geofenceStation?.station_gps || null,
    geofenceStation?.station_gps_geofencing || 500,
  );

  const [filter, setFilter] = useState<"all" | "run" | "park" | "offline" | "inRange">("all");

  const filteredVehicles = useMemo(() => {
    switch (filter) {
      case "run":
        return vtrackingVehicles.filter(v => v.status === "run");
      case "park":
        return vtrackingVehicles.filter(v => v.status === "park");
      case "offline":
        return vtrackingVehicles.filter(v => v.status !== "run" && v.status !== "park");
      case "inRange":
        return vtrackingVehicles.filter(v => v.inRange);
      default:
        return vtrackingVehicles;
    }
  }, [vtrackingVehicles, filter]);

  if (loading) {
    return (
      <div className="m-4 md:m-6 lg:m-8 max-w-[1600px] lg:mx-auto space-y-6">
        <Skeleton active paragraph={{ rows: 1 }} />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <Skeleton active paragraph={{ rows: 2 }} title={false} />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      </div>
    );
  }

  const FilterButton = ({ value, label, count }: { value: typeof filter, label: string, count: number }) => (
    <button
      onClick={() => setFilter(value)}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        filter === value 
          ? "bg-slate-900 text-white shadow-sm" 
          : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
      }`}
    >
      {label} <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${filter === value ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
    </button>
  );

  return (
    <div className="m-4 md:m-6 lg:m-8 max-w-[1600px] lg:mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            {t("title")}
          </h1>
          <p className="text-slate-400 mt-1.5 text-sm tabular-nums">{clock}</p>
        </div>
        <Tooltip title={tCommon("refreshData")}>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshDisabled > 0}
            className="min-w-[120px] gap-2"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshDisabled > 0 ? "animate-spin" : ""}`}
            />
            {refreshDisabled > 0
              ? `${refreshDisabled}s`
              : tCommon("refresh")}
          </Button>
        </Tooltip>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <DashboardCard
          label={t("activeStationsCard")}
          value={activeStations.length}
          icon={<Building2 className="w-5 h-5" />}
          accent="slate"
          subtitle={`/ ${stations.length} ${t("totalStationsLabel")}`}
          index={0}
        />
        <DashboardCard
          label="Tổng xe"
          value={vtrackingVehicles.length}
          icon={<Radar className="w-5 h-5" />}
          accent="blue"
          index={1}
        />
        <DashboardCard
          label="Trong bán kính"
          value={inRangeCount}
          icon={<MapPin className="w-5 h-5" />}
          accent="emerald"
          subtitle={geofenceStation ? `Bán kính ${geofenceStation.station_gps_geofencing}m` : ""}
          index={2}
        />
      </div>

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        <div
          className="col-span-12 lg:col-span-8 space-y-4 animate-slide-up"
          style={{ animationDelay: "350ms", animationFillMode: "both" }}
        >
          {geofenceStation && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col h-[700px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
                    <Radar className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Giám sát khu vực
                    </h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {geofenceStation.station_name} - Bán kính {geofenceStation.station_gps_geofencing}m
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <FilterButton value="all" label="Tất cả" count={vtrackingVehicles.length} />
                  <FilterButton value="run" label="Chạy" count={vtrackingVehicles.filter(v => v.status === "run").length} />
                  <FilterButton value="park" label="Dừng" count={vtrackingVehicles.filter(v => v.status === "park").length} />
                  <FilterButton value="offline" label="Mất K/N" count={vtrackingVehicles.filter(v => v.status !== "run" && v.status !== "park").length} />
                  <FilterButton value="inRange" label="Gần trạm" count={inRangeCount} />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {nearbyLoading && (
                    <RefreshCw className="w-3.5 h-3.5 text-slate-300 animate-spin" />
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-semibold text-emerald-700 uppercase">Live</span>
                  </span>
                </div>
              </div>

              {nearbyError && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 shrink-0">
                  <p className="text-xs text-red-600">{nearbyError}</p>
                </div>
              )}

              <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
                {/* Danh sách xe */}
                <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                  {filteredVehicles.length === 0 && !nearbyError ? (
                    <div className="py-12 text-center m-auto px-6 opacity-80">
                      <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-4">
                        <Radar className="w-6 h-6 text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Không có xe phù hợp</p>
                      <p className="text-xs text-slate-400">Thử thay đổi bộ lọc hoặc chờ cập nhật (3s).</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                      {filteredVehicles.map((v, idx) => (
                        <div
                          key={v.device_id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-white border hover:bg-slate-50 transition-colors ${
                            v.inRange ? "border-emerald-200 shadow-sm" : "border-slate-100/50"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider block">
                              {v.license_plate}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              {v.vehicle_name}
                            </span>
                          </div>
                          
                          <div className="text-right shrink-0">
                            <span
                              className={`text-[9px] font-semibold px-2 py-0.5 rounded-full inline-block mb-1.5 ${
                                v.status === "run"
                                  ? "bg-emerald-100/80 text-emerald-700 border border-emerald-200"
                                  : v.status === "park"
                                    ? "bg-amber-100/80 text-amber-700 border border-amber-200"
                                    : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              {v.status === "run" ? `Đang chạy: ${v.speed}km/h` : v.status === "park" ? "Đang dừng" : "Mất K/N"}
                            </span>
                            <div className="flex items-center justify-end gap-1.5">
                              {v.inRange && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                              <span className="text-[10px] text-slate-500 tabular-nums font-medium">
                                {v.distance >= 1000 ? `${(v.distance / 1000).toFixed(1)}km` : `${v.distance}m`}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bản đồ */}
                <div className="lg:col-span-3 rounded-lg overflow-hidden border border-slate-200 min-h-[300px]">
                  <StationMap 
                    stationGps={geofenceStation.station_gps} 
                    radius={geofenceStation.station_gps_geofencing}
                    vehicles={filteredVehicles}
                  />
                </div>
              </div>

              {lastUpdated && (
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-300 mt-4 text-right tabular-nums shrink-0">
                  Cập nhật: {lastUpdated.toLocaleTimeString("vi-VN")}
                </p>
              )}
            </div>
          )}
        </div>

        <div
          className="col-span-12 lg:col-span-4 animate-slide-up"
          style={{ animationDelay: "420ms", animationFillMode: "both" }}
        >
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                {t("stationControlPanel")}
              </h2>
              <span className="text-[11px] font-bold bg-slate-700 text-white px-2.5 py-1 rounded-full tabular-nums">
                {activeStations.length} {t("totalStationsLabel")}
              </span>
            </div>
            {activeStations.length === 0 ? (
              <div className="py-8 text-center">
                <Factory className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-500">
                  {t("noStations")}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {t("noStationsHint")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeStations.map((station, idx) => (
                  <div
                    key={station.station_id}
                    className="border border-slate-200 rounded-xl p-4 hover:border-blue-200"
                    style={{
                      animation: `slide-up 0.5s cubic-bezier(0.25, 1, 0.5, 1) both`,
                      animationDelay: `${550 + idx * 60}ms`,
                      transition:
                        "border-color 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-blue-600" />
                        </div>
                      </div>

                      {/* Station name */}
                      <p className="mt-3 text-xs font-semibold text-slate-700 text-center truncate max-w-full">
                        {station.station_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
