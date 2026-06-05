"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import dayjs, { type Dayjs } from "dayjs";
import { CalendarDays, ChevronLeft, ChevronRight, Moon, RotateCcw, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type LunarDate = {
  day: number;
  month: number;
  year: number;
  leap: boolean;
};

type CalendarDay = {
  date: Dayjs;
  lunar: LunarDate;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
};

const VIETNAM_TIME_ZONE = 7;
const STEMS = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
const BRANCHES = [
  "Tý",
  "Sửu",
  "Dần",
  "Mão",
  "Thìn",
  "Tỵ",
  "Ngọ",
  "Mùi",
  "Thân",
  "Dậu",
  "Tuất",
  "Hợi",
];

function int(value: number) {
  return Math.floor(value);
}

function jdFromDate(day: number, month: number, year: number) {
  const a = int((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd =
    day + int((153 * m + 2) / 5) + 365 * y + int(y / 4) - int(y / 100) + int(y / 400) - 32045;

  if (jd < 2299161) {
    jd = day + int((153 * m + 2) / 5) + 365 * y + int(y / 4) - 32083;
  }

  return jd;
}

function getNewMoonDay(k: number, timeZone: number) {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const dr = Math.PI / 180;

  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);

  const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const mPrime = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;

  let c1 =
    (0.1734 - 0.000393 * t) * Math.sin(m * dr) +
    0.0021 * Math.sin(2 * dr * m) -
    0.4068 * Math.sin(mPrime * dr) +
    0.0161 * Math.sin(2 * dr * mPrime) -
    0.0004 * Math.sin(3 * dr * mPrime) +
    0.0104 * Math.sin(2 * dr * f) -
    0.0051 * Math.sin((m + mPrime) * dr) -
    0.0074 * Math.sin((m - mPrime) * dr) +
    0.0004 * Math.sin((2 * f + m) * dr) -
    0.0004 * Math.sin((2 * f - m) * dr) -
    0.0006 * Math.sin((2 * f + mPrime) * dr) +
    0.001 * Math.sin((2 * f - mPrime) * dr) +
    0.0005 * Math.sin((2 * mPrime + m) * dr);

  const deltaT =
    t < -11
      ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
      : -0.000278 + 0.000265 * t + 0.000262 * t2;

  return int(jd1 + c1 - deltaT + 0.5 + timeZone / 24);
}

function getSunLongitude(jdn: number, timeZone: number) {
  const t = (jdn - 2451545.5 - timeZone / 24) / 36525;
  const t2 = t * t;
  const dr = Math.PI / 180;
  const m = 357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
  const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;

  let dl = (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(dr * m);
  dl += (0.019993 - 0.000101 * t) * Math.sin(2 * dr * m) + 0.00029 * Math.sin(3 * dr * m);

  let l = (l0 + dl) * dr;
  l -= Math.PI * 2 * int(l / (Math.PI * 2));

  return int((l / Math.PI) * 6);
}

function getLunarMonth11(year: number, timeZone: number) {
  const off = jdFromDate(31, 12, year) - 2415021;
  const k = int(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone);

  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }

  return nm;
}

function getLeapMonthOffset(a11: number, timeZone: number) {
  const k = int((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);

  do {
    last = arc;
    i += 1;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);

  return i - 1;
}

function convertSolarToLunar(
  day: number,
  month: number,
  year: number,
  timeZone = VIETNAM_TIME_ZONE
): LunarDate {
  const dayNumber = jdFromDate(day, month, year);
  const k = int((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);

  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone);
  }

  let a11 = getLunarMonth11(year, timeZone);
  let b11 = a11;
  let lunarYear: number;

  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = getLunarMonth11(year - 1, timeZone);
  } else {
    lunarYear = year + 1;
    b11 = getLunarMonth11(year + 1, timeZone);
  }

  const lunarDay = dayNumber - monthStart + 1;
  const diff = int((monthStart - a11) / 29);
  let lunarLeap = false;
  let lunarMonth = diff + 11;

  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);

    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;

      if (diff === leapMonthDiff) {
        lunarLeap = true;
      }
    }
  }

  if (lunarMonth > 12) {
    lunarMonth -= 12;
  }

  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1;
  }

  return {
    day: lunarDay,
    month: lunarMonth,
    year: lunarYear,
    leap: lunarLeap,
  };
}

function getCalendarStart(date: Dayjs) {
  return date.subtract((date.day() + 6) % 7, "day");
}

function getCanChiYear(year: number) {
  return `${STEMS[(year + 6) % 10]} ${BRANCHES[(year + 8) % 12]}`;
}

function formatLunarCell(lunar: LunarDate) {
  if (lunar.day === 1 || lunar.leap) {
    return `${lunar.day}/${lunar.month}${lunar.leap ? "N" : ""} AL`;
  }

  return `${lunar.day} AL`;
}

function formatLunarFull(lunar: LunarDate) {
  return `${lunar.day}/${lunar.month}/${lunar.year}${lunar.leap ? " nhuận" : ""}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function CalendarTool() {
  const t = useTranslations("CalendarToolPage");
  const locale = useLocale();
  const appLocale = locale === "vi" ? "vi-VN" : "en-US";
  const today = dayjs();
  const [visibleMonth, setVisibleMonth] = useState<Dayjs>(today.startOf("month"));
  const [selectedDate, setSelectedDate] = useState<Dayjs>(today.startOf("day"));

  const weekLabels =
    locale === "vi"
      ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const startDate = getCalendarStart(visibleMonth.startOf("month"));
    const currentToday = dayjs();

    return Array.from({ length: 42 }, (_, index) => {
      const date = startDate.add(index, "day");

      return {
        date,
        lunar: convertSolarToLunar(date.date(), date.month() + 1, date.year()),
        inMonth: date.isSame(visibleMonth, "month"),
        isToday: date.isSame(currentToday, "day"),
        isSelected: date.isSame(selectedDate, "day"),
      };
    });
  }, [selectedDate, visibleMonth]);

  const selectedLunarDate = useMemo(
    () => convertSolarToLunar(selectedDate.date(), selectedDate.month() + 1, selectedDate.year()),
    [selectedDate]
  );

  const monthLabel = visibleMonth.toDate().toLocaleDateString(appLocale, {
    month: "long",
    year: "numeric",
  });

  const selectedWeekday = selectedDate.toDate().toLocaleDateString(appLocale, {
    weekday: "long",
  });

  const changeMonth = (value: number) => {
    setVisibleMonth((prev) => prev.add(value, "month").startOf("month"));
  };

  const goToday = () => {
    const nextToday = dayjs();
    setVisibleMonth(nextToday.startOf("month"));
    setSelectedDate(nextToday.startOf("day"));
  };

  const handleMonthChange = (value: string) => {
    const nextMonth = dayjs(`${value}-01`);

    if (!nextMonth.isValid()) return;

    setVisibleMonth(nextMonth.startOf("month"));
    setSelectedDate((prev) => {
      const nextDate = nextMonth.date(Math.min(prev.date(), nextMonth.daysInMonth()));
      return nextDate.startOf("day");
    });
  };

  return (
    <div className="min-h-screen bg-white px-4 py-3 text-slate-800 sm:px-6 sm:py-4">
      <section className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <CalendarDays size={22} className="text-blue-600" strokeWidth={2.5} />
            <h1 className="m-0 text-2xl font-bold tracking-tight text-slate-800">{t("title")}</h1>
          </div>
          <p className="m-0 ml-[34px] max-w-2xl text-sm text-slate-500">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="iconSquare"
            aria-label={t("previousMonth")}
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <input
            aria-label={t("monthPicker")}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-xs outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
            type="month"
            value={visibleMonth.format("YYYY-MM")}
            onChange={(event) => handleMonthChange(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="iconSquare"
            aria-label={t("nextMonth")}
            onClick={() => changeMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button type="button" variant="primary" onClick={goToday}>
            <RotateCcw className="size-4" />
            {t("today")}
          </Button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold capitalize text-slate-950">{monthLabel}</h2>
              <p className="text-sm text-slate-500">{t("monthHelp")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                <Sun className="size-3" />
                {t("solarShort")}
              </Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                <Moon className="size-3" />
                {t("lunarShort")}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {weekLabels.map((label) => (
              <div
                key={label}
                className="border-r border-slate-200 px-2 py-2 text-center text-xs font-bold uppercase text-slate-500 last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((item) => (
              <button
                type="button"
                key={item.date.format("YYYY-MM-DD")}
                className={cn(
                  "min-h-24 border-r border-b border-slate-100 p-2 text-left transition last:border-r-0 sm:min-h-28 sm:p-3",
                  !item.inMonth && "bg-slate-50 text-slate-300",
                  item.inMonth && "bg-white hover:bg-blue-50",
                  item.isSelected && "bg-blue-600 text-white hover:bg-blue-600",
                  item.isToday && !item.isSelected && "bg-emerald-50"
                )}
                onClick={() => setSelectedDate(item.date.startOf("day"))}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={cn(
                      "text-base font-bold leading-none sm:text-lg",
                      item.isSelected
                        ? "text-white"
                        : item.inMonth
                          ? "text-slate-950"
                          : "text-slate-400"
                    )}
                  >
                    {item.date.date()}
                  </span>
                  {item.isToday && (
                    <span
                      className={cn(
                        "mt-1 h-1.5 w-1.5 rounded-full",
                        item.isSelected ? "bg-white" : "bg-emerald-500"
                      )}
                    />
                  )}
                </div>
                <div
                  className={cn(
                    "mt-2 text-[11px] font-semibold leading-tight sm:text-xs",
                    item.isSelected
                      ? "text-blue-50"
                      : item.inMonth
                        ? "text-amber-700"
                        : "text-slate-400"
                  )}
                >
                  {formatLunarCell(item.lunar)}
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("selectedDate")}
            </p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-4xl font-bold text-slate-950">{selectedDate.format("DD")}</div>
                <div className="mt-1 text-sm font-semibold capitalize text-slate-500">
                  {selectedWeekday}
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                  {selectedDate.format("MM/YYYY")}
                </Badge>
              </div>
            </div>
          </div>

          <div className="p-4">
            <Tabs defaultValue="solar" className="gap-4">
              <TabsList className="grid h-10 w-full grid-cols-2">
                <TabsTrigger value="solar">
                  <Sun className="size-4" />
                  {t("solarCalendar")}
                </TabsTrigger>
                <TabsTrigger value="lunar">
                  <Moon className="size-4" />
                  {t("lunarCalendar")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="solar">
                <InfoRow label={t("solarDate")} value={selectedDate.format("DD/MM/YYYY")} />
                <InfoRow label={t("weekday")} value={selectedWeekday} />
                <InfoRow label={t("month")} value={selectedDate.format("MM/YYYY")} />
              </TabsContent>

              <TabsContent value="lunar">
                <InfoRow label={t("lunarDate")} value={formatLunarFull(selectedLunarDate)} />
                <InfoRow label={t("lunarMonth")} value={`${selectedLunarDate.month}`} />
                <InfoRow
                  label={t("lunarYear")}
                  value={`${selectedLunarDate.year} - ${getCanChiYear(selectedLunarDate.year)}`}
                />
                <InfoRow
                  label={t("leapMonth")}
                  value={selectedLunarDate.leap ? t("isLeapMonth") : t("notLeapMonth")}
                />
              </TabsContent>
            </Tabs>
          </div>
        </aside>
      </section>
    </div>
  );
}
