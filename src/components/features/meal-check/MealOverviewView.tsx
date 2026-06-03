"use client";

import { Button } from "@/components/ui/button";
import { groupByDepartment } from "@/components/features/work-arrangement/attendance/shared";
import mealCheckApi, {
  type MealCheckReport,
  type MealReportByDate,
  type MealSlotKey,
  type MealStatusSource,
} from "@/services/meal-check.service";
import type { WorkPersonnel } from "@/types/work-arrangement";
import { DatePicker, Drawer, Empty, message, Skeleton } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { CalendarCheck, Download, Loader2, RefreshCw, UtensilsCrossed } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildStatusMapFromReport,
  cellKey,
  getDaysInRange,
  MEAL_SLOTS,
  numberToVietnamese,
  SLOT_SHORT,
} from "./shared";

const WEEK_HEADER = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

type DrawerUser = {
  id: number;
  name: string;
  short?: string | null;
  slots: { slot: MealSlotKey; source: MealStatusSource }[];
};

type MealOverviewViewProps = {
  roster: WorkPersonnel[];
  slots: MealSlotKey[];
  onMarkDay: (date: string) => void;
};

export default function MealOverviewView({ roster, slots, onMarkDay }: MealOverviewViewProps) {
  const t = useTranslations("MealCheck");

  const [month, setMonth] = useState<Dayjs>(dayjs().startOf("month"));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<MealCheckReport | null>(null);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const slotLabel = useCallback(
    (key: MealSlotKey) =>
      key === "sang" ? t("slotSang") : key === "trua" ? t("slotTrua") : t("slotToi"),
    [t]
  );

  const activeSlots = useMemo(() => MEAL_SLOTS.filter((s) => slots.includes(s.key)), [slots]);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const from = month.startOf("month").format("YYYY-MM-DD");
      const to = month.endOf("month").format("YYYY-MM-DD");
      setReport(await mealCheckApi.getReport(from, to));
    } catch {
      message.error(t("loadResultsFailed"));
    } finally {
      setLoading(false);
    }
  }, [month, t]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const byDateMap = useMemo(() => {
    const map = new Map<string, MealReportByDate>();
    for (const day of report?.by_date ?? []) map.set(day.work_date, day);
    return map;
  }, [report]);

  const monthCells = useMemo(() => {
    const start = month.startOf("month");
    const daysInMonth = month.daysInMonth();
    const lead = (start.day() + 6) % 7;
    const cells: (Dayjs | null)[] = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(start.date(d));
    return cells;
  }, [month]);

  const stats = useMemo(() => {
    let daysWithPortions = 0;
    let total = 0;
    for (const day of report?.by_date ?? []) {
      if (day.allowance_count > 0) daysWithPortions += 1;
      total += day.allowance_count;
    }
    return { daysWithPortions, total };
  }, [report]);

  const drawerUsers = useMemo<DrawerUser[]>(() => {
    if (!drawerDate) return [];
    const day = byDateMap.get(drawerDate);
    if (!day) return [];
    const slotIndex = (slot: MealSlotKey) => MEAL_SLOTS.findIndex((m) => m.key === slot);
    const userMap = new Map<number, DrawerUser>();
    for (const entry of day.meta) {
      const current = userMap.get(entry.user_id) || {
        id: entry.user_id,
        name: entry.user_full_name,
        short: entry.user_short_name,
        slots: [],
      };
      current.slots.push({ slot: entry.meal_slot, source: entry.source });
      userMap.set(entry.user_id, current);
    }
    return Array.from(userMap.values())
      .map((user) => ({
        ...user,
        slots: [...user.slots].sort((a, b) => slotIndex(a.slot) - slotIndex(b.slot)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [drawerDate, byDateMap]);

  // --- Excel tháng "BẢNG CHẤM TIỀN ĂN QUA BỮA" (giữ định dạng cũ) ---
  const handleExport = useCallback(async () => {
    if (!report) return;
    setExporting(true);
    try {
      const from = month.startOf("month");
      const to = month.endOf("month");
      const days = getDaysInRange(from, to);
      const statusMap = buildStatusMapFromReport(report);
      const fullGroups = groupByDepartment(roster, t("noDepartment"));
      const grandTotal = report.grand_total || stats.total;

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Cơm ca");

      const numDays = days.length;
      const numSlots = activeSlots.length;
      const dayStartCol = 3;
      const lastDayCol = dayStartCol + numDays * numSlots - 1;
      const tongCol = lastDayCol + 1;
      const kyCol = tongCol + 1;
      const totalCols = kyCol;

      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      const fontTNR = "Times New Roman";

      const colLetter = (n: number) => {
        let s = "";
        let num = n;
        while (num > 0) {
          num--;
          s = String.fromCharCode(65 + (num % 26)) + s;
          num = Math.floor(num / 26);
        }
        return s;
      };

      const titleRow = ws.addRow([]);
      titleRow.getCell(1).value = "BẢNG CHẤM TIỀN ĂN QUA BỮA ";
      ws.mergeCells(`A1:${colLetter(totalCols)}1`);
      titleRow.getCell(1).font = { bold: true, size: 18, name: fontTNR };
      titleRow.getCell(1).alignment = { horizontal: "center" };
      titleRow.height = 50;

      const dateRow = ws.addRow([]);
      dateRow.getCell(1).value =
        `Từ ngày ${from.format("DD/MM/YYYY")} - ${to.format("DD/MM/YYYY")}`;
      ws.mergeCells(`A2:${colLetter(totalCols)}2`);
      dateRow.getCell(1).font = { bold: true, size: 16, name: fontTNR };
      dateRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      dateRow.height = 44;

      const headerRow1 = ws.addRow([]);
      headerRow1.getCell(1).value = "STT";
      headerRow1.getCell(2).value = "Họ và tên";
      headerRow1.getCell(dayStartCol).value = "Ngày trong tháng";
      headerRow1.getCell(tongCol).value = "Tổng";
      headerRow1.getCell(kyCol).value = "Kí nhận";
      headerRow1.height = 40.75;

      const headerRow2 = ws.addRow([]);
      for (let i = 0; i < numDays; i++) {
        const col = dayStartCol + i * numSlots;
        headerRow2.getCell(col).value = days[i].date();
      }
      headerRow2.height = 40.75;

      const headerRow3 = ws.addRow([]);
      for (let i = 0; i < numDays; i++) {
        const col = dayStartCol + i * numSlots;
        for (let s = 0; s < numSlots; s++) {
          headerRow3.getCell(col + s).value = slotLabel(activeSlots[s].key);
        }
      }
      headerRow3.height = 26.25;

      ws.mergeCells(3, dayStartCol, 3, lastDayCol);
      ws.mergeCells("A3:A5");
      ws.mergeCells("B3:B5");
      ws.mergeCells(3, tongCol, 5, tongCol);
      ws.mergeCells(3, kyCol, 5, kyCol);
      for (let i = 0; i < numDays; i++) {
        const col = dayStartCol + i * numSlots;
        ws.mergeCells(4, col, 4, col + numSlots - 1);
      }

      for (let r = 3; r <= 5; r++) {
        const row = ws.getRow(r);
        for (let c = 1; c <= totalCols; c++) {
          const cell = row.getCell(c);
          cell.border = thinBorder;
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          if (r === 5 && c >= dayStartCol && c <= lastDayCol) {
            cell.font = { size: 10, name: fontTNR };
          } else if (r === 4 && c >= dayStartCol && c <= lastDayCol) {
            cell.font = { bold: true, size: 10, name: fontTNR };
          } else {
            cell.font = { bold: true, size: 11, name: fontTNR };
          }
        }
      }

      const colTotals: number[] = new Array(numDays * numSlots).fill(0);
      let globalStt = 1;

      fullGroups.forEach(([departmentName, people], groupIndex) => {
        if (people.length === 0) return;

        const sectionRow = ws.addRow([]);
        sectionRow.height = 25;
        sectionRow.getCell(1).value = String.fromCharCode(65 + groupIndex);
        sectionRow.getCell(1).font = { bold: true, size: 12, name: fontTNR };
        sectionRow.getCell(1).alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
        sectionRow.getCell(1).border = {
          left: { style: "thin" },
          right: { style: "thin" },
          top: { style: "thin" },
        };
        sectionRow.getCell(2).value = departmentName;
        ws.mergeCells(sectionRow.number, 2, sectionRow.number, lastDayCol);
        for (let c = 2; c <= lastDayCol; c++) {
          sectionRow.getCell(c).font = { bold: true, size: 12, name: fontTNR };
          sectionRow.getCell(c).alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
          };
          sectionRow.getCell(c).border = {
            left: { style: "thin" },
            right: { style: "thin" },
            top: { style: "thin" },
          };
        }

        for (const person of people) {
          const dataRow = ws.addRow([]);
          dataRow.height = 25;

          dataRow.getCell(1).value = globalStt++;
          dataRow.getCell(1).font = { size: 12, name: fontTNR };
          dataRow.getCell(1).alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
          };
          dataRow.getCell(1).border = {
            left: { style: "thin" },
            top: { style: "thin" },
            bottom: { style: "thin" },
          };

          dataRow.getCell(2).value = person.user_full_name;
          dataRow.getCell(2).font = { size: 12, name: fontTNR };
          dataRow.getCell(2).alignment = { horizontal: "left", wrapText: true };
          dataRow.getCell(2).border = thinBorder;

          let personTotal = 0;

          for (let i = 0; i < numDays; i++) {
            const date = days[i].format("YYYY-MM-DD");
            const col = dayStartCol + i * numSlots;
            for (let s = 0; s < numSlots; s++) {
              const state = statusMap[cellKey(person.user_id, date, activeSlots[s].key)];
              if (state?.is_allowance) {
                dataRow.getCell(col + s).value = "/";
                personTotal++;
                colTotals[i * numSlots + s]++;
              }
              dataRow.getCell(col + s).font = { size: 10, name: fontTNR };
              dataRow.getCell(col + s).alignment = { horizontal: "center" };
              dataRow.getCell(col + s).border = thinBorder;
            }
          }

          dataRow.getCell(tongCol).value = personTotal;
          dataRow.getCell(tongCol).font = { size: 12, name: fontTNR };
          dataRow.getCell(tongCol).alignment = { horizontal: "center", vertical: "middle" };
          dataRow.getCell(tongCol).border = {
            right: { style: "thin" },
            top: { style: "thin" },
            bottom: { style: "thin" },
          };
          dataRow.getCell(kyCol).border = thinBorder;
        }
      });

      const totalRow = ws.addRow([]);
      totalRow.height = 25;
      totalRow.getCell(1).value = "Tổng cộng";
      ws.mergeCells(totalRow.number, 1, totalRow.number, 2);
      totalRow.getCell(1).font = { bold: true, size: 11, name: fontTNR };
      totalRow.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      totalRow.getCell(1).border = thinBorder;
      totalRow.getCell(2).border = thinBorder;

      for (let i = 0; i < numDays * numSlots; i++) {
        const col = dayStartCol + i;
        totalRow.getCell(col).value = colTotals[i] || undefined;
        totalRow.getCell(col).font = { bold: true, size: 12, name: fontTNR };
        totalRow.getCell(col).alignment = { horizontal: "center", vertical: "middle" };
        totalRow.getCell(col).border = {
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
        };
      }
      totalRow.getCell(tongCol).value = grandTotal;
      totalRow.getCell(tongCol).font = { bold: true, size: 11, name: fontTNR };
      totalRow.getCell(tongCol).alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      totalRow.getCell(tongCol).border = thinBorder;

      const totalBuaRow = ws.addRow([]);
      totalBuaRow.height = 21.75;
      const buaText = numberToVietnamese(grandTotal);
      totalBuaRow.getCell(1).value =
        `     Tổng:  ${String(grandTotal).padStart(2, "0")} bữa (${buaText} bữa)`;
      ws.mergeCells(totalBuaRow.number, 1, totalBuaRow.number, kyCol);
      totalBuaRow.getCell(1).font = { bold: true, size: 12, name: fontTNR };
      totalBuaRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
      totalBuaRow.getCell(1).border = { top: { style: "thin" } };

      ws.getColumn(1).width = 5.56;
      ws.getColumn(2).width = 21.44;
      for (let i = 0; i < numDays * numSlots; i++) {
        ws.getColumn(dayStartCol + i).width = 5.44;
      }
      ws.getColumn(tongCol).width = 5.56;
      ws.getColumn(kyCol).width = 17.31;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, `com-ca_${from.format("DD-MM-YYYY")}_${to.format("DD-MM-YYYY")}.xlsx`);
      message.success(t("exportSuccess"));
    } catch {
      message.error(t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [report, month, roster, activeSlots, stats.total, slotLabel, t]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 pb-3">
        <DatePicker
          picker="month"
          value={month}
          onChange={(value) => value && setMonth(value.startOf("month"))}
          format="MM/YYYY"
          allowClear={false}
          className="h-9 w-[130px]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadMonth}
          disabled={loading}
          className="h-9 border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw size={15} />}
          {t("reload")}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleExport}
            disabled={exporting || !report}
            className="h-9 bg-amber-600 font-semibold text-white hover:bg-amber-700"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download size={15} />}
            <span className="hidden sm:inline">{t("exportExcel")}</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <CalendarCheck size={15} className="text-amber-600" />
          {t("daysWithPortions")}
          <b className="text-slate-900">{stats.daysWithPortions}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {t("totalMeals")}
          <b className="text-slate-900">{stats.total}</b>
        </span>
      </div>

      {/* Calendar */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2 sm:p-3">
        {loading ? (
          <div className="p-4">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1">
              {WEEK_HEADER.map((label) => (
                <div
                  key={label}
                  className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthCells.map((day, index) => {
                if (!day) return <div key={`blank-${index}`} className="aspect-square" />;

                const dateStr = day.format("YYYY-MM-DD");
                const portions = byDateMap.get(dateStr)?.allowance_count ?? 0;
                const isToday = day.isSame(dayjs(), "day");

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setDrawerDate(dateStr)}
                    className={[
                      "relative aspect-square min-w-0 rounded-md border p-1.5 text-left align-top text-sm transition-colors",
                      portions > 0
                        ? "border-emerald-200 bg-emerald-50 hover:border-emerald-300"
                        : "border-transparent bg-slate-50 text-slate-400 hover:border-slate-200",
                      isToday ? "ring-2 ring-amber-500 ring-offset-1" : "",
                    ].join(" ")}
                  >
                    <span className={isToday ? "font-bold text-amber-700" : "font-medium"}>
                      {day.date()}
                    </span>
                    {portions > 0 && (
                      <span className="absolute bottom-1 right-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold leading-4 text-white">
                        {portions}
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
            <span className="h-2.5 w-2.5 rounded-sm border border-emerald-200 bg-emerald-50" />
            {t("legendHasPortion")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-100" />
            {t("legendNoData")}
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
          drawerDate ? t("dayPortionsTitle", { date: dayjs(drawerDate).format("DD/MM/YYYY") }) : ""
        }
        footer={
          drawerDate ? (
            <Button
              type="button"
              onClick={() => {
                onMarkDay(drawerDate);
                setDrawerDate(null);
              }}
              className="h-10 w-full bg-amber-600 font-semibold text-white hover:bg-amber-700"
            >
              <CalendarCheck size={16} />
              {t("markThisDay")}
            </Button>
          ) : null
        }
      >
        {drawerUsers.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("noPortionDay")} />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {drawerUsers.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{user.name}</div>
                  {user.short && (
                    <div className="truncate text-xs text-slate-500">{user.short}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {user.slots.map((entry, index) => (
                    <span
                      key={`${entry.slot}-${index}`}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        entry.source === "manual"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {SLOT_SHORT[entry.slot]}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {/* Empty state khi không có nhân sự */}
      {!loading && roster.length === 0 && (
        <div className="mt-4 flex flex-col items-center gap-2 py-10 text-slate-400">
          <UtensilsCrossed size={28} className="text-slate-300" />
          <p className="m-0 text-sm">{t("empty")}</p>
        </div>
      )}
    </div>
  );
}
