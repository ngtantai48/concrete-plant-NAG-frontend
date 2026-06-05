"use client";

import { Fragment } from "react";
import { WEEKDAY_LABELS, type AttendancePreviewReport } from "./shared";

type AttendancePreviewPdfProps = {
  report: AttendancePreviewReport;
  labels: {
    departmentLine: string;
    fullName: string;
    dayHeader: string;
    regularWork: string;
    holidayWork: string;
    totalWork: string;
    totalRow: string;
  };
};

export default function AttendancePreviewPdf({ report, labels }: AttendancePreviewPdfProps) {
  const totalCols = 2 + report.dates.length + 3;
  const pageWidth = Math.max(1040, 330 + report.dates.length * 38 + 150);

  return (
    <div id="attendance-preview-pdf" className="min-w-max">
      <div
        className="attendance-pdf-page mx-auto bg-white p-5 text-slate-900 shadow-sm"
        style={{ width: pageWidth }}
      >
        <h2 className="attendance-pdf-title mb-2 text-center text-[15px] font-bold uppercase">
          {report.title}
        </h2>
        <div className="attendance-pdf-department mb-3 text-center text-xs font-bold">
          {labels.departmentLine}
        </div>

        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr>
              <th rowSpan={2} className="stt-cell border border-slate-400 bg-slate-200 px-1 py-1">
                STT
              </th>
              <th
                rowSpan={2}
                className="name-cell border border-slate-400 bg-slate-200 px-2 py-1 text-left"
              >
                {labels.fullName}
              </th>
              <th
                colSpan={report.dates.length}
                className="border border-slate-400 bg-slate-200 px-1 py-1"
              >
                {labels.dayHeader}
              </th>
              <th rowSpan={2} className="total-cell border border-slate-400 bg-slate-200 px-1 py-1">
                {labels.regularWork}
              </th>
              <th rowSpan={2} className="total-cell border border-slate-400 bg-slate-200 px-1 py-1">
                {labels.holidayWork}
              </th>
              <th rowSpan={2} className="total-cell border border-slate-400 bg-slate-200 px-1 py-1">
                {labels.totalWork}
              </th>
            </tr>
            <tr>
              {report.dates.map((date) => (
                <th
                  key={date.format("YYYY-MM-DD")}
                  className="day-cell border border-slate-400 bg-slate-200 px-1 py-1"
                >
                  <div>{WEEKDAY_LABELS[date.day()]}</div>
                  <div>{date.date()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.groups.map((group) => (
              <Fragment key={group.departmentName}>
                <tr className="group-row">
                  <td className="border border-slate-400 bg-slate-100 px-1 py-1 text-center font-bold">
                    {String.fromCharCode(65 + group.groupIndex)}
                  </td>
                  <td
                    colSpan={totalCols - 1}
                    className="border border-slate-400 bg-slate-100 px-2 py-1 font-bold"
                  >
                    {group.departmentName}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.person.user_id}>
                    <td className="stt-cell border border-slate-400 px-1 py-1 text-center">
                      {row.stt}
                    </td>
                    <td className="name-cell border border-slate-400 px-2 py-1 text-left">
                      {row.person.user_full_name}
                    </td>
                    {row.values.map((value, index) => (
                      <td
                        key={`${row.person.user_id}-${index}`}
                        className="day-cell border border-slate-400 px-1 py-1 text-center"
                      >
                        {value}
                      </td>
                    ))}
                    <td className="total-cell border border-slate-400 px-1 py-1 text-center">
                      {row.total}
                    </td>
                    <td className="total-cell border border-slate-400 px-1 py-1 text-center">0</td>
                    <td className="total-cell border border-slate-400 px-1 py-1 text-center">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr className="total-row font-bold">
              <td
                colSpan={2}
                className="border border-slate-400 bg-slate-200 px-2 py-1 text-center"
              >
                {labels.totalRow}
              </td>
              {report.totalByDay.map((value, index) => (
                <td
                  key={`total-${index}`}
                  className="day-cell border border-slate-400 bg-slate-200 px-1 py-1 text-center"
                >
                  {value}
                </td>
              ))}
              <td className="total-cell border border-slate-400 bg-slate-200 px-1 py-1 text-center">
                {report.grandTotal}
              </td>
              <td className="total-cell border border-slate-400 bg-slate-200 px-1 py-1 text-center">
                0
              </td>
              <td className="total-cell border border-slate-400 bg-slate-200 px-1 py-1 text-center">
                {report.grandTotal}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
