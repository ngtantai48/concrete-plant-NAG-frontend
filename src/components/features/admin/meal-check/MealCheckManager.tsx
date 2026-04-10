"use client";

import http from "@/lib/http";
import vtrackingApi from "@/services/vtracking.service";
import {
  Button,
  DatePicker,
  InputNumber,
  message,
  Progress,
  Table,
  Tag,
  TimePicker,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  MapPin,
  RefreshCw,
  Search,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import * as XLSX from "xlsx";

interface MealResult {
  vehicle_name: string;
  license_plate: string;
  driver_name: string;
  had_meal: boolean;
  min_distance: number | null;
  reason: string;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MealCheckManager() {
  const t = useTranslations("MealCheck");

  const [date, setDate] = useState<Dayjs>(dayjs());
  const [fromTime, setFromTime] = useState<Dayjs>(dayjs().hour(11).minute(0));
  const [toTime, setToTime] = useState<Dayjs>(dayjs().hour(13).minute(0));
  const [latitude, setLatitude] = useState(17.490144886448913);
  const [longitude, setLongitude] = useState(106.55922219182935);
  const [radius, setRadius] = useState(150);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MealResult[]>([]);
  const [checked, setChecked] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [syncing, setSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const handleCheck = useCallback(async () => {
    setLoading(true);
    setResults([]);
    setChecked(false);
    setProgress({ current: 0, total: 0 });

    try {
      const dateStr = date.format("DD-MM-YYYY");
      const fromDate = `${dateStr},${fromTime.format("HH:mm")}`;
      const toDate = `${dateStr},${toTime.format("HH:mm")}`;

      const vehiclesRes = await vtrackingApi.fetchVehicles();
      const vehicles = vehiclesRes.data.vehicles || [];
      setProgress({ current: 0, total: vehicles.length });

      // Fetch driver-rice mapping from DB
      let driverMap: Record<string, string> = {};
      try {
        const drRes = await http.get<{ data: { license_plate: string; driver_name: string | null }[] }>("/driver-rice");
        const drData = drRes.data?.data || drRes.data || [];
        const list = Array.isArray(drData) ? drData : [];
        driverMap = Object.fromEntries(
          list.filter((d) => d.driver_name).map((d) => [d.license_plate, d.driver_name!])
        );
      } catch {
        // continue without driver names
      }

      const mealResults: MealResult[] = [];

      for (let i = 0; i < vehicles.length; i++) {
        const vehicle = vehicles[i];
        setProgress({ current: i + 1, total: vehicles.length });

        try {
          const historyRes = await vtrackingApi.fetchHistory(
            vehicle.id,
            fromDate,
            toDate
          );
          const logs = historyRes.data.logs || [];

          if (logs.length === 0) {
            mealResults.push({
              vehicle_name: vehicle.vehicle_name,
              license_plate: vehicle.license_plate,
              driver_name: driverMap[vehicle.license_plate] || "",
              had_meal: false,
              min_distance: null,
              reason: t("noData"),
            });
            continue;
          }

          let found = false;
          let minDist = Infinity;

          for (const log of logs) {
            const val = (log.value as Record<string, unknown>) || {};
            const lat = Number(val.latitude);
            const lng = Number(val.longitude);
            if (!lat || !lng) continue;

            const dist = haversine(latitude, longitude, lat, lng);
            if (dist < minDist) minDist = dist;
            if (dist <= radius) {
              found = true;
              break;
            }
          }

          mealResults.push({
            vehicle_name: vehicle.vehicle_name,
            license_plate: vehicle.license_plate,
            driver_name: driverMap[vehicle.license_plate] || "",
            had_meal: found,
            min_distance: minDist === Infinity ? null : Math.round(minDist),
            reason: found
              ? t("hadMeal")
              : t("nearest", { distance: Math.round(minDist) }),
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown";
          mealResults.push({
            vehicle_name: vehicle.vehicle_name,
            license_plate: vehicle.license_plate,
            driver_name: driverMap[vehicle.license_plate] || "",
            had_meal: false,
            min_distance: null,
            reason: t("error", { message }),
          });
        }
      }

      setResults(mealResults);
      setChecked(true);
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }, [date, fromTime, toTime, latitude, longitude, radius, t]);

  const hadMealCount = useMemo(() => results.filter((r) => r.had_meal).length, [results]);
  const missedMealCount = useMemo(() => results.filter((r) => !r.had_meal).length, [results]);

  const handleExportExcel = useCallback(() => {
    const rows = results.map((r) => ({
      [t("vehicleName")]: r.vehicle_name,
      [t("licensePlate")]: r.license_plate,
      [t("driverName")]: r.driver_name || "—",
      [t("status")]: r.had_meal ? t("hadMeal") : t("missedMeal"),
      [t("nearestDistance")]: r.min_distance !== null ? `${r.min_distance}m` : "—",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto column widths
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key as keyof typeof r] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cơm ca");
    XLSX.writeFile(wb, `com-ca_${date.format("DD-MM-YYYY")}.xlsx`);
  }, [results, date, t]);

  const handleSyncSheet = useCallback(async () => {
    setSyncing(true);
    try {
      const rows = results.map((r) => [
        r.vehicle_name,
        r.license_plate,
        r.driver_name || "—",
        r.had_meal ? t("hadMeal") : t("missedMeal"),
        r.min_distance !== null ? `${r.min_distance}m` : "—",
      ]);

      const res = await fetch("/api/google-sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, date: date.format("DD/MM/YYYY") }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSheetUrl(data.sheetUrl);
      message.success(t("syncSuccess", { count: data.rowCount }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      message.error(t("syncError", { message: msg }));
    } finally {
      setSyncing(false);
    }
  }, [results, date, t]);

  const handleOpenSheet = useCallback(async () => {
    if (sheetUrl) {
      window.open(sheetUrl, "_blank");
      return;
    }
    try {
      const res = await fetch("/api/google-sheets/sync");
      const data = await res.json();
      if (data.sheetUrl) {
        setSheetUrl(data.sheetUrl);
        window.open(data.sheetUrl, "_blank");
      }
    } catch {
      // silently fail
    }
  }, [sheetUrl]);

  const columns: ColumnsType<MealResult> = [
    {
      title: t("vehicleName"),
      dataIndex: "vehicle_name",
      key: "vehicle_name",
      width: 120,
      sorter: (a, b) => a.vehicle_name.localeCompare(b.vehicle_name),
    },
    {
      title: t("licensePlate"),
      dataIndex: "license_plate",
      key: "license_plate",
      width: 150,
    },
    {
      title: t("driverName"),
      dataIndex: "driver_name",
      key: "driver_name",
      width: 180,
      render: (val: string) =>
        val ? (
          <span className="font-medium text-neutral-800">{val}</span>
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
    {
      title: t("status"),
      key: "had_meal",
      width: 130,
      filters: [
        { text: t("hadMeal"), value: true },
        { text: t("missedMeal"), value: false },
      ],
      onFilter: (value, record) => record.had_meal === value,
      render: (_: unknown, record: MealResult) =>
        record.had_meal ? (
          <Tag color="success" className="flex items-center gap-1 w-fit">
            <CheckCircle size={13} />
            {t("hadMeal")}
          </Tag>
        ) : (
          <Tag color="error" className="flex items-center gap-1 w-fit">
            <XCircle size={13} />
            {t("missedMeal")}
          </Tag>
        ),
    },
    {
      title: t("nearestDistance"),
      key: "min_distance",
      width: 150,
      sorter: (a, b) => (a.min_distance ?? Infinity) - (b.min_distance ?? Infinity),
      render: (_: unknown, record: MealResult) => {
        if (record.min_distance === null) return <span className="text-neutral-400">—</span>;
        const isClose = record.min_distance <= radius;
        return (
          <span className={isClose ? "text-emerald-700 font-semibold" : "text-neutral-600"}>
            {record.min_distance}m
          </span>
        );
      },
    },
    {
      title: "",
      key: "reason",
      dataIndex: "reason",
      ellipsis: true,
      render: (text: string) => <span className="text-neutral-500 text-sm">{text}</span>,
    },
  ];

  return (
    <div className="px-6 py-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <UtensilsCrossed size={22} className="text-amber-600" strokeWidth={2.5} />
          <h1 className="text-2xl font-bold m-0 tracking-tight text-neutral-800">
            {t("title")}
          </h1>
        </div>
        <p className="text-neutral-500 text-sm m-0 ml-[34px]">{t("description")}</p>
      </div>

      {/* Controls */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5 mb-6">
        <div className="flex flex-wrap items-end gap-5">
          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
              {t("date")}
            </label>
            <DatePicker
              value={date}
              onChange={(val) => val && setDate(val)}
              format="DD/MM/YYYY"
              allowClear={false}
              style={{ width: 150 }}
            />
          </div>

          {/* Time range */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
              {t("timeRange")}
            </label>
            <div className="flex items-center gap-2">
              <TimePicker
                value={fromTime}
                onChange={(val) => val && setFromTime(val)}
                format="HH:mm"
                minuteStep={15}
                allowClear={false}
                style={{ width: 100 }}
              />
              <span className="text-neutral-400 font-medium">—</span>
              <TimePicker
                value={toTime}
                onChange={(val) => val && setToTime(val)}
                format="HH:mm"
                minuteStep={15}
                allowClear={false}
                style={{ width: 100 }}
              />
            </div>
          </div>

          {/* Location toggle */}
          <button
            type="button"
            onClick={() => setShowLocation(!showLocation)}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide
              hover:text-neutral-700 transition-colors cursor-pointer bg-transparent border-0 pb-2"
          >
            <MapPin size={13} />
            {t("locationSettings")}
            {showLocation ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {/* Check button */}
          <div className="ml-auto">
            <Button
              type="primary"
              icon={<Search size={15} />}
              onClick={handleCheck}
              loading={loading}
              size="large"
              style={{
                backgroundColor: "#b45309",
                borderColor: "#b45309",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              {t("check")}
            </Button>
          </div>
        </div>

        {/* Location settings (collapsible) */}
        {showLocation && (
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-neutral-200">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
                {t("latitude")}
              </label>
              <InputNumber
                value={latitude}
                onChange={(val) => val !== null && setLatitude(val)}
                step={0.0001}
                style={{ width: 180 }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
                {t("longitude")}
              </label>
              <InputNumber
                value={longitude}
                onChange={(val) => val !== null && setLongitude(val)}
                step={0.0001}
                style={{ width: 180 }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
                {t("radius")}
              </label>
              <InputNumber
                value={radius}
                onChange={(val) => val !== null && setRadius(val)}
                min={10}
                max={1000}
                step={10}
                style={{ width: 120 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {loading && progress.total > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-neutral-500">
              {t("progress", { current: progress.current, total: progress.total })}
            </span>
            <span className="text-sm font-semibold text-neutral-700">
              {Math.round((progress.current / progress.total) * 100)}%
            </span>
          </div>
          <Progress
            percent={Math.round((progress.current / progress.total) * 100)}
            showInfo={false}
            strokeColor="#b45309"
            size="small"
          />
        </div>
      )}

      {/* Summary stats */}
      {checked && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Tooltip title={t("totalVehicles")}>
            <div className="flex items-center gap-2 bg-neutral-100 border border-neutral-200 rounded-md px-4 py-2.5">
              <span className="text-2xl font-bold text-neutral-800 tabular-nums leading-none">
                {results.length}
              </span>
              <span className="text-xs text-neutral-500 font-medium uppercase">{t("totalVehicles")}</span>
            </div>
          </Tooltip>

          <Tooltip title={t("hadMeal")}>
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-2.5">
              <span className="text-2xl font-bold text-emerald-700 tabular-nums leading-none">
                {hadMealCount}
              </span>
              <span className="text-xs text-emerald-600 font-medium uppercase">{t("hadMeal")}</span>
            </div>
          </Tooltip>

          <Tooltip title={t("missedMeal")}>
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-4 py-2.5">
              <span className="text-2xl font-bold text-red-700 tabular-nums leading-none">
                {missedMealCount}
              </span>
              <span className="text-xs text-red-600 font-medium uppercase">{t("missedMeal")}</span>
            </div>
          </Tooltip>

          <div className="ml-auto flex items-center gap-2">
            <Button
              icon={<Download size={15} />}
              onClick={handleExportExcel}
              disabled={results.length === 0}
              style={{ fontWeight: 600 }}
            >
              {t("exportExcel")}
            </Button>
            <Button
              icon={<RefreshCw size={15} className={syncing ? "animate-spin" : ""} />}
              onClick={handleSyncSheet}
              loading={syncing}
              disabled={results.length === 0}
              style={{ fontWeight: 600 }}
            >
              {t("syncSheet")}
            </Button>
            <Button
              icon={<ExternalLink size={15} />}
              onClick={handleOpenSheet}
              style={{ fontWeight: 600 }}
            >
              {t("openSheet")}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Table
        columns={columns}
        dataSource={results}
        rowKey={(record) => `${record.vehicle_name}-${record.license_plate}`}
        loading={loading && progress.total === 0}
        pagination={{ pageSize: 50, size: "small", showSizeChanger: false }}
        scroll={{ x: 800 }}
        size="middle"
        rowClassName={(record) =>
          record.had_meal
            ? "bg-emerald-50/40 hover:bg-emerald-50/70!"
            : "bg-red-50/30 hover:bg-red-50/50!"
        }
      />
    </div>
  );
}
