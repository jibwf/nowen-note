import archiver from "archiver";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { Context } from "hono";
import { getDb } from "../db/schema";
import {
  getAttachmentStorageInfo,
  getLocalAttachmentPath,
  readAttachmentObject,
} from "./attachment-storage";

const EXPORT_TMP_PREFIX = "nowen-markdown-export-";
const EXPORT_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INLINE_ASSET_BYTES = 128 * 1024 * 1024;
const MAX_STAGED_EXPORT_BYTES = 512 * 1024 * 1024;
const MAX_STAGED_EXPORTS_PER_USER = 5;

export interface PreparedMarkdownAsset {
  relPath: string;
  base64: string;
}

export interface PreparedMarkdownNote {
  id: string;
  title: string;
  notebookName: string | null;
  createdAt: string;
  updatedAt: string;
  contentFormat?: string;
  markdown: string;
  inlineAssets?: PreparedMarkdownAsset[];
}

export interface MarkdownExportJobSnapshot {
  id: string;
  state: "queued" | "building" | "ready" | "error";
  current: number;
  total: number;
  message: string;
  filename?: string;
  downloadToken?: string;
  warnings: number;
}

export class MarkdownExportBusyError extends Error {
  code = "EXPORT_JOB_BUSY";

  constructor() {
    super("已有导出任务正在生成，请等待当前任务完成");
  }
}

interface MarkdownExportJob extends MarkdownExportJobSnapshot {
  kind: "markdown" | "staged";
  userId: string;
  contentType: string;
  tmpDir: string;
  tmpPath: string;
  createdAt: number;
  expiresAt: number;
}

interface AttachmentRow {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string;
  path: string;
}

const jobs = new Map<string, MarkdownExportJob>();
const downloadTokens = new Map<string, string>();
let lastCleanupAt = 0;

function sanitizeFilename(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "") || "未命名";
}

function normalizeAssetRelPath(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../")) return null;
  return normalized
    .split("/")
    .filter(Boolean)
    .map(sanitizeFilename)
    .join("/");
}

function safeRemove(target: string): void {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    /* 临时文件清理由下一轮兜底 */
  }
}

function cleanupExpiredJobs(force = false): void {
  const now = Date.now();
  if (!force && now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  for (const [id, job] of jobs) {
    if (job.expiresAt > now) continue;
    jobs.delete(id);
    if (job.downloadToken) downloadTokens.delete(job.downloadToken);
    safeRemove(job.tmpDir);
  }

  try {
    for (const entry of fs.readdirSync(os.tmpdir(), { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(EXPORT_TMP_PREFIX)) continue;
      const abs = path.join(os.tmpdir(), entry.name);
      try {
        const stat = fs.statSync(abs);
        if (now - stat.mtimeMs > EXPORT_TTL_MS * 2) safeRemove(abs);
      } catch {
        safeRemove(abs);
      }
    }
  } catch {
    /* 系统临时目录不可读时不阻断导出 */
  }
}

function publicSnapshot(job: MarkdownExportJob): MarkdownExportJobSnapshot {
  return {
    id: job.id,
    state: job.state,
    current: job.current,
    total: job.total,
    message: job.message,
    filename: job.filename,
    downloadToken: job.downloadToken,
    warnings: job.warnings,
  };
}

function attachmentIdsInMarkdown(markdown: string): string[] {
  const ids = new Set<string>();
  const re = /\/api\/attachments\/([^/?#\s)"'<>]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    try {
      ids.add(decodeURIComponent(match[1]));
    } catch {
      ids.add(match[1]);
    }
  }
  return Array.from(ids);
}

function replaceAttachmentUrl(markdown: string, attachmentId: string, replacement: string): string {
  const escaped = attachmentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.replace(
    new RegExp(`(?:https?:\\/\\/[^\\s)"'<>]+)?\\/api\\/attachments\\/${escaped}(?:\\?[^\\s)"'<>]*)?`, "gi"),
    replacement,
  );
}

async function appendAttachment(
  archive: archiver.Archiver,
  row: AttachmentRow,
  zipPath: string,
): Promise<boolean> {
  const storage = getAttachmentStorageInfo();
  if (storage.driver === "local") {
    const abs = getLocalAttachmentPath(row.path);
    if (!fs.existsSync(abs)) return false;
    // 图片、视频、PDF 等附件通常已经压缩；直接 STORE 可显著降低 NAS CPU 占用。
    archive.file(abs, { name: zipPath, store: true } as archiver.ZipEntryData);
    return true;
  }

  const buffer = await readAttachmentObject(row.path);
  if (!buffer) return false;
  archive.append(buffer, { name: zipPath, store: true } as archiver.ZipEntryData);
  return true;
}

async function buildArchive(
  job: MarkdownExportJob,
  notes: PreparedMarkdownNote[],
  inlineImages: boolean,
  layout: "notebooks" | "flat",
): Promise<void> {
  job.state = "building";
  job.message = "正在生成 ZIP";
  const warnings: Array<Record<string, unknown>> = [];
  const output = fs.createWriteStream(job.tmpPath);
  const archive = archiver("zip", {
    zlib: { level: 6 },
    forceZip64: true,
  });
  const completion = new Promise<void>((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
    archive.once("error", reject);
  });
  archive.on("warning", (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      warnings.push({ type: "archive_source_missing", message: error.message });
      return;
    }
    archive.emit("error", error);
  });
  archive.pipe(output);

  const db = getDb();
  const getAttachment = db.prepare(
    `SELECT id, noteId, filename, mimeType, path
       FROM attachments
      WHERE id = ? AND userId = ?`,
  );
  const folderCounts = new Map<string, number>();
  const usedNotePaths = new Set<string>();
  const writtenAttachments = new Set<string>();

  for (let index = 0; index < notes.length; index++) {
    const note = notes[index];
    const folder = layout === "flat" ? "" : sanitizeFilename(note.notebookName || "未分类");
    const zipPrefix = folder ? `${folder}/` : "";
    if (folder) folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
    const baseName = sanitizeFilename(note.title);
    let noteName = baseName;
    let suffix = 2;
    while (usedNotePaths.has(`${zipPrefix}${noteName}.md`)) {
      noteName = `${baseName}_${suffix++}`;
    }
    usedNotePaths.add(`${zipPrefix}${noteName}.md`);
    let markdown = note.markdown || "";

    for (const attachmentId of attachmentIdsInMarkdown(markdown)) {
      const row = getAttachment.get(attachmentId, job.userId) as AttachmentRow | undefined;
      if (!row) {
        warnings.push({ type: "attachment_missing", noteId: note.id, attachmentId });
        continue;
      }

      if (inlineImages && row.mimeType.startsWith("image/")) {
        const buffer = await readAttachmentObject(row.path);
        if (!buffer) {
          warnings.push({ type: "attachment_file_missing", noteId: note.id, attachmentId });
          continue;
        }
        markdown = replaceAttachmentUrl(
          markdown,
          attachmentId,
          `data:${row.mimeType};base64,${buffer.toString("base64")}`,
        );
        continue;
      }

      const assetName = `att-${sanitizeFilename(row.id)}-${sanitizeFilename(row.filename)}`;
      const relPath = `assets/${assetName}`;
      const zipPath = `${zipPrefix}${relPath}`;
      if (writtenAttachments.has(zipPath)) {
        markdown = replaceAttachmentUrl(markdown, attachmentId, `./${relPath}`);
        continue;
      }

      if (await appendAttachment(archive, row, zipPath)) {
        writtenAttachments.add(zipPath);
        markdown = replaceAttachmentUrl(markdown, attachmentId, `./${relPath}`);
      } else {
        warnings.push({ type: "attachment_file_missing", noteId: note.id, attachmentId });
      }
    }

    for (const asset of note.inlineAssets || []) {
      const relPath = normalizeAssetRelPath(asset.relPath);
      if (!relPath) {
        warnings.push({ type: "inline_asset_invalid_path", noteId: note.id, path: asset.relPath });
        continue;
      }
      const zipPath = `${zipPrefix}${relPath}`;
      if (writtenAttachments.has(zipPath)) continue;
      const estimatedBytes = Math.ceil((asset.base64.length * 3) / 4);
      if (estimatedBytes > MAX_INLINE_ASSET_BYTES) {
        warnings.push({ type: "inline_asset_too_large", noteId: note.id, path: relPath });
        continue;
      }
      try {
        archive.append(
          Buffer.from(asset.base64, "base64"),
          { name: zipPath, store: true } as archiver.ZipEntryData,
        );
        writtenAttachments.add(zipPath);
      } catch {
        warnings.push({ type: "inline_asset_invalid", noteId: note.id, path: relPath });
      }
    }

    const frontmatter = [
      "---",
      `title: "${note.title.replace(/"/g, '\\"')}"`,
      `contentFormat: "${note.contentFormat || "tiptap-json"}"`,
      `created: ${note.createdAt}`,
      `updated: ${note.updatedAt}`,
      "---",
      "",
    ].join("\n");
    archive.append(frontmatter + markdown, { name: `${zipPrefix}${noteName}.md` });
    job.current = index + 1;
    job.message = `正在打包：${note.title}`;
  }

  archive.append(JSON.stringify({
    version: "2.0",
    app: "nowen-note",
    exportedAt: new Date().toISOString(),
    totalNotes: notes.length,
    notebooks: Array.from(folderCounts.entries()).map(([name, count]) => ({ name, count })),
    warnings: warnings.length,
  }, null, 2), { name: "metadata.json" });
  if (warnings.length > 0) {
    archive.append(JSON.stringify({ version: "1.0", items: warnings }, null, 2), {
      name: "export-warnings.json",
    });
  }

  job.message = "正在完成 ZIP 文件";
  await archive.finalize();
  await completion;
  job.warnings = warnings.length;
  job.state = "ready";
  job.current = job.total;
  job.message = warnings.length > 0 ? `导出完成，${warnings.length} 个附件需要检查` : "导出完成";
  job.downloadToken = crypto.randomBytes(32).toString("hex");
  downloadTokens.set(job.downloadToken, job.id);
}

export function createMarkdownExportJob(params: {
  userId: string;
  notes: PreparedMarkdownNote[];
  inlineImages: boolean;
  layout?: "notebooks" | "flat";
  filenameBase?: string;
}): MarkdownExportJobSnapshot {
  cleanupExpiredJobs();
  for (const [jobId, job] of jobs) {
    if (job.userId !== params.userId) continue;
    if (job.state === "queued" || job.state === "building") {
      throw new MarkdownExportBusyError();
    }
    // 每个用户只保留最近一个已完成包，避免连续导出把 NAS 临时盘占满。
    jobs.delete(jobId);
    if (job.downloadToken) downloadTokens.delete(job.downloadToken);
    safeRemove(job.tmpDir);
  }
  const id = crypto.randomUUID();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), EXPORT_TMP_PREFIX));
  const date = new Date().toISOString().slice(0, 10);
  const job: MarkdownExportJob = {
    id,
    kind: "markdown",
    userId: params.userId,
    contentType: "application/zip",
    state: "queued",
    current: 0,
    total: params.notes.length,
    message: "等待生成 ZIP",
    filename: params.filenameBase
      ? `${sanitizeFilename(params.filenameBase)}.zip`
      : `nowen-note_backup_${date}.zip`,
    warnings: 0,
    tmpDir,
    tmpPath: path.join(tmpDir, "export.zip"),
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPORT_TTL_MS,
  };
  jobs.set(id, job);

  void buildArchive(job, params.notes, params.inlineImages, params.layout || "notebooks").catch((error) => {
    console.error("[markdown-export] build failed:", error);
    safeRemove(job.tmpDir);
    job.state = "error";
    job.message = error instanceof Error ? error.message : "生成 ZIP 失败";
    job.expiresAt = Date.now() + EXPORT_TTL_MS;
  });
  return publicSnapshot(job);
}

export async function stageGeneratedExport(params: {
  userId: string;
  filename: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
  contentLength?: number;
}): Promise<{ downloadToken: string; filename: string; size: number }> {
  cleanupExpiredJobs();
  if (params.contentLength && params.contentLength > MAX_STAGED_EXPORT_BYTES) {
    throw new Error("导出文件超过 512MB，无法通过临时下载中转");
  }

  const stagedJobs = Array.from(jobs.values())
    .filter((job) => job.userId === params.userId && job.kind === "staged")
    .sort((a, b) => a.createdAt - b.createdAt);
  while (stagedJobs.length >= MAX_STAGED_EXPORTS_PER_USER) {
    const old = stagedJobs.shift()!;
    jobs.delete(old.id);
    if (old.downloadToken) downloadTokens.delete(old.downloadToken);
    safeRemove(old.tmpDir);
  }

  const id = crypto.randomUUID();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), EXPORT_TMP_PREFIX));
  const tmpPath = path.join(tmpDir, "export.bin");
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_STAGED_EXPORT_BYTES) {
        callback(new Error("导出文件超过 512MB，无法通过临时下载中转"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(params.body as unknown as Parameters<typeof Readable.fromWeb>[0]),
      limiter,
      fs.createWriteStream(tmpPath),
    );
    if (size === 0) throw new Error("导出文件为空");
  } catch (error) {
    safeRemove(tmpDir);
    throw error;
  }

  const downloadToken = crypto.randomBytes(32).toString("hex");
  const filename = sanitizeFilename(params.filename);
  const job: MarkdownExportJob = {
    id,
    kind: "staged",
    userId: params.userId,
    contentType: params.contentType,
    state: "ready",
    current: 1,
    total: 1,
    message: "导出文件已准备完成",
    filename,
    downloadToken,
    warnings: 0,
    tmpDir,
    tmpPath,
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPORT_TTL_MS,
  };
  jobs.set(id, job);
  downloadTokens.set(downloadToken, id);
  return { downloadToken, filename, size };
}

export function getMarkdownExportJob(jobId: string, userId: string): MarkdownExportJobSnapshot | null {
  cleanupExpiredJobs();
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  return publicSnapshot(job);
}

export function handleMarkdownExportDownload(c: Context): Response {
  cleanupExpiredJobs();
  const token = c.req.param("token");
  const jobId = downloadTokens.get(token);
  const job = jobId ? jobs.get(jobId) : undefined;
  if (!job || job.state !== "ready" || job.downloadToken !== token || !fs.existsSync(job.tmpPath)) {
    return new Response(JSON.stringify({ error: "下载链接无效或已过期" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const stat = fs.statSync(job.tmpPath);
  const stream = fs.createReadStream(job.tmpPath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": job.contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(job.filename || "nowen-note.zip")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const markdownExportTestUtils = {
  attachmentIdsInMarkdown,
  normalizeAssetRelPath,
  replaceAttachmentUrl,
  sanitizeFilename,
};
