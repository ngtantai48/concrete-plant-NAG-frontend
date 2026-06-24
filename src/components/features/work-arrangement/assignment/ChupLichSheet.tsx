import { Fragment, forwardRef, type CSSProperties } from "react";
import type { ChupLichModel } from "@/utils/exportChupLich";

const HEADER_BG = "#D9E1F2";
const BORDER = "1px solid #9AA7B8";
const OUTLINE = "2px solid #5B6B7F";

// ARGB ("FFFFFF00") -> CSS hex ("#FFFF00")
const argbToHex = (argb?: string | null) => (argb ? `#${argb.slice(-6)}` : undefined);

const td: CSSProperties = {
  border: BORDER,
  padding: "2px 6px",
  fontSize: 12,
  lineHeight: 1.3,
  verticalAlign: "middle",
  color: "#1f2937",
  whiteSpace: "normal",
  wordBreak: "break-word",
};
const th: CSSProperties = { ...td, background: HEADER_BG, fontWeight: 700, textAlign: "center" };
const center: CSSProperties = { textAlign: "center" };
const bold: CSSProperties = { fontWeight: 700 };

/**
 * Bản lịch HTML phản chiếu layout file Excel (exportChupLichExcel) để chụp thành ảnh PNG.
 * Render ẩn offscreen rồi dùng html-to-image.
 */
const ChupLichSheet = forwardRef<HTMLDivElement, { model: ChupLichModel }>(({ model }, ref) => {
  return (
    <div
      ref={ref}
      style={{
        background: "#fff",
        padding: 16,
        display: "inline-block",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#1f2937",
      }}
    >
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 20, padding: "2px 0 12px" }}>
        {model.title}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* ===== VÙNG TRÁI: Xe bơm / Lốt / Công việc ===== */}
        <div style={{ border: OUTLINE }}>
          <table style={{ borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: 38 }} />
              <col style={{ width: 232 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <tbody>
              <tr>
                <th style={th}>TT</th>
                <th style={th}>BIỂN SỐ XE/KÝ HIỆU</th>
                <th style={th} colSpan={3}>
                  NGƯỜI THỰC HIỆN
                </th>
              </tr>
              <tr>
                <th style={th}>A</th>
                <th style={th}>XE BƠM</th>
                <th style={th}>LÁI XE</th>
                <th style={th}>VẬN HÀNH</th>
                <th style={th}>ÔM VÒI</th>
              </tr>
              {model.pumpRows.map((row, index) => {
                const fill = argbToHex(row.fill);
                return (
                  <tr key={`pump-${index}`}>
                    <td style={{ ...td, ...center, background: fill }}>{row.tt}</td>
                    <td style={{ ...td, ...bold, background: fill }}>{row.label}</td>
                    <td style={{ ...td, ...center }}>{row.driver}</td>
                    <td style={{ ...td, ...center }}>{row.operator}</td>
                    <td style={{ ...td, ...center }}>{row.hose}</td>
                  </tr>
                );
              })}

              {model.lotLabels.length > 0 && (
                <>
                  <tr>
                    <th style={th}>B</th>
                    <th style={th} colSpan={4}>
                      LỐT XE 12H TRỘN
                    </th>
                  </tr>
                  <tr>
                    <td style={td} />
                    <td style={td} colSpan={4}>
                      {model.lotLabels.join("; ")}
                    </td>
                  </tr>
                </>
              )}

              {model.workSections.map((section) => (
                <Fragment key={`sec-${section.letter}`}>
                  <tr>
                    <th style={th}>{section.letter}</th>
                    <th style={th}>{section.title}</th>
                    <th style={th} colSpan={3}>
                      NGƯỜI THỰC HIỆN
                    </th>
                  </tr>
                  {section.rows.map((row, rowIndex) => (
                    <tr key={`sec-${section.letter}-${rowIndex}`}>
                      <td style={{ ...td, ...center }}>{row.tt}</td>
                      {row.name ? (
                        <>
                          <td style={td}>{row.name}</td>
                          <td style={td} colSpan={3}>
                            {row.people}
                          </td>
                        </>
                      ) : (
                        <td style={td} colSpan={4}>
                          {row.people}
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* ===== VÙNG PHẢI: Xe bồn + Nhân sự nghỉ ===== */}
        <div style={{ border: OUTLINE }}>
          <table style={{ borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: 50 }} />
              <col style={{ width: 172 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <tbody>
              <tr>
                <th style={th}>KH</th>
                <th style={th}>BIỂN SỐ XE</th>
                <th style={th}>THỰC HIỆN</th>
              </tr>
              {model.mixers.map((mixer, index) => (
                <tr key={`mixer-${index}`}>
                  <td style={{ ...td, ...bold, ...center }}>{mixer.name}</td>
                  <td style={td}>{mixer.plate}</td>
                  <td style={{ ...td, ...center }}>{mixer.driver}</td>
                </tr>
              ))}
              <tr>
                <th style={th}>TT</th>
                <th style={th} colSpan={2}>
                  NHÂN SỰ NGHỈ
                </th>
              </tr>
              {model.offNames.map((name, index) => (
                <tr key={`off-${index}`}>
                  <td style={{ ...td, ...center }}>{index + 1}</td>
                  <td style={td} colSpan={2}>
                    {name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

ChupLichSheet.displayName = "ChupLichSheet";

export default ChupLichSheet;
