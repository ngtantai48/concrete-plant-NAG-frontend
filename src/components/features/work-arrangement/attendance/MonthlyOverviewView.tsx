"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  workAttendanceApi,
  type WorkAttendanceRangeExportData,
} from "@/services/work-arrangement.service";
import type { WorkAttendanceStatus } from "@/types/work-arrangement";
import { DatePicker, Drawer, Empty, message, Modal, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { CalendarCheck, Download, Eye, Loader2, Printer, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import AttendancePreviewPdf from "./AttendancePreviewPdf";
import {
  getAttendanceCellValue,
  getAttendancePoints,
  getDateList,
  groupByDepartment,
  STATUS_META,
  WEEKDAY_LABELS,
  type AttendancePreviewReport,
} from "./shared";

const WEEK_HEADER = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

type OffEntry = {
  user_id: number;
  name: string;
  department?: string | null;
  status: WorkAttendanceStatus;
};

type MonthlyOverviewViewProps = {
  onMarkDay?: (date: string) => void;
  showMarkDayAction?: boolean;
  compact?: boolean;
};

export default function MonthlyOverviewView({
  onMarkDay,
  showMarkDayAction = true,
  compact = false,
}: MonthlyOverviewViewProps) {
  const t = useTranslations("WorkAttendancePage");

  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorkAttendanceRangeExportData | null>(null);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewReport, setPreviewReport] = useState<AttendancePreviewReport | null>(null);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const from = month.startOf("month").format("YYYY-MM-DD");
      const to = month.endOf("month").format("YYYY-MM-DD");
      setData(await workAttendanceApi.getRangeExportData(from, to));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("loadFailed")}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [month, t]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const offByDate = useMemo(() => {
    const map = new Map<string, OffEntry[]>();
    if (!data) return map;

    const personById = new Map(data.personnel.map((person) => [person.user_id, person]));

    for (const [date, statuses] of Object.entries(data.statusesByDate)) {
      const list = Object.entries(statuses)
        .filter(([, status]) => status !== "working")
        .map(([userId, status]) => {
          const person = personById.get(Number(userId));
          return {
            user_id: Number(userId),
            name: person?.user_full_name || `#${userId}`,
            department: person?.department_name,
            status: status as WorkAttendanceStatus,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "vi"));

      if (list.length) map.set(date, list);
    }

    return map;
  }, [data]);

  const monthCells = useMemo(() => {
    const start = month.startOf("month");
    const daysInMonth = month.daysInMonth();
    const lead = (start.day() + 6) % 7;
    const cells: (Dayjs | null)[] = [];

    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(start.date(d));

    return cells;
  }, [month]);

  const monthStats = useMemo(() => {
    let markedDays = 0;
    let offEntries = 0;
    if (data) {
      for (const value of Object.values(data.markedDates)) if (value) markedDays += 1;
      for (const list of offByDate.values()) offEntries += list.length;
    }
    return { markedDays, offEntries };
  }, [data, offByDate]);

  const statusLabel = useCallback(
    (status: WorkAttendanceStatus) => {
      if (status === "morning") return t("morning");
      if (status === "afternoon") return t("afternoon");
      if (status === "full_day") return t("fullDayOff");
      return t("working");
    },
    [t]
  );

  const monthTitle = useCallback(
    () => t("exportTitleMonth", { month: month.format("MM"), year: month.format("YYYY") }),
    [month, t]
  );

  const buildReport = useCallback((): AttendancePreviewReport => {
    if (!data) throw new Error(t("emptyPreview"));

    const from = month.startOf("month");
    const to = month.endOf("month");
    const dates = getDateList(from, to);
    const sortedGroups = groupByDepartment(data.personnel, t("unknownDepartment"));

    let stt = 1;
    const totalByDay = new Array(dates.length).fill(0);
    const groups = sortedGroups.map(([departmentName, people], groupIndex) => {
      const rows = people
        .slice()
        .sort((a, b) => a.user_full_name.localeCompare(b.user_full_name, "vi"))
        .map((person) => {
          let total = 0;
          const values = dates.map((date, index) => {
            const dateKey = date.format("YYYY-MM-DD");
            const isMarkedDate = Boolean(data.markedDates[dateKey]);
            const status = data.statusesByDate[dateKey]?.[person.user_id];
            total += getAttendancePoints(status, isMarkedDate);
            totalByDay[index] += getAttendancePoints(status, isMarkedDate);
            return getAttendanceCellValue(status, isMarkedDate);
          });
          return { stt: stt++, person, values, total };
        });

      return { departmentName, groupIndex, rows };
    });

    return {
      title: monthTitle(),
      dates,
      groups,
      totalByDay,
      grandTotal: totalByDay.reduce((sum, value) => sum + value, 0),
    };
  }, [data, month, monthTitle, t]);

  const handlePreview = useCallback(async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      setPreviewReport(buildReport());
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("previewFailed")}: ${msg}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [buildReport, t]);

  const handlePrintPreview = useCallback(() => {
    const content = document.getElementById("attendance-preview-pdf");
    if (!content) return;

    const popup = window.open("", "_blank", "width=1280,height=900");
    if (!popup) {
      message.warning(t("popupBlocked"));
      return;
    }

    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${previewReport?.title || t("previewTitle")}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #fff; font-family: Arial, sans-serif; color: #111827; }
            .attendance-pdf-page { width: 100%; padding: 0; background: #fff; }
            .attendance-pdf-title { text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 8px; text-transform: uppercase; }
            .attendance-pdf-department { text-align: center; font-size: 12px; font-weight: 700; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8px; }
            th, td { border: 1px solid #94a3b8; padding: 3px 4px; text-align: center; vertical-align: middle; }
            th { background: #e2e8f0; font-weight: 700; }
            .name-cell { text-align: left; width: 150px; }
            .stt-cell { width: 34px; }
            .day-cell { width: 28px; }
            .total-cell { width: 48px; }
            .group-row td { background: #f1f5f9; font-weight: 700; text-align: left; }
            .total-row td { background: #e2e8f0; font-weight: 700; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }, [previewReport?.title, t]);

  const handleExport = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      const from = month.startOf("month");
      const to = month.endOf("month");
      const dates = getDateList(from, to);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(t("exportSheetName"));
      const totalCols = 2 + dates.length + 3;
      const totalStartCol = 3 + dates.length;
      const title = monthTitle();

      worksheet.properties.defaultRowHeight = 22;
      worksheet.views = [{ showGridLines: false }];
      worksheet.columns = Array.from({ length: totalCols }).map((_, index) => ({
        width: index === 0 ? 8 : index === 1 ? 28 : index >= totalStartCol - 1 ? 13 : 6,
      }));

      worksheet.mergeCells(1, 1, 1, totalCols);
      worksheet.getCell(1, 1).value = title;
      worksheet.getCell(1, 1).font = { bold: true, size: 15 };
      worksheet.getCell(1, 1).alignment = { horizontal: "center", vertical: "middle" };
      worksheet.getRow(1).height = 28;

      worksheet.mergeCells(2, 1, 2, totalCols);
      worksheet.getCell(2, 1).value = t("exportDepartmentLine");
      worksheet.getCell(2, 1).font = { bold: true };
      worksheet.getCell(2, 1).alignment = { horizontal: "center" };

      worksheet.getCell(3, 1).value = "STT";
      worksheet.getCell(3, 2).value = t("fullName");
      worksheet.mergeCells(3, 3, 3, 2 + dates.length);
      worksheet.getCell(3, 3).value = t("exportDayHeader");
      worksheet.getCell(3, totalStartCol).value = t("regularWork");
      worksheet.getCell(3, totalStartCol + 1).value = t("holidayWork");
      worksheet.getCell(3, totalStartCol + 2).value = t("totalWork");

      dates.forEach((date, index) => {
        const col = 3 + index;
        worksheet.getCell(4, col).value = WEEKDAY_LABELS[date.day()];
        worksheet.getCell(5, col).value = date.date();
      });

      worksheet.mergeCells(4, 1, 5, 1);
      worksheet.mergeCells(4, 2, 5, 2);
      worksheet.mergeCells(4, totalStartCol, 5, totalStartCol);
      worksheet.mergeCells(4, totalStartCol + 1, 5, totalStartCol + 1);
      worksheet.mergeCells(4, totalStartCol + 2, 5, totalStartCol + 2);

      const sortedGroups = groupByDepartment(data.personnel, t("unknownDepartment"));

      let rowIndex = 6;
      let stt = 1;
      const totalByDay = new Array(dates.length).fill(0);

      sortedGroups.forEach(([departmentName, people], groupIndex) => {
        worksheet.getCell(rowIndex, 1).value = String.fromCharCode(65 + groupIndex);
        worksheet.getCell(rowIndex, 2).value = departmentName;
        worksheet.mergeCells(rowIndex, 2, rowIndex, totalCols);
        worksheet.getRow(rowIndex).font = { bold: true };
        worksheet.getRow(rowIndex).height = 24;
        rowIndex += 1;

        people
          .slice()
          .sort((a, b) => a.user_full_name.localeCompare(b.user_full_name, "vi"))
          .forEach((person) => {
            worksheet.getCell(rowIndex, 1).value = stt;
            worksheet.getCell(rowIndex, 2).value = person.user_full_name;

            let total = 0;
            dates.forEach((date, index) => {
              const dateKey = date.format("YYYY-MM-DD");
              const isMarkedDate = Boolean(data.markedDates[dateKey]);
              const status = data.statusesByDate[dateKey]?.[person.user_id];
              worksheet.getCell(rowIndex, 3 + index).value = getAttendanceCellValue(
                status,
                isMarkedDate
              );
              total += getAttendancePoints(status, isMarkedDate);
              totalByDay[index] += getAttendancePoints(status, isMarkedDate);
            });

            worksheet.getCell(rowIndex, totalStartCol).value = total;
            worksheet.getCell(rowIndex, totalStartCol + 1).value = 0;
            worksheet.getCell(rowIndex, totalStartCol + 2).value = total;
            rowIndex += 1;
            stt += 1;
          });
      });

      worksheet.getCell(rowIndex, 1).value = t("totalRow");
      worksheet.mergeCells(rowIndex, 1, rowIndex, 2);
      worksheet.getRow(rowIndex).font = { bold: true };
      let grandTotal = 0;
      totalByDay.forEach((value, index) => {
        worksheet.getCell(rowIndex, 3 + index).value = value;
        grandTotal += value;
      });
      worksheet.getCell(rowIndex, totalStartCol).value = grandTotal;
      worksheet.getCell(rowIndex, totalStartCol + 1).value = 0;
      worksheet.getCell(rowIndex, totalStartCol + 2).value = grandTotal;

      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };

      for (let row = 3; row <= rowIndex; row += 1) {
        for (let col = 1; col <= totalCols; col += 1) {
          const cell = worksheet.getCell(row, col);
          cell.border = thinBorder;
          cell.alignment = {
            horizontal: col === 2 ? "left" : "center",
            vertical: "middle",
            wrapText: true,
          };
          if (row <= 5) {
            cell.font = { bold: true };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
          }
        }
      }

      for (let row = 6; row <= rowIndex; row += 1) {
        const first = worksheet.getCell(row, 1).value;
        if (typeof first === "string") {
          for (let col = 1; col <= totalCols; col += 1) {
            worksheet.getCell(row, col).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF1F5F9" },
            };
          }
        }
      }

      worksheet.views = [{ state: "frozen", xSplit: 2, ySplit: 5, showGridLines: false }];

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `bang-cong_${from.format("DD-MM-YYYY")}_${to.format("DD-MM-YYYY")}.xlsx`
      );
      message.success(t("exportSuccess"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("unknownError");
      message.error(`${t("exportFailed")}: ${msg}`);
    } finally {
      setExporting(false);
    }
  }, [data, month, monthTitle, t]);

  const drawerOff = drawerDate ? offByDate.get(drawerDate) || [] : [];
  const drawerMarked = drawerDate ? Boolean(data?.markedDates[drawerDate]) : false;

  return (
    <div>
      {/* Toolbar */}
      <div
        className={cn(
          "border-b border-slate-200",
          compact
            ? "flex items-center gap-1.5 pb-2"
            : "flex flex-wrap items-center gap-x-3 gap-y-2 pb-3"
        )}
      >
        <DatePicker
          picker="month"
          value={month}
          onChange={(value) => value && setMonth(value.startOf("month"))}
          format="MM/YYYY"
          allowClear={false}
          className={cn(compact ? "h-8 w-[104px] shrink-0" : "h-9 w-[130px]")}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadMonth}
          disabled={loading}
          title={t("reload")}
          className={cn(
            "h-9 border-slate-200 text-slate-700 hover:bg-slate-50",
            compact && "h-8 w-8 shrink-0 rounded-none px-0"
          )}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={15} />}
          <span className={compact ? "sr-only" : undefined}>{t("reload")}</span>
        </Button>

        <div className={cn("flex items-center gap-2", compact ? "ml-auto gap-1.5" : "ml-auto")}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={loading || !data}
            title={t("previewButton")}
            className={cn(
              "h-9 border-slate-200 text-slate-700 hover:bg-slate-50",
              compact && "h-8 w-8 rounded-none px-0"
            )}
          >
            <Eye size={15} />
            <span className={compact ? "sr-only" : "hidden sm:inline"}>{t("previewButton")}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleExport}
            disabled={exporting || !data}
            title={t("exportButton")}
            className={cn(
              "h-9 bg-teal-600 font-semibold text-white hover:bg-teal-700",
              compact && "h-8 rounded-none px-2.5"
            )}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download size={15} />}
            <span className={compact ? "inline" : "hidden sm:inline"}>
              {compact ? t("exportShortButton") : t("exportButton")}
            </span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div
        className={cn(
          "flex flex-wrap items-center text-slate-600",
          compact ? "mt-2 gap-3 text-xs" : "mt-3 gap-4 text-sm"
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarCheck size={compact ? 14 : 15} className="text-teal-600" />
          {t("markedDaysLabel")}
          <b className="text-slate-900">{monthStats.markedDays}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          {t("offEntriesLabel")}
          <b className="text-slate-900">{monthStats.offEntries}</b>
        </span>
      </div>

      {/* Calendar */}
      <div
        className={cn(
          "rounded-lg border border-slate-200 bg-white",
          compact ? "mt-2 p-1.5" : "mt-3 p-2 sm:p-3"
        )}
      >
        {loading ? (
          <div className="p-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : (
          <>
            <div className={cn("grid grid-cols-7", compact ? "gap-0.5" : "gap-1")}>
              {WEEK_HEADER.map((label) => (
                <div
                  key={label}
                  className={cn(
                    "py-1 text-center font-semibold uppercase tracking-wide text-slate-400",
                    compact ? "text-[11px]" : "text-xs"
                  )}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className={cn("mt-1 grid grid-cols-7", compact ? "gap-0.5" : "gap-1")}>
              {monthCells.map((day, index) => {
                if (!day) return <div key={`blank-${index}`} className="aspect-square" />;

                const dateStr = day.format("YYYY-MM-DD");
                const off = offByDate.get(dateStr);
                const marked = Boolean(data?.markedDates[dateStr]);
                const isToday = day.isSame(dayjs(), "day");
                const offCount = off?.length ?? 0;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setDrawerDate(dateStr)}
                    className={[
                      compact
                        ? "relative aspect-square min-w-0 rounded border p-1 text-left align-top text-xs transition-colors"
                        : "relative aspect-square min-w-0 rounded-md border p-1.5 text-left align-top text-sm transition-colors",
                      offCount > 0
                        ? "border-rose-200 bg-rose-50 hover:border-rose-300"
                        : marked
                          ? "border-slate-200 bg-white hover:border-slate-300"
                          : "border-transparent bg-slate-50 text-slate-400 hover:border-slate-200",
                      isToday ? "ring-2 ring-teal-500 ring-offset-1" : "",
                    ].join(" ")}
                  >
                    <span className={isToday ? "font-bold text-teal-700" : "font-medium"}>
                      {day.date()}
                    </span>
                    {offCount > 0 && (
                      <span className="absolute bottom-1 right-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                        {offCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-rose-200 bg-rose-50" />
            {t("legendHasOff")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-100" />
            {t("legendNotMarked")}
          </span>
        </div>
      </div>

      {/* Day drawer */}
      <Drawer
        open={!!drawerDate}
        onClose={() => setDrawerDate(null)}
        placement="right"
        width={360}
        title={
          drawerDate
            ? t("whoOffTitle", { date: dayjs(drawerDate).format("DD/MM/YYYY") })
            : t("previewTitle")
        }
        footer={
          drawerDate && showMarkDayAction && onMarkDay ? (
            <Button
              type="button"
              onClick={() => {
                onMarkDay(drawerDate);
                setDrawerDate(null);
              }}
              className="h-10 w-full bg-teal-600 font-semibold text-white hover:bg-teal-700"
            >
              <CalendarCheck size={16} />
              {t("markThisDay")}
            </Button>
          ) : null
        }
      >
        {drawerOff.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={drawerMarked ? t("allPresent") : t("notMarkedYet")}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {drawerOff.map((entry) => (
              <li key={entry.user_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{entry.name}</div>
                  {entry.department && (
                    <div className="truncate text-xs text-slate-500">{entry.department}</div>
                  )}
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_META[entry.status].border} ${STATUS_META[entry.status].tint} ${STATUS_META[entry.status].text}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[entry.status].dot}`} />
                  {statusLabel(entry.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {/* Timesheet preview modal */}
      <Modal
        title={previewReport?.title || t("previewTitle")}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width="96vw"
        footer={[
          <Button key="close" type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
            {t("close")}
          </Button>,
          <Button
            key="print"
            type="button"
            variant="outline"
            onClick={handlePrintPreview}
            disabled={!previewReport || previewLoading}
          >
            <Printer size={16} />
            {t("printPdf")}
          </Button>,
          <Button
            key="export"
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download size={16} />}
            {t("exportButton")}
          </Button>,
        ]}
        styles={{
          body: { maxHeight: "76vh", overflow: "auto", background: "#e5e7eb", padding: 18 },
        }}
      >
        {previewLoading ? (
          <div className="bg-white p-5">
            <Skeleton active paragraph={{ rows: 12 }} />
          </div>
        ) : previewReport ? (
          <AttendancePreviewPdf
            report={previewReport}
            labels={{
              departmentLine: t("exportDepartmentLine"),
              fullName: t("fullName"),
              dayHeader: t("exportDayHeader"),
              regularWork: t("regularWork"),
              holidayWork: t("holidayWork"),
              totalWork: t("totalWork"),
              totalRow: t("totalRow"),
            }}
          />
        ) : (
          <Empty description={t("emptyPreview")} />
        )}
      </Modal>
    </div>
  );
}
