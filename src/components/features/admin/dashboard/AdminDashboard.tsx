"use client";

import driverApi from "@/services/driver.service";
import type { Driver } from "@/services/driver.service";
import vehicleApi from "@/services/vehicle.service";
import type { Vehicle } from "@/services/vehicle.service";
import stationApi from "@/services/station.service";
import type { Station } from "@/services/station.service";
import userVehicleApi from "@/services/user-vehicle.service";
import type { UserVehicle } from "@/services/user-vehicle.service";
import { Skeleton, Table, Tooltip } from "antd";
import { MapPin, ArrowRight, RefreshCw, Car, CircleCheck, Users, Building2, Truck, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardCard from "@/components/features/admin/dashboard/DashboardCard";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function AdminDashboard() {
  const t = useTranslations("DashboardPage");
  const tCommon = useTranslations("Common");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [assignments, setAssignments] = useState<UserVehicle[]>([]);
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
      const [vRes, dRes, sRes, aRes] = await Promise.all([
        vehicleApi.getAll(),
        driverApi.getAll(),
        stationApi.getAll(),
        userVehicleApi.getAll(),
      ]);
      setVehicles(vRes.data?.data || vRes.data || []);
      setDrivers(dRes.data?.data || dRes.data || []);
      setStations(sRes.data?.data || sRes.data || []);
      setAssignments(aRes.data?.data || aRes.data || []);
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

  const availableVehicles = useMemo(
    () => vehicles.filter((v) => v.vehicle_status === "available"),
    [vehicles],
  );

  const unavailableVehicles = useMemo(
    () => vehicles.filter((v) => v.vehicle_status !== "available"),
    [vehicles],
  );

  const activeStations = useMemo(
    () => stations.filter((s) => s.station_status === "active"),
    [stations],
  );

  const activeDrivers = useMemo(
    () =>
      drivers.filter(
        (d) => d.user_status === "online" && d.role === "driver",
      ),
    [drivers],
  );

  const getDriverName = (userId: number) => {
    const d = drivers.find((dr) => dr.user_id === userId);
    return d?.user_full_name || `#${userId}`;
  };

  const getVehiclePlate = (vehicleId: number) => {
    const v = vehicles.find((ve) => ve.vehicle_id === vehicleId);
    return v?.vehicle_license_plate || `#${vehicleId}`;
  };

  const vehicleColumns = [
    {
      title: "#",
      key: "index",
      width: 36,
      align: "center" as const,
      render: (_: unknown, __: unknown, idx: number) => (
        <span className="text-slate-400 text-[11px] tabular-nums">
          {String(idx + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      title: t("plate"),
      dataIndex: "vehicle_license_plate",
      key: "plate",
      render: (val: string) => (
        <span className="font-semibold text-slate-800 tracking-wider text-xs uppercase">
          {val}
        </span>
      ),
    },
  ];

  const assignmentColumns = [
    {
      title: "#",
      key: "index",
      width: 36,
      align: "center" as const,
      render: (_: unknown, __: unknown, idx: number) => (
        <span className="text-slate-400 text-[11px] tabular-nums">
          {String(idx + 1).padStart(2, "0")}
        </span>
      ),
    },
    {
      title: t("plate"),
      dataIndex: "vehicle_id",
      key: "plate",
      render: (val: number) => (
        <span className="font-semibold text-slate-800 tracking-wider text-xs uppercase">
          {getVehiclePlate(val)}
        </span>
      ),
    },
    {
      title: t("driver"),
      dataIndex: "user_id",
      key: "driver",
      render: (val: number) => (
        <span className="text-xs text-slate-600">{getDriverName(val)}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="m-4 md:m-6 lg:m-8 max-w-[1600px] lg:mx-auto space-y-6">
        <Skeleton active paragraph={{ rows: 1 }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <Skeleton active paragraph={{ rows: 2 }} title={false} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <Skeleton active paragraph={{ rows: 8 }} title={false} />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <Skeleton active paragraph={{ rows: 10 }} />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <Skeleton active paragraph={{ rows: 8 }} title={false} />
            </div>
          </div>
        </div>
      </div>
    );
  }

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DashboardCard
          label={t("totalVehicles")}
          value={vehicles.length}
          icon={<Car className="w-5 h-5" />}
          accent="blue"
          index={0}
        />
        <DashboardCard
          label={t("readyVehicles")}
          value={availableVehicles.length}
          icon={<CircleCheck className="w-5 h-5" />}
          accent="emerald"
          subtitle={`${vehicles.length > 0 ? Math.round((availableVehicles.length / vehicles.length) * 100) : 0}%`}
          index={1}
        />
        <DashboardCard
          label={t("activeDrivers")}
          value={activeDrivers.length}
          icon={<Users className="w-5 h-5" />}
          accent="amber"
          subtitle={`/ ${drivers.filter((d) => d.role === "driver").length} ${t("totalDrivers")}`}
          index={2}
        />
        <DashboardCard
          label={t("activeStationsCard")}
          value={activeStations.length}
          icon={<Building2 className="w-5 h-5" />}
          accent="slate"
          subtitle={`/ ${stations.length} ${t("totalStationsLabel")}`}
          index={3}
        />
      </div>

      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        <div
          className="col-span-12 lg:col-span-3 space-y-4 animate-slide-up"
          style={{ animationDelay: "350ms", animationFillMode: "both" }}
        >
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
                {t("readyVehicles")}
              </h2>
              <span className="text-[11px] font-bold bg-emerald-600 text-white w-6 h-6 rounded-full flex items-center justify-center tabular-nums">
                {availableVehicles.length}
              </span>
            </div>
            <Table
              columns={vehicleColumns}
              dataSource={availableVehicles}
              rowKey="vehicle_id"
              pagination={false}
              size="small"
              scroll={{ y: 260 }}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-red-700">
                {t("inactiveVehicles")}
              </h2>
              <span className="text-[11px] font-bold bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center tabular-nums">
                {unavailableVehicles.length}
              </span>
            </div>
            {unavailableVehicles.length === 0 ? (
              <div className="py-10 text-center">
                <CircleCheck className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">{t("allVehiclesReady")}</p>
              </div>
            ) : (
              <Table
                columns={vehicleColumns}
                dataSource={unavailableVehicles}
                rowKey="vehicle_id"
                pagination={false}
                size="small"
                scroll={{ y: 180 }}
              />
            )}
          </div>
        </div>

        <div
          className="col-span-12 lg:col-span-6 space-y-4 animate-slide-up"
          style={{ animationDelay: "420ms", animationFillMode: "both" }}
        >
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
                  {t("totalTrips")}
                </h2>
                <div className="flex items-center gap-1.5">
                  {String(assignments.length)
                    .padStart(3, "0")
                    .split("")
                    .map((digit, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center justify-center w-9 h-11 bg-slate-900 text-white text-lg font-bold rounded-md tabular-nums"
                      >
                        {digit}
                      </span>
                    ))}
                </div>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Navigation className="w-5 h-5 text-slate-600" />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                {t("activeRoutes")}
              </h3>
              {assignments.length === 0 ? (
                <div className="py-8 text-center">
                  <Truck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-500">
                    {t("noActiveRoutes")}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {t("noRoutesHint")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignments.slice(0, 6).map((a, idx) => (
                    <div
                      key={a.user_vehicle_id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 group/row"
                      style={{
                        animation: `slide-up 0.5s cubic-bezier(0.25, 1, 0.5, 1) both`,
                        animationDelay: `${500 + idx * 60}ms`,
                      }}
                    >
                      <span className="text-[11px] text-slate-400 tabular-nums w-5">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="font-semibold text-sm text-slate-800 uppercase tracking-wider min-w-[100px]">
                        {getVehiclePlate(a.vehicle_id)}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0 group-hover/row:translate-x-0.5" />
                      <span className="text-sm text-slate-600 truncate">
                        {getDriverName(a.user_id)}
                      </span>
                    </div>
                  ))}
                  {assignments.length > 6 && (
                    <p className="text-xs text-slate-400 text-center pt-1">
                      +{assignments.length - 6} {t("more")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
              {t("stationStatus")}
            </h2>
            {activeStations.length === 0 ? (
              <div className="py-8 text-center">
                <MapPin className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-500">
                  {t("noStations")}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {t("noStationsHint")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                        <h3 className="text-sm font-semibold text-slate-800 truncate">
                          {station.station_name}
                        </h3>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mt-2 shrink-0" />
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1 pl-[42px]">
                      {station.station_address || "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          className="col-span-12 lg:col-span-3 animate-slide-up"
          style={{ animationDelay: "480ms", animationFillMode: "both" }}
        >
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-blue-700">
                {t("assignedVehicles")}
              </h2>
              <span className="text-[11px] font-bold bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center tabular-nums">
                {assignments.length}
              </span>
            </div>
            {assignments.length === 0 ? (
              <div className="py-10 text-center">
                <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-500">{t("noAssignments")}</p>
              </div>
            ) : (
              <Table
                columns={assignmentColumns}
                dataSource={assignments}
                rowKey="user_vehicle_id"
                pagination={false}
                size="small"
                scroll={{ y: 500 }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
