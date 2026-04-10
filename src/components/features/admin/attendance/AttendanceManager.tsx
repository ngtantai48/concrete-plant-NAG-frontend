"use client";

import { Button, message, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CalendarCheck,
  Clock,
  Download,
  ExternalLink,
  RefreshCw,
  UserCheck,
  UserMinus,
  UserX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

interface AttendanceResult {
  tenVT: string;
  hoTen: string;
  boPhan: string;
  status: string; // "1" | "0" | "0.5"
}

interface NhomInfo {
  key: string;
  ten: string;
  nhanSu: string[];
}

interface Summary {
  total: number;
  working: number;
  off: number;
  half: number;
}

export default function AttendanceManager() {
  const t = useTranslations("Attendance");

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AttendanceResult[]>([]);
  const [nhomNS, setNhomNS] = useState<NhomInfo[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checked, setChecked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [sheetDate, setSheetDate] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setResults([]);
    setChecked(false);
    setSummary(null);

    try {
      const res = await fetch("/api/google-sheets/attendance");
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setResults(data.results);
      setNhomNS(data.nhomNS);
      setSummary(data.summary);
      setSheetDate(data.sheetDate || "");
      setChecked(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      message.error(t("fetchError") + ": " + msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Build grouped data
    const sheetData: (string | number)[][] = [];
    sheetData.push([
      `BẢNG CHẤM CÔNG - ${sheetDate}`,
    ]);
    sheetData.push([]);
    sheetData.push(["STT", t("fullName"), t("shortName"), t("department"), t("status")]);

    let stt = 1;
    for (const nhom of nhomNS) {
      sheetData.push([nhom.key, nhom.ten, "", "", ""]);
      for (const tenVT of nhom.nhanSu) {
        const r = results.find((x) => x.tenVT === tenVT);
        if (r) {
          sheetData.push([stt, r.hoTen, r.tenVT, r.boPhan, r.status]);
          stt++;
        }
      }
    }

    // Summary
    sheetData.push([]);
    sheetData.push([t("summary")]);
    if (summary) {
      sheetData.push([t("totalStaff"), summary.total]);
      sheetData.push([t("working"), summary.working]);
      sheetData.push([t("off"), summary.off]);
      sheetData.push([t("halfDay"), summary.half]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = [{ wch: 6 }, { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, "Chấm công");
    XLSX.writeFile(wb, `cham-cong_${sheetDate.replace(/\//g, "-")}.xlsx`);
  }, [results, nhomNS, summary, sheetDate, t]);

  const handleSyncSheet = useCallback(async () => {
    setSyncing(true);
    try {
      const dateStr = sheetDate;
      const res = await fetch("/api/google-sheets/attendance/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, results, nhomNS }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSheetUrl(data.sheetUrl);
      message.success(t("syncSuccess", { count: data.updated, sheet: data.sheetName }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      message.error(t("syncError", { message: msg }));
    } finally {
      setSyncing(false);
    }
  }, [results, nhomNS, sheetDate, t]);

  const handleOpenSheet = useCallback(async () => {
    if (sheetUrl) {
      window.open(sheetUrl, "_blank");
      return;
    }
    const spreadsheetId = "10qL7z3dyLgAfVhCPICVYYFCLxleZfWaRzQh7XOm1wTA";
    window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, "_blank");
  }, [sheetUrl]);

  const columns: ColumnsType<AttendanceResult> = [
    {
      title: t("fullName"),
      dataIndex: "hoTen",
      key: "hoTen",
      width: 200,
      sorter: (a, b) => a.hoTen.localeCompare(b.hoTen),
    },
    {
      title: t("shortName"),
      dataIndex: "tenVT",
      key: "tenVT",
      width: 130,
    },
    {
      title: t("department"),
      dataIndex: "boPhan",
      key: "boPhan",
      width: 180,
      filters: [...new Set(results.map((r) => r.boPhan))].map((bp) => ({
        text: bp,
        value: bp,
      })),
      onFilter: (value, record) => record.boPhan === value,
    },
    {
      title: t("status"),
      key: "status",
      width: 130,
      filters: [
        { text: t("working") + " (1)", value: "1" },
        { text: t("off") + " (0)", value: "0" },
        { text: t("halfDay") + " (0.5)", value: "0.5" },
      ],
      onFilter: (value, record) => record.status === value,
      render: (_: unknown, record: AttendanceResult) => {
        if (record.status === "1") {
          return (
            <Tag color="success" className="flex items-center gap-1 w-fit">
              <UserCheck size={13} />
              1
            </Tag>
          );
        }
        if (record.status === "0.5") {
          return (
            <Tag color="warning" className="flex items-center gap-1 w-fit">
              <Clock size={13} />
              0.5
            </Tag>
          );
        }
        return (
          <Tag color="error" className="flex items-center gap-1 w-fit">
            <UserX size={13} />
            0
          </Tag>
        );
      },
    },
  ];

  return (
    <div className="px-6 py-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <CalendarCheck size={22} className="text-blue-600" strokeWidth={2.5} />
          <h1 className="text-2xl font-bold m-0 tracking-tight text-neutral-800">
            {t("title")}
          </h1>
        </div>
        <p className="text-neutral-500 text-sm m-0 ml-[34px]">{t("description")}</p>
      </div>

      {/* Controls */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5 mb-6">
        <div className="flex flex-wrap items-center gap-5">
          {sheetDate && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                {t("date")}:
              </span>
              <span className="text-base font-bold text-neutral-800">{sheetDate}</span>
              <span className="text-neutral-400 text-xs">({t("readFromSheet")})</span>
            </div>
          )}

          {!sheetDate && !loading && (
            <p className="text-neutral-400 text-sm m-0">{t("readFromSheet")}</p>
          )}

          <div className="ml-auto">
            <Button
              type="primary"
              icon={<RefreshCw size={15} />}
              onClick={fetchData}
              loading={loading}
              size="large"
              style={{
                backgroundColor: "#2563eb",
                borderColor: "#2563eb",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              {t("process")}
            </Button>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {checked && summary && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Tooltip title={t("totalStaff")}>
            <div className="flex items-center gap-2 bg-neutral-100 border border-neutral-200 rounded-md px-4 py-2.5">
              <span className="text-2xl font-bold text-neutral-800 tabular-nums leading-none">
                {summary.total}
              </span>
              <span className="text-xs text-neutral-500 font-medium uppercase">
                {t("totalStaff")}
              </span>
            </div>
          </Tooltip>

          <Tooltip title={t("working")}>
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-2.5">
              <span className="text-2xl font-bold text-emerald-700 tabular-nums leading-none">
                {summary.working}
              </span>
              <span className="text-xs text-emerald-600 font-medium uppercase">
                {t("working")}
              </span>
            </div>
          </Tooltip>

          <Tooltip title={t("off")}>
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-4 py-2.5">
              <span className="text-2xl font-bold text-red-700 tabular-nums leading-none">
                {summary.off}
              </span>
              <span className="text-xs text-red-600 font-medium uppercase">{t("off")}</span>
            </div>
          </Tooltip>

          <Tooltip title={t("halfDay")}>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5">
              <span className="text-2xl font-bold text-amber-700 tabular-nums leading-none">
                {summary.half}
              </span>
              <span className="text-xs text-amber-600 font-medium uppercase">
                {t("halfDay")}
              </span>
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
        rowKey={(record) => record.tenVT}
        loading={loading}
        pagination={{ pageSize: 50, size: "small", showSizeChanger: false }}
        scroll={{ x: 700 }}
        size="middle"
        rowClassName={(record) =>
          record.status === "1"
            ? "bg-emerald-50/40 hover:bg-emerald-50/70!"
            : record.status === "0.5"
              ? "bg-amber-50/40 hover:bg-amber-50/70!"
              : "bg-red-50/30 hover:bg-red-50/50!"
        }
      />
    </div>
  );
}
