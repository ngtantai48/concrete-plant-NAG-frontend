import ExcelJS from "exceljs";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type {
  ProProductionReportDocument,
  ProProductionSection,
  ProReportTripRow,
} from "@/utils/exportProductionProReport";

const THEME = {
  primary: "2563EB",
  slate900: "0F172A",
  slate700: "334155",
  slate500: "64748B",
  slate200: "E2E8F0",
  slate100: "F1F5F9",
  green: "059669",
  amber: "D97706",
  rose: "DC2626",
  blueSoft: "EFF6FF",
  greenSoft: "ECFDF5",
  amberSoft: "FFFBEB",
  roseSoft: "FEF2F2",
};

const ARGB = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const CARD_PALETTE = [
  { bg: THEME.blueSoft, value: THEME.primary },
  { bg: THEME.greenSoft, value: THEME.green },
  { bg: THEME.amberSoft, value: THEME.amber },
  { bg: THEME.roseSoft, value: THEME.rose },
  { bg: THEME.slate100, value: THEME.slate900 },
];

const formatNumber = (value: number, maxFractionDigits = 2) =>
  Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: maxFractionDigits });

const safeSheetName = (value: string) =>
  String(value || "Sheet")
    .replace(/[\\/*?:[\]]/g, "-")
    .trim()
    .slice(0, 31) || "Sheet";

const styleCell = (
  cell: ExcelJS.Cell,
  options: {
    bg?: string;
    fontSize?: number;
    bold?: boolean;
    color?: string;
    align?: "left" | "center" | "right";
    wrap?: boolean;
  } = {}
) => {
  if (options.bg) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: ARGB(options.bg) },
    };
  }
  cell.font = {
    name: "Segoe UI",
    size: options.fontSize ?? 11,
    bold: options.bold ?? false,
    color: { argb: ARGB(options.color ?? THEME.slate700) },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: options.align ?? "left",
    wrapText: options.wrap ?? false,
  };
  cell.border = {
    top: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
    left: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
    bottom: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
    right: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
  };
};

type SectionChartMeta = {
  sheetId: number;
  sheetName: string;
  barTitle: string;
  donutTitle: string;
  stationTitle: string;
  seriesRowStart: number;
  seriesCount: number;
  statusRowStart: number;
  statusCount: number;
  stationRowStart: number;
  stationCount: number;
  stationChartStartRow: number;
  stationChartEndRow: number;
};

const xmlEscape = (value: string) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const columnLetter = (column: number) => {
  let current = column;
  let result = "";
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
};

const quotedSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;

const excelRange = (sheetName: string, column: number, rowStart: number, rowEnd: number) =>
  `${quotedSheetName(sheetName)}!$${columnLetter(column)}$${rowStart}:$${columnLetter(column)}$${rowEnd}`;

const buildStringCache = (values: string[]) =>
  `<c:ptCount val="${values.length}"/>${values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${xmlEscape(value)}</c:v></c:pt>`)
    .join("")}`;

const buildNumberCache = (values: number[]) =>
  `<c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`)
    .join("")}`;

const findNextPartIndex = (names: string[], pattern: RegExp) =>
  names.reduce((max, name) => {
    const match = name.match(pattern);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;

const appendUniqueTag = (xml: string, closeTag: string, addition: string, marker: string) => {
  if (xml.includes(marker)) return xml;
  return xml.replace(closeTag, `${addition}${closeTag}`);
};

const buildBarChartXml = (section: ProProductionSection, meta: SectionChartMeta, chartIndex: number) => {
  const categories = section.series.map((item) => item.label);
  const completed = section.series.map((item) => item.completed);
  const processing = section.series.map((item) => item.processing);
  const catFormula = excelRange(meta.sheetName, 18, meta.seriesRowStart, meta.seriesRowStart + meta.seriesCount - 1);
  const completedFormula = excelRange(meta.sheetName, 19, meta.seriesRowStart, meta.seriesRowStart + meta.seriesCount - 1);
  const processingFormula = excelRange(meta.sheetName, 20, meta.seriesRowStart, meta.seriesRowStart + meta.seriesCount - 1);
  const categoryAxisId = chartIndex * 100 + 1;
  const valueAxisId = chartIndex * 100 + 2;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="vi-VN"/>
  <c:chart>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>Hoàn thành</c:v></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="10B981"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>${catFormula}</c:f><c:strCache>${buildStringCache(categories)}</c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${completedFormula}</c:f><c:numCache>${buildNumberCache(completed)}</c:numCache></c:numRef></c:val>
        </c:ser>
        <c:ser>
          <c:idx val="1"/>
          <c:order val="1"/>
          <c:tx><c:v>Đang xử lý</c:v></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="F59E0B"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>${catFormula}</c:f><c:strCache>${buildStringCache(categories)}</c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${processingFormula}</c:f><c:numCache>${buildNumberCache(processing)}</c:numCache></c:numRef></c:val>
        </c:ser>
        <c:gapWidth val="76"/>
        <c:axId val="${categoryAxisId}"/>
        <c:axId val="${valueAxisId}"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="${categoryAxisId}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${valueAxisId}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="${valueAxisId}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${categoryAxisId}"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/><c:layout/></c:legend>
    <c:plotVisOnly val="0"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
</c:chartSpace>`;
};

const buildDonutChartXml = (section: ProProductionSection, meta: SectionChartMeta) => {
  const categories = section.statusBreakdown.map((item) => item.label);
  const values = section.statusBreakdown.map((item) => item.value);
  const catFormula = excelRange(meta.sheetName, 21, meta.statusRowStart, meta.statusRowStart + meta.statusCount - 1);
  const valueFormula = excelRange(meta.sheetName, 22, meta.statusRowStart, meta.statusRowStart + meta.statusCount - 1);
  const points = section.statusBreakdown
    .map(
      (item, index) =>
        `<c:dPt><c:idx val="${index}"/><c:spPr><a:solidFill><a:srgbClr val="${item.color.replace(
          "#",
          ""
        )}"/></a:solidFill></c:spPr></c:dPt>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="vi-VN"/>
  <c:chart>
    <c:plotArea>
      <c:layout/>
      <c:doughnutChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>Trạng thái</c:v></c:tx>
          ${points}
          <c:cat><c:strRef><c:f>${catFormula}</c:f><c:strCache>${buildStringCache(categories)}</c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${valueFormula}</c:f><c:numCache>${buildNumberCache(values)}</c:numCache></c:numRef></c:val>
        </c:ser>
        <c:firstSliceAng val="0"/>
        <c:holeSize val="64"/>
      </c:doughnutChart>
    </c:plotArea>
    <c:legend><c:legendPos val="r"/><c:layout/></c:legend>
    <c:plotVisOnly val="0"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
</c:chartSpace>`;
};

const buildStationChartXml = (section: ProProductionSection, meta: SectionChartMeta, chartIndex: number) => {
  const categories = section.topStations.map((item) => item.stationName);
  const values = section.topStations.map((item) => item.totalOrders);
  const catFormula = excelRange(
    meta.sheetName,
    23,
    meta.stationRowStart,
    meta.stationRowStart + meta.stationCount - 1
  );
  const valueFormula = excelRange(
    meta.sheetName,
    24,
    meta.stationRowStart,
    meta.stationRowStart + meta.stationCount - 1
  );
  const categoryAxisId = chartIndex * 100 + 1;
  const valueAxisId = chartIndex * 100 + 2;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="vi-VN"/>
  <c:chart>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="bar"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>Chuyến</c:v></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>${catFormula}</c:f><c:strCache>${buildStringCache(categories)}</c:strCache></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${valueFormula}</c:f><c:numCache>${buildNumberCache(values)}</c:numCache></c:numRef></c:val>
        </c:ser>
        <c:gapWidth val="56"/>
        <c:axId val="${categoryAxisId}"/>
        <c:axId val="${valueAxisId}"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="${categoryAxisId}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${valueAxisId}"/>
        <c:crosses val="autoZero"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="${valueAxisId}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${categoryAxisId}"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:plotVisOnly val="0"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
</c:chartSpace>`;
};

type DrawingAnchor = {
  id: number;
  name: string;
  relationId: string;
  fromCol: number;
  toCol: number;
  fromRow: number;
  toRow: number;
};

const buildDrawingXml = (anchors: DrawingAnchor[]) => {
  const xmlAnchors: string[] = [];
  anchors.forEach((anchor) => {
    xmlAnchors.push(`
      <xdr:twoCellAnchor>
        <xdr:from><xdr:col>${anchor.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>${anchor.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
        <xdr:graphicFrame macro="">
          <xdr:nvGraphicFramePr>
            <xdr:cNvPr id="${anchor.id}" name="${xmlEscape(anchor.name)}"/>
            <xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr>
          </xdr:nvGraphicFramePr>
          <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
              <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${anchor.relationId}"/>
            </a:graphicData>
          </a:graphic>
        </xdr:graphicFrame>
        <xdr:clientData/>
      </xdr:twoCellAnchor>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  ${xmlAnchors.join("")}
</xdr:wsDr>`;
};

const injectNativeCharts = async (
  buffer: ExcelJS.Buffer,
  chartMetas: SectionChartMeta[],
  sections: ProProductionSection[]
) => {
  const zip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(zip.files);
  let nextDrawingIndex = findNextPartIndex(fileNames, /^xl\/drawings\/drawing(\d+)\.xml$/);
  let nextChartIndex = findNextPartIndex(fileNames, /^xl\/charts\/chart(\d+)\.xml$/);

  for (let index = 0; index < chartMetas.length; index += 1) {
    const meta = chartMetas[index];
    const section = sections[index];
    const includeBar = meta.seriesCount > 0;
    const includeDonut = meta.statusCount > 0;
    const includeStation = meta.stationCount > 0;
    if (!includeBar && !includeDonut && !includeStation) continue;

    const drawingIndex = nextDrawingIndex++;
    const sheetPath = `xl/worksheets/sheet${meta.sheetId}.xml`;
    const sheetRelsPath = `xl/worksheets/_rels/sheet${meta.sheetId}.xml.rels`;
    const drawingPath = `xl/drawings/drawing${drawingIndex}.xml`;
    const drawingRelsPath = `xl/drawings/_rels/drawing${drawingIndex}.xml.rels`;

    const chartParts: string[] = [];
    const chartRels: string[] = [];
    const drawingAnchors: DrawingAnchor[] = [];
    let nextRelationIndex = 1;
    let nextAnchorId = 2;

    if (includeBar) {
      const chartIndex = nextChartIndex++;
      const chartPath = `xl/charts/chart${chartIndex}.xml`;
      zip.file(chartPath, buildBarChartXml(section, meta, chartIndex));
      chartParts.push(`<Override PartName="/${chartPath}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      chartRels.push(
        `<Relationship Id="rId${nextRelationIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartIndex}.xml"/>`
      );
      drawingAnchors.push({
        id: nextAnchorId++,
        name: meta.barTitle,
        relationId: `rId${nextRelationIndex++}`,
        fromCol: 0,
        toCol: 8,
        fromRow: 10,
        toRow: 21,
      });
    }

    if (includeDonut) {
      const chartIndex = nextChartIndex++;
      const chartPath = `xl/charts/chart${chartIndex}.xml`;
      zip.file(chartPath, buildDonutChartXml(section, meta));
      chartParts.push(`<Override PartName="/${chartPath}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      chartRels.push(
        `<Relationship Id="rId${nextRelationIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartIndex}.xml"/>`
      );
      drawingAnchors.push({
        id: nextAnchorId++,
        name: meta.donutTitle,
        relationId: `rId${nextRelationIndex++}`,
        fromCol: 9,
        toCol: 14,
        fromRow: 10,
        toRow: 21,
      });
    }

    if (includeStation) {
      const chartIndex = nextChartIndex++;
      const chartPath = `xl/charts/chart${chartIndex}.xml`;
      zip.file(chartPath, buildStationChartXml(section, meta, chartIndex));
      chartParts.push(
        `<Override PartName="/${chartPath}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
      );
      chartRels.push(
        `<Relationship Id="rId${nextRelationIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartIndex}.xml"/>`
      );
      drawingAnchors.push({
        id: nextAnchorId++,
        name: meta.stationTitle,
        relationId: `rId${nextRelationIndex++}`,
        fromCol: 8,
        toCol: 14,
        fromRow: meta.stationChartStartRow - 1,
        toRow: meta.stationChartEndRow - 1,
      });
    }

    zip.file(drawingPath, buildDrawingXml(drawingAnchors));
    zip.file(
      drawingRelsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${chartRels.join("")}</Relationships>`
    );

    const contentTypesXml = await zip.file("[Content_Types].xml")!.async("string");
    let nextContentTypesXml = appendUniqueTag(
      contentTypesXml,
      "</Types>",
      `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      `PartName="/${drawingPath}"`
    );
    chartParts.forEach((part) => {
      const markerMatch = part.match(/PartName="([^"]+)"/);
      nextContentTypesXml = appendUniqueTag(nextContentTypesXml, "</Types>", part, markerMatch?.[1] || part);
    });
    zip.file("[Content_Types].xml", nextContentTypesXml);

    const sheetXml = await zip.file(sheetPath)!.async("string");
    const sheetWithDrawing = appendUniqueTag(
      sheetXml,
      "</worksheet>",
      `<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>`,
      "<drawing "
    );
    zip.file(sheetPath, sheetWithDrawing);

    const existingSheetRels = zip.file(sheetRelsPath) ? await zip.file(sheetRelsPath)!.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const sheetRelsWithDrawing = appendUniqueTag(
      existingSheetRels,
      "</Relationships>",
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingIndex}.xml"/>`,
      `Target="../drawings/drawing${drawingIndex}.xml"`
    );
    zip.file(sheetRelsPath, sheetRelsWithDrawing);
  }

  return zip.generateAsync({ type: "arraybuffer" });
};

const statusToneMeta = (tone: ProReportTripRow["statusTone"]) => {
  if (tone === "ok") return { text: "Hoàn thành", color: THEME.greenSoft, font: THEME.green };
  if (tone === "warn") return { text: "Cảnh báo", color: THEME.amberSoft, font: THEME.amber };
  if (tone === "bad") return { text: "Bất thường", color: THEME.roseSoft, font: THEME.rose };
  return { text: "Thông tin", color: THEME.blueSoft, font: THEME.primary };
};

const applyHeader = (worksheet: ExcelJS.Worksheet, rowIndex: number, headers: string[]) => {
  const row = worksheet.getRow(rowIndex);
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    styleCell(cell, {
      bg: THEME.slate100,
      color: THEME.slate500,
      bold: true,
      fontSize: 11,
      align: "center",
      wrap: true,
    });
  });
  row.height = 28;
};

const applyMergedHeader = (
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  headers: Array<{ label: string; from: number; to: number }>
) => {
  const row = worksheet.getRow(rowIndex);
  headers.forEach(({ label, from, to }) => {
    if (to > from) {
      worksheet.mergeCells(rowIndex, from, rowIndex, to);
    }
    const cell = row.getCell(from);
    cell.value = label;
    styleCell(cell, {
      bg: THEME.slate100,
      color: THEME.slate500,
      bold: true,
      fontSize: 11,
      align: "center",
      wrap: true,
    });
  });
  row.height = 28;
};

const renderSummaryCards = (
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  cards: { label: string; value: string; hint?: string }[],
  options: {
    cardHeight?: number;
    titleSize?: number;
    valueSize?: number;
    hintSize?: number;
  } = {}
) => {
  const cardHeight = options.cardHeight ?? 3;
  const titleSize = options.titleSize ?? 9;
  const valueSize = options.valueSize ?? 16;
  const hintSize = options.hintSize ?? 10;

  cards.slice(0, 5).forEach((card, index) => {
    const palette = CARD_PALETTE[index % CARD_PALETTE.length];
    const startCol = 1 + index * 3;
    const endCol = startCol + 1;
    worksheet.mergeCells(startRow, startCol, startRow + cardHeight, endCol);
    const root = worksheet.getCell(startRow, startCol);
    root.value = {
      richText: [
        {
          text: `${card.label.toUpperCase()}\n`,
          font: { name: "Segoe UI", size: titleSize, bold: true, color: { argb: ARGB(THEME.slate500) } },
        },
        {
          text: `${card.value}\n`,
          font: { name: "Segoe UI", size: valueSize, bold: true, color: { argb: ARGB(palette.value) } },
        },
        ...(card.hint
          ? [
              {
                text: card.hint,
                font: { name: "Segoe UI", size: hintSize, bold: true, color: { argb: ARGB(THEME.slate700) } },
              },
            ]
          : []),
      ],
    };
    root.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    root.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(palette.bg) } };
    root.border = {
      top: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
      left: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
      bottom: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
      right: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
    };
  });
  for (let row = startRow; row <= startRow + cardHeight; row += 1) {
    worksheet.getRow(row).height = 23;
  }
};

const renderPanel = (
  worksheet: ExcelJS.Worksheet,
  range: string,
  options: { title?: string; subtitle?: string; accent?: string; bg?: string } = {}
) => {
  const root = worksheet.getCell(range.split(":")[0]);
  worksheet.mergeCells(range);
  root.value = options.title
    ? {
        richText: [
          {
            text: `${options.title}\n`,
            font: { name: "Segoe UI", size: 12, bold: true, color: { argb: ARGB(THEME.slate900) } },
          },
          ...(options.subtitle
            ? [
                {
                  text: options.subtitle,
                  font: { name: "Segoe UI", size: 10, color: { argb: ARGB(THEME.slate500) } },
                },
              ]
            : []),
        ],
      }
    : "";
  root.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  root.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: ARGB(options.bg ?? "FFFFFF") },
  };
  root.border = {
    top: { style: "thin", color: { argb: ARGB(options.accent ?? THEME.slate200) } },
    left: { style: "thin", color: { argb: ARGB(options.accent ?? THEME.slate200) } },
    bottom: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
    right: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
  };
};

const renderSectionBanner = (
  worksheet: ExcelJS.Worksheet,
  range: string,
  title: string,
  subtitle?: string
) => {
  const root = worksheet.getCell(range.split(":")[0]);
  worksheet.mergeCells(range);
  root.value = subtitle
    ? {
        richText: [
          {
            text: `${title}\n`,
            font: { name: "Segoe UI", size: 13, bold: true, color: { argb: ARGB(THEME.slate900) } },
          },
          {
            text: subtitle,
            font: { name: "Segoe UI", size: 10, color: { argb: ARGB(THEME.slate500) } },
          },
        ],
      }
    : title;
  root.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  root.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB("F8FAFC") } };
  root.border = {
    top: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
    left: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
    bottom: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
    right: { style: "thin", color: { argb: ARGB(THEME.slate200) } },
  };
};

const writeSectionSheet = async (
  workbook: ExcelJS.Workbook,
  section: ProProductionSection,
  sectionIndex: number,
  periodLabel: string,
  generatedAtLabel: string
) => {
  const sheetName = safeSheetName(`${sectionIndex + 1}-${section.title}`);
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.views = [{ showGridLines: false }];
  const visibleWidths = [14, 14, 14, 14, 14, 10, 12, 20, 18, 18, 16, 12, 12, 12, 12, 4, 4];
  worksheet.columns = Array.from({ length: 24 }).map((_, i) => ({
    key: `c${i + 1}`,
    width: visibleWidths[i] ?? 12,
    hidden: i >= 17,
  }));

  worksheet.mergeCells("A1:O2");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = `BÁO CÁO SẢN LƯỢNG THEO CHUYẾN · ${section.title}`;
  titleCell.font = { name: "Segoe UI", size: 18, bold: true, color: { argb: ARGB(THEME.slate900) } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB("F8FAFC") } };

  worksheet.mergeCells("A3:O3");
  const subCell = worksheet.getCell("A3");
  subCell.value = `${section.subtitle} · ${periodLabel} · Xuất lúc ${generatedAtLabel}`;
  subCell.font = { name: "Segoe UI", size: 11, color: { argb: ARGB(THEME.slate500) }, bold: true };
  subCell.alignment = { horizontal: "left", vertical: "middle" };

  renderSummaryCards(worksheet, 5, section.summaryCards, { cardHeight: 4, titleSize: 10, valueSize: 17, hintSize: 10 });

  renderPanel(worksheet, "A10:I21", {
    title: "Biểu đồ sản lượng theo kỳ",
    subtitle: "So sánh số chuyến hoàn thành và đang xử lý theo từng mốc kỳ.",
    accent: THEME.primary,
    bg: "FFFFFF",
  });
  renderPanel(worksheet, "J10:O21", {
    title: "Biểu đồ phân bổ trạng thái",
    subtitle: "Tỷ trọng trạng thái đơn hàng trong phạm vi báo cáo hiện tại.",
    accent: THEME.green,
    bg: "FFFFFF",
  });

  for (let row = 10; row <= 21; row += 1) {
    worksheet.getRow(row).height = row === 10 ? 34 : 22;
  }

  const seriesStart = 23;
  const rawSeriesStartRow = seriesStart + 2;
  const rawSeriesLabelCol = 18;
  const rawSeriesCompletedCol = 19;
  const rawSeriesProcessingCol = 20;
  const rawStatusLabelCol = 21;
  const rawStatusValueCol = 22;
  const rawStationLabelCol = 23;
  const rawStationValueCol = 24;
  renderSectionBanner(
    worksheet,
    `A${seriesStart}:O${seriesStart}`,
    "Sản lượng theo kỳ",
    "Các cột lần lượt là: kỳ, số chuyến hoàn thành, đang xử lý, tổng chuyến và tổng KM."
  );
  applyMergedHeader(worksheet, seriesStart + 1, [
    { label: "Kỳ", from: 1, to: 7 },
    { label: "Hoàn thành", from: 8, to: 9 },
    { label: "Đang xử lý", from: 10, to: 11 },
    { label: "Tổng", from: 12, to: 13 },
    { label: "KM", from: 14, to: 15 },
  ]);

  let rowIndex = seriesStart + 2;
  section.series.forEach((item, index) => {
    const total = item.completed + item.processing;
    const row = worksheet.getRow(rowIndex);
    const bg = index % 2 === 0 ? "FFFFFF" : "FAFCFF";
    worksheet.mergeCells(rowIndex, 1, rowIndex, 7);
    worksheet.mergeCells(rowIndex, 8, rowIndex, 9);
    worksheet.mergeCells(rowIndex, 10, rowIndex, 11);
    worksheet.mergeCells(rowIndex, 12, rowIndex, 13);
    worksheet.mergeCells(rowIndex, 14, rowIndex, 15);
    row.getCell(1).value = item.label;
    row.getCell(8).value = item.completed;
    row.getCell(10).value = item.processing;
    row.getCell(12).value = total;
    row.getCell(14).value = Math.round(item.km);
    worksheet.getCell(rawSeriesStartRow + index, rawSeriesLabelCol).value = item.label;
    worksheet.getCell(rawSeriesStartRow + index, rawSeriesCompletedCol).value = item.completed;
    worksheet.getCell(rawSeriesStartRow + index, rawSeriesProcessingCol).value = item.processing;
    [1, 8, 10, 12, 14].forEach((col) => {
      styleCell(row.getCell(col), {
        bg,
        color: THEME.slate700,
        bold: col !== 1,
        align: col === 1 ? "left" : "center",
        fontSize: 11,
      });
    });
    row.height = 26;
    rowIndex += 1;
  });

  section.statusBreakdown.forEach((item, index) => {
    worksheet.getCell(rawSeriesStartRow + index, rawStatusLabelCol).value = item.label;
    worksheet.getCell(rawSeriesStartRow + index, rawStatusValueCol).value = item.value;
  });

  rowIndex += 1;
  renderSectionBanner(
    worksheet,
    `A${rowIndex}:O${rowIndex}`,
    "Top xe nổi bật",
    "Nhóm xe có sản lượng và số chuyến nổi bật trong kỳ."
  );
  rowIndex += 1;

  applyMergedHeader(worksheet, rowIndex, [
    { label: "Top xe", from: 1, to: 3 },
    { label: "Biển số", from: 4, to: 5 },
    { label: "Chuyến", from: 6, to: 7 },
    { label: "KM", from: 8, to: 9 },
    { label: "Hiệu suất", from: 10, to: 11 },
  ]);
  rowIndex += 1;

  const maxLen = Math.max(section.topVehicles.length, 3);
  for (let i = 0; i < maxLen; i += 1) {
    const vehicle = section.topVehicles[i];
    const bg = i % 2 === 0 ? "FFFFFF" : "FAFCFF";

    worksheet.mergeCells(rowIndex, 1, rowIndex, 3);
    worksheet.mergeCells(rowIndex, 4, rowIndex, 5);
    worksheet.mergeCells(rowIndex, 6, rowIndex, 7);
    worksheet.mergeCells(rowIndex, 8, rowIndex, 9);
    worksheet.mergeCells(rowIndex, 10, rowIndex, 11);

    worksheet.getCell(rowIndex, 1).value = vehicle ? `${i + 1}. ${vehicle.vehicleName}` : "—";
    worksheet.getCell(rowIndex, 4).value = vehicle?.licensePlate || "—";
    worksheet.getCell(rowIndex, 6).value = vehicle ? formatNumber(vehicle.totalOrders, 0) : "—";
    worksheet.getCell(rowIndex, 8).value = vehicle ? `${formatNumber(Math.round(vehicle.totalKm), 0)} km` : "—";
    worksheet.getCell(rowIndex, 10).value = vehicle ? `${formatNumber(vehicle.performancePercent, 0)}%` : "—";

    [1, 4, 6, 8, 10].forEach((col) => {
      styleCell(worksheet.getCell(rowIndex, col), {
        bg,
        bold: col === 1,
        align: col === 1 || col === 4 ? "left" : "center",
        color: THEME.slate700,
        fontSize: 11,
      });
    });
    worksheet.getRow(rowIndex).height = 26;
    rowIndex += 1;
  }

  rowIndex += 1;
  renderSectionBanner(
    worksheet,
    `A${rowIndex}:O${rowIndex}`,
    "Top trạm",
    "Tách riêng để theo dõi lưu lượng giao hàng theo từng trạm, tránh nhầm với top xe."
  );
  rowIndex += 1;

  const stationHeaderRow = rowIndex;
  const stationChartStartRow = stationHeaderRow;
  const stationTableRows = Math.max(section.topStations.length, 3);
  const stationChartEndRow = stationHeaderRow + Math.max(stationTableRows + 2, 7);

  renderPanel(worksheet, `I${stationHeaderRow}:O${stationChartEndRow}`, {
    title: "Biểu đồ top trạm",
    subtitle: "So sánh số chuyến đã ghi nhận theo từng trạm trong kỳ.",
    accent: THEME.primary,
    bg: "FFFFFF",
  });

  applyMergedHeader(worksheet, stationHeaderRow, [
    { label: "Top trạm", from: 1, to: 4 },
    { label: "Chuyến", from: 5, to: 6 },
    { label: "Tỷ lệ", from: 7, to: 8 },
  ]);
  rowIndex += 1;

  for (let i = 0; i < stationTableRows; i += 1) {
    const station = section.topStations[i];
    const bg = i % 2 === 0 ? "FFFFFF" : "FAFCFF";

    worksheet.mergeCells(rowIndex, 1, rowIndex, 4);
    worksheet.mergeCells(rowIndex, 5, rowIndex, 6);
    worksheet.mergeCells(rowIndex, 7, rowIndex, 8);

    worksheet.getCell(rowIndex, 1).value = station ? `${i + 1}. ${station.stationName}` : "—";
    worksheet.getCell(rowIndex, 5).value = station ? formatNumber(station.totalOrders, 0) : "—";
    worksheet.getCell(rowIndex, 7).value = station ? `${formatNumber(station.sharePercent, 0)}%` : "—";

    if (station) {
      worksheet.getCell(rowIndex, rawStationLabelCol).value = station.stationName;
      worksheet.getCell(rowIndex, rawStationValueCol).value = station.totalOrders;
    }

    [1, 5, 7].forEach((col) => {
      styleCell(worksheet.getCell(rowIndex, col), {
        bg,
        bold: col === 1,
        align: col === 1 ? "left" : "center",
        color: THEME.slate700,
        fontSize: 11,
      });
    });
    worksheet.getRow(rowIndex).height = 26;
    rowIndex += 1;
  }

  rowIndex = Math.max(rowIndex, stationChartEndRow + 1);
  rowIndex += 1;

  renderSectionBanner(
    worksheet,
    `A${rowIndex}:O${rowIndex}`,
    "Chi tiết chuyến (đầy đủ dữ liệu)",
    "Giữ nguyên dữ liệu từng chuyến để kiểm tra lại theo xe, trạm và thời gian vận hành."
  );
  rowIndex += 1;

  const tripHeaders = [
    "Ngày",
    "Mã xe",
    "Biển số",
    "Trạm",
    "Mã lệnh",
    "KM",
    "Sản lượng",
    "Dừng/đỗ",
    "TG di chuyển",
    "Bắt đầu",
    "Kết thúc",
    "Trạng thái",
  ];
  applyHeader(worksheet, rowIndex, tripHeaders);
  worksheet.getRow(rowIndex).height = 30;
  rowIndex += 1;

  if (!section.trips.length) {
    worksheet.mergeCells(rowIndex, 1, rowIndex, 15);
    const emptyCell = worksheet.getCell(rowIndex, 1);
    emptyCell.value = "Không có dữ liệu chuyến trong kỳ.";
    styleCell(emptyCell, { bg: "FFFFFF", color: THEME.slate500, align: "center" });
    rowIndex += 1;
  } else {
    section.trips.forEach((trip, index) => {
      const bg = index % 2 === 0 ? "FFFFFF" : "FAFCFF";
      const values = [
        trip.dateLabel,
        trip.vehicleName,
        trip.licensePlate,
        trip.stationName,
        trip.orderCode,
        trip.distanceKmText,
        trip.tripVolumeText,
        trip.stopText,
        trip.movementTimeText,
        trip.startText,
        trip.endText,
        trip.statusLabel,
      ];
      values.forEach((value, colIndex) => {
        const cell = worksheet.getCell(rowIndex, colIndex + 1);
        cell.value = value;
        const statusMeta = colIndex === 11 ? statusToneMeta(trip.statusTone) : null;
        styleCell(cell, {
          bg: statusMeta?.color || bg,
          color: statusMeta?.font || THEME.slate700,
          bold: colIndex === 1 || colIndex === 11,
          align: colIndex >= 4 && colIndex <= 10 ? "center" : "left",
          fontSize: 12,
          wrap: true,
        });
      });
      worksheet.getRow(rowIndex).height = 34;
      rowIndex += 1;
    });
  }

  worksheet.autoFilter = {
    from: { row: rowIndex - Math.max(section.trips.length, 1), column: 1 },
    to: { row: rowIndex - 1, column: 12 },
  };

  return {
    sheetId: worksheet.id,
    sheetName,
    barTitle: "Biểu đồ sản lượng theo kỳ",
    donutTitle: "Biểu đồ phân bổ trạng thái",
    stationTitle: "Biểu đồ top trạm",
    seriesRowStart: rawSeriesStartRow,
    seriesCount: section.series.length,
    statusRowStart: rawSeriesStartRow,
    statusCount: section.statusBreakdown.length,
    stationRowStart: stationHeaderRow + 1,
    stationCount: section.topStations.length,
    stationChartStartRow,
    stationChartEndRow,
  } satisfies SectionChartMeta;
};

export const exportProductionProExcel = async (
  documentData: ProProductionReportDocument,
  fileName: string
) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fleet Management System";
  workbook.company = "Savina";
  workbook.created = new Date();
  workbook.modified = new Date();

  const chartMetas: SectionChartMeta[] = [];
  for (let i = 0; i < documentData.sections.length; i += 1) {
    const chartMeta = await writeSectionSheet(
      workbook,
      documentData.sections[i],
      i,
      documentData.periodLabel,
      documentData.generatedAtLabel
    );
    chartMetas.push(chartMeta);
  }

  const baseBuffer = await workbook.xlsx.writeBuffer();
  const finalBuffer = await injectNativeCharts(baseBuffer, chartMetas, documentData.sections);
  const blob = new Blob([finalBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, `${fileName}.xlsx`);
};
