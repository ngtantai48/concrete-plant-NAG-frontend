import { google, sheets_v4 } from "googleapis";
import { NextResponse } from "next/server";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function POST(request: Request) {
  try {
    const { sourceMonth, targetMonth } = (await request.json()) as {
      sourceMonth: number;
      targetMonth: number;
    };

    if (typeof sourceMonth !== "number" || typeof targetMonth !== "number") {
      return NextResponse.json(
        { error: "sourceMonth và targetMonth là bắt buộc" },
        { status: 400 }
      );
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing GOOGLE_SPREADSHEET_ID" }, { status: 500 });
    }

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const sourceTitle = `CÔNG THÁNG ${sourceMonth}`;
    const targetTitle = `CÔNG THÁNG ${targetMonth}`;

    const sourceMeta = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`'${sourceTitle}'`],
      fields:
        "sheets(properties(sheetId,title),merges,data(columnMetadata,rowMetadata))",
    });

    const allMeta = await sheets.spreadsheets.get({ spreadsheetId });

    const sourceSheet = allMeta.data.sheets?.find(
      (s) => s.properties?.title === sourceTitle
    );
    const targetSheet = allMeta.data.sheets?.find(
      (s) => s.properties?.title === targetTitle
    );

    const sourceId = sourceSheet?.properties?.sheetId;
    const targetId = targetSheet?.properties?.sheetId;
    const sourceRowCount = sourceSheet?.properties?.gridProperties?.rowCount;
    const sourceColCount = sourceSheet?.properties?.gridProperties?.columnCount;
    const targetRowCount = targetSheet?.properties?.gridProperties?.rowCount;
    const targetColCount = targetSheet?.properties?.gridProperties?.columnCount;

    if (typeof sourceId !== "number") {
      return NextResponse.json(
        { error: `Không tìm thấy sheet: ${sourceTitle}` },
        { status: 404 }
      );
    }
    if (typeof targetId !== "number") {
      return NextResponse.json(
        { error: `Không tìm thấy sheet: ${targetTitle}` },
        { status: 404 }
      );
    }

    const sourceData = sourceMeta.data.sheets?.[0];
    const sourceMerges = sourceData?.merges || [];
    const sourceColMetadata = sourceData?.data?.[0]?.columnMetadata || [];
    const sourceRowMetadata = sourceData?.data?.[0]?.rowMetadata || [];

    const expandRequests: sheets_v4.Schema$Request[] = [];
    if (
      typeof sourceRowCount === "number" &&
      typeof targetRowCount === "number" &&
      sourceRowCount > targetRowCount
    ) {
      expandRequests.push({
        appendDimension: {
          sheetId: targetId,
          dimension: "ROWS",
          length: sourceRowCount - targetRowCount,
        },
      });
    }
    if (
      typeof sourceColCount === "number" &&
      typeof targetColCount === "number" &&
      sourceColCount > targetColCount
    ) {
      expandRequests.push({
        appendDimension: {
          sheetId: targetId,
          dimension: "COLUMNS",
          length: sourceColCount - targetColCount,
        },
      });
    }
    if (expandRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: expandRequests },
      });
    }

    const rows =
      typeof sourceRowCount === "number" && sourceRowCount > 0
        ? sourceRowCount
        : 500;
    const cols =
      typeof sourceColCount === "number" && sourceColCount > 0
        ? sourceColCount
        : 36;

    const requests: sheets_v4.Schema$Request[] = [];

    requests.push({
      copyPaste: {
        source: {
          sheetId: sourceId,
          startRowIndex: 0,
          endRowIndex: rows,
          startColumnIndex: 0,
          endColumnIndex: cols,
        },
        destination: {
          sheetId: targetId,
          startRowIndex: 0,
          endRowIndex: rows,
          startColumnIndex: 0,
          endColumnIndex: cols,
        },
        pasteType: "PASTE_FORMAT",
        pasteOrientation: "NORMAL",
      },
    });

    const colLimit = Math.min(sourceColMetadata.length, cols);
    for (let i = 0; i < colLimit; i++) {
      const pixelSize = sourceColMetadata[i].pixelSize;
      if (typeof pixelSize === "number") {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: targetId,
              dimension: "COLUMNS",
              startIndex: i,
              endIndex: i + 1,
            },
            properties: { pixelSize },
            fields: "pixelSize",
          },
        });
      }
    }

    const rowLimit = Math.min(sourceRowMetadata.length, rows);
    for (let i = 0; i < rowLimit; i++) {
      const pixelSize = sourceRowMetadata[i].pixelSize;
      if (typeof pixelSize === "number") {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: targetId,
              dimension: "ROWS",
              startIndex: i,
              endIndex: i + 1,
            },
            properties: { pixelSize },
            fields: "pixelSize",
          },
        });
      }
    }

    requests.push({
      unmergeCells: {
        range: {
          sheetId: targetId,
          startRowIndex: 0,
          endRowIndex: rows,
          startColumnIndex: 0,
          endColumnIndex: cols,
        },
      },
    });

    for (const merge of sourceMerges) {
      if (
        typeof merge.startRowIndex === "number" &&
        typeof merge.endRowIndex === "number" &&
        typeof merge.startColumnIndex === "number" &&
        typeof merge.endColumnIndex === "number"
      ) {
        requests.push({
          mergeCells: {
            range: {
              sheetId: targetId,
              startRowIndex: merge.startRowIndex,
              endRowIndex: merge.endRowIndex,
              startColumnIndex: merge.startColumnIndex,
              endColumnIndex: merge.endColumnIndex,
            },
            mergeType: "MERGE_ALL",
          },
        });
      }
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });

    return NextResponse.json({
      success: true,
      sourceTitle,
      targetTitle,
      mergesApplied: sourceMerges.length,
      columnsResized: sourceColMetadata.filter((c) => typeof c.pixelSize === "number")
        .length,
      rowsResized: sourceRowMetadata.filter((r) => typeof r.pixelSize === "number").length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Reformat error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
