import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const mimeTypes: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
};

function artifactRoots() {
  const configured = (process.env.AI_ARTIFACT_ROOTS ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  return [process.cwd(), ...configured].map((item) => resolve(item));
}

function isInsideRoot(pathname: string, root: string) {
  const normalizedPath = pathname.toLowerCase();
  const normalizedRoot = root.toLowerCase();
  const relative = normalizedPath.slice(normalizedRoot.length);
  return normalizedPath === normalizedRoot || relative.startsWith(sep);
}

function resolveAllowedPath(value: string) {
  const decoded = value.replace(/^file:\/+/i, "");
  const candidate = isAbsolute(decoded) ? resolve(decoded) : resolve(process.cwd(), decoded);
  const root = artifactRoots().find((item) => isInsideRoot(candidate, item));
  return root ? candidate : null;
}

function contentType(pathname: string) {
  const extension = extname(pathname).toLowerCase();
  return mimeTypes[extension] ?? "application/octet-stream";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path");
  const shouldDownload = searchParams.get("download") === "1";

  if (!requestedPath) {
    return NextResponse.json({ error: "Missing artifact path" }, { status: 400 });
  }

  const pathname = resolveAllowedPath(requestedPath);
  if (!pathname) {
    return NextResponse.json({ error: "Artifact path is not allowed" }, { status: 403 });
  }

  const fileStat = await stat(pathname).catch(() => null);
  if (!fileStat?.isFile()) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(pathname));
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Content-Length": String(fileStat.size),
    "Content-Type": contentType(pathname),
  });

  if (shouldDownload) {
    headers.set("Content-Disposition", `attachment; filename="${basename(pathname)}"`);
  }

  return new NextResponse(stream as BodyInit, { headers });
}
