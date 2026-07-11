import { Hono } from "hono";
import { getDb } from "../db/schema";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { resolveNotebookPermission, hasPermission } from "../middleware/acl";
import { broadcastNoteUpdated } from "../services/realtime";
import { extractAttachmentText } from "../services/attachment-indexer";
import { folderSyncFilesRepository } from "../repositories";

const app = new Hono();

const MAX_TEXT_CHARS = 2 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const EXTRACT_LIMIT = 200_000;
const SYNC_COMMENT_RE = /\s*<!--\s*nowen-folder-sync:[\s\S]*?-->\s*/g;
const EXTRACT_BLOCK_RE = /\s*<!--\s*nowen-folder-sync-extracted:start\s*-->[\s\S]*?<!--\s*nowen-folder-sync-extracted:end\s*-->\s*/g;

type ConflictPolicy = "protect" | "copy" | "overwrite";
type DeletionPolicy = "keep" | "trash" | "detach";

type SyncRow = {
  id: string;
  userId: string;
  sourcePathHash: string;
  relativePath: string;
  filename: string;
  sha256: string;
  noteId: string;
  createdAt: string;
  updatedAt: string;
};

type TrackedNote = {
  id: string;
  userId: string;
  notebookId: string;
  workspaceId: string | null;
  title: string;
  content: string;
  contentText: string;
  contentFormat: string | null;
  isTrashed: number;
  version: number;
  updatedAt: string;
};

function isUnsafePath(value: unknown): boolean {
  if (typeof value !== "string" || !value || value.length > 1024) return true;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value)) return true;
  const parts = value.replace(/\\/g, "/").split("/");
  return parts.some((part) => part === ".." || part.includes("\0"));
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function normalizeConflictPolicy(value: unknown): ConflictPolicy {
  return value === "copy" || value === "overwrite" ? value : "protect";
}

function normalizeDeletionPolicy(value: unknown): DeletionPolicy {
  return value === "trash" || value === "detach" ? value : "keep";
}

function filenameToTitle(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return (dot > 0 ? filename.slice(0, dot) : filename).slice(0, 255);
}

function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function stripSyncComment(value: string | null | undefined): string {
  return String(value || "").replace(SYNC_COMMENT_RE, "").trimEnd();
}

function stripAllSyncMetadata(value: string | null | undefined): string {
  return stripSyncComment(String(value || "").replace(EXTRACT_BLOCK_RE, "")).trimEnd();
}

function extractManagedContentHash(content: string): string | null {
  const match = content.match(/contentHash=([a-f0-9]{64})/i);
  return match?.[1]?.toLowerCase() || null;
}

function buildSyncComment(relativePath: string, sourceSha: string, sourcePathHash: string, contentHash: string): string {
  const encodedPath = encodeURIComponent(relativePath).slice(0, 2048);
  return `\n\n<!-- nowen-folder-sync: sourcePathHash=${sourcePathHash} sha256=${sourceSha} contentHash=${contentHash} relativePath=${encodedPath} -->`;
}

function buildManagedContent(baseContent: string, relativePath: string, sourceSha: string, sourcePathHash: string): string {
  const normalizedBase = baseContent.trimEnd();
  return normalizedBase + buildSyncComment(relativePath, sourceSha, sourcePathHash, sha256Text(normalizedBase));
}

function parseDbTime(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSyncRow(userId: string, sourcePathHash: string): SyncRow | undefined {
  return getDb().prepare(`
    SELECT id, "userId" AS userId, "sourcePathHash" AS sourcePathHash,
           "relativePath" AS relativePath, filename, sha256,
           "noteId" AS noteId, "createdAt" AS createdAt, "updatedAt" AS updatedAt
      FROM folder_sync_files
     WHERE "userId" = ? AND "sourcePathHash" = ?
  `).get(userId, sourcePathHash) as SyncRow | undefined;
}

function getTrackedNote(noteId: string | null | undefined): TrackedNote | undefined {
  if (!noteId) return undefined;
  return getDb().prepare(`
    SELECT id, "userId" AS userId, "notebookId" AS notebookId,
           "workspaceId" AS workspaceId, title, content, "contentText" AS contentText,
           "contentFormat" AS contentFormat, "isTrashed" AS isTrashed,
           version, "updatedAt" AS updatedAt
      FROM notes WHERE id = ?
  `).get(noteId) as TrackedNote | undefined;
}

function hasManualConflict(note: TrackedNote | undefined, syncRow: SyncRow | undefined): boolean {
  if (!note || !syncRow) return false;
  const managedHash = extractManagedContentHash(note.content || "");
  if (managedHash) {
    return sha256Text(stripSyncComment(note.content || "")) !== managedHash;
  }
  // Backward compatibility for notes created by the MVP before contentHash existed.
  return parseDbTime(note.updatedAt) > parseDbTime(syncRow.updatedAt) + 500;
}

function assertNoteOwner(note: TrackedNote | undefined, userId: string): { ok: true } | { ok: false; status: 400 | 403 | 404; error: string; code: string } {
  if (!note) return { ok: false, status: 404, error: "同步目标笔记不存在", code: "NOTE_NOT_FOUND" };
  if (note.userId !== userId) return { ok: false, status: 403, error: "无权修改他人的笔记", code: "FORBIDDEN" };
  if (note.isTrashed === 1) return { ok: false, status: 400, error: "同步目标笔记已在回收站", code: "NOTE_TRASHED" };
  return { ok: true };
}

function resolveTargetNotebook(targetNotebookId: string, userId: string): { id: string; workspaceId: string | null } | null {
  const db = getDb();
  const notebook = db.prepare(`
    SELECT id, "workspaceId" AS workspaceId, "isDeleted" AS isDeleted
      FROM notebooks WHERE id = ?
  `).get(targetNotebookId) as { id: string; workspaceId: string | null; isDeleted: number } | undefined;
  if (!notebook || notebook.isDeleted === 1) return null;
  const { permission } = resolveNotebookPermission(targetNotebookId, userId);
  return hasPermission(permission, "write") ? notebook : null;
}

function cloneIndependentNote(note: TrackedNote): string {
  const copyId = uuid();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const title = `${note.title}（同步冲突副本 ${stamp}）`.slice(0, 255);
  const content = stripAllSyncMetadata(note.content);
  const contentText = stripAllSyncMetadata(note.contentText || content);
  getDb().prepare(`
    INSERT INTO notes (
      id, "userId", "notebookId", "workspaceId", title, content,
      "contentText", "contentFormat", version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    copyId,
    note.userId,
    note.notebookId,
    note.workspaceId,
    title,
    content,
    contentText,
    note.contentFormat || "markdown",
  );
  return copyId;
}

function broadcastChanged(noteId: string, userId: string, title: string, contentText: string): void {
  try {
    const row = getDb().prepare(`SELECT version, "updatedAt" AS updatedAt FROM notes WHERE id = ?`).get(noteId) as { version: number; updatedAt: string };
    broadcastNoteUpdated(noteId, {
      version: row.version,
      updatedAt: row.updatedAt,
      title,
      contentText: contentText.slice(0, 200),
      actorUserId: userId,
    });
  } catch {
    // realtime notification is best effort
  }
}

function getAttachmentBaseDir(): string {
  return process.env.NOWEN_DATA_DIR || path.join(process.cwd(), "data");
}

function safeRemoveAttachmentFile(relativePath: string): void {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.replace(/\\/g, "/").split("/").includes("..")) return;
  const root = path.resolve(getAttachmentBaseDir(), "attachments");
  const full = path.resolve(root, relativePath);
  if (!full.startsWith(`${root}${path.sep}`)) return;
  try { fs.unlinkSync(full); } catch { /* best effort */ }
}

app.post("/import-file", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const filename = typeof body.filename === "string" ? body.filename : "";
  const relativePath = typeof body.relativePath === "string" ? body.relativePath : "";
  const sourceSha = typeof body.sha256 === "string" ? body.sha256 : "";
  const sourcePathHash = typeof body.sourcePathHash === "string" ? body.sourcePathHash : "";
  const targetNotebookId = typeof body.targetNotebookId === "string" ? body.targetNotebookId : "";
  const contentText = typeof body.contentText === "string" ? body.contentText : "";
  const existingNoteId = typeof body.existingNoteId === "string" ? body.existingNoteId : undefined;
  const conflictPolicy = normalizeConflictPolicy(body.conflictPolicy);

  if (!filename || filename.length > 255) return c.json({ error: "filename 无效", code: "INVALID_FILENAME" }, 400);
  if (isUnsafePath(relativePath)) return c.json({ error: "relativePath 不安全", code: "UNSAFE_PATH" }, 400);
  if (!isSha256(sourceSha) || !isSha256(sourcePathHash)) return c.json({ error: "哈希无效", code: "INVALID_HASH" }, 400);
  if (!targetNotebookId) return c.json({ error: "targetNotebookId 不能为空", code: "MISSING_NOTEBOOK" }, 400);
  if (contentText.length > MAX_TEXT_CHARS) return c.json({ error: "contentText 超过 2MB 限制", code: "CONTENT_TOO_LARGE" }, 400);

  const notebook = resolveTargetNotebook(targetNotebookId, userId);
  if (!notebook) return c.json({ error: "目标笔记本不存在、已删除或无写权限", code: "FORBIDDEN" }, 403);

  let syncRow = getSyncRow(userId, sourcePathHash);
  if (syncRow?.sha256 === sourceSha) {
    return c.json({ success: true, created: false, updated: false, skipped: true, reason: "unchanged", noteId: syncRow.noteId, sha256: sourceSha });
  }

  let note = getTrackedNote(existingNoteId || syncRow?.noteId);
  if (note) {
    const owner = assertNoteOwner(note, userId);
    if (!owner.ok) return c.json({ error: owner.error, code: owner.code }, owner.status);
  } else if (syncRow) {
    folderSyncFilesRepository.delete(syncRow.id);
    syncRow = undefined;
  }

  const conflict = hasManualConflict(note, syncRow);
  if (conflict && conflictPolicy === "protect") {
    return c.json({ error: "Nowen 内的同步笔记已被手动修改，已阻止源文件静默覆盖", code: "SYNC_CONFLICT", noteId: note?.id }, 409);
  }

  const title = filenameToTitle(filename);
  const content = buildManagedContent(contentText, relativePath, sourceSha, sourcePathHash);
  let noteId = note?.id || uuid();
  let conflictCopyNoteId: string | undefined;

  const transaction = getDb().transaction(() => {
    if (conflict && conflictPolicy === "copy" && note) conflictCopyNoteId = cloneIndependentNote(note);
    if (note) {
      getDb().prepare(`
        UPDATE notes
           SET title = ?, content = ?, "contentText" = ?, "notebookId" = ?,
               "workspaceId" = ?, "contentFormat" = 'markdown',
               version = version + 1, "updatedAt" = datetime('now')
         WHERE id = ?
      `).run(title, content, contentText, targetNotebookId, notebook.workspaceId, noteId);
    } else {
      getDb().prepare(`
        INSERT INTO notes (
          id, "userId", "notebookId", "workspaceId", title, content,
          "contentText", "contentFormat"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'markdown')
      `).run(noteId, userId, targetNotebookId, notebook.workspaceId, title, content, contentText);
    }

    if (syncRow) {
      folderSyncFilesRepository.update(syncRow.id, { sha256: sourceSha, relativePath, filename, noteId });
    } else {
      folderSyncFilesRepository.create({ id: uuid(), userId, sourcePathHash, relativePath, filename, sha256: sourceSha, noteId });
    }
  });
  transaction();
  broadcastChanged(noteId, userId, title, contentText);

  return c.json({
    success: true,
    created: !note,
    updated: !!note,
    skipped: false,
    noteId,
    sha256: sourceSha,
    conflictCopyNoteId,
  });
});

app.post("/import-attachment", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const body = await c.req.parseBody();
  const file = body.file;
  const filename = typeof body.filename === "string" ? body.filename : "";
  const relativePath = typeof body.relativePath === "string" ? body.relativePath : "";
  const sourceSha = typeof body.sha256 === "string" ? body.sha256 : "";
  const sourcePathHash = typeof body.sourcePathHash === "string" ? body.sourcePathHash : "";
  const targetNotebookId = typeof body.targetNotebookId === "string" ? body.targetNotebookId : "";
  const existingNoteId = typeof body.existingNoteId === "string" ? body.existingNoteId : undefined;
  const conflictPolicy = normalizeConflictPolicy(body.conflictPolicy);
  const shouldExtractText = body.extractText !== "0";

  if (!(file instanceof File)) return c.json({ error: "未上传文件", code: "NO_FILE" }, 400);
  if (!filename || filename.length > 255 || isUnsafePath(relativePath)) return c.json({ error: "文件参数无效", code: "INVALID_PARAMS" }, 400);
  if (!isSha256(sourceSha) || !isSha256(sourcePathHash)) return c.json({ error: "哈希无效", code: "INVALID_HASH" }, 400);
  if (file.size > MAX_ATTACHMENT_BYTES) return c.json({ error: "附件超过 50MB 限制", code: "FILE_TOO_LARGE" }, 413);
  const ext = path.extname(filename).toLowerCase();
  if (![".pdf", ".docx"].includes(ext)) return c.json({ error: `不支持的文件类型: ${ext}`, code: "UNSUPPORTED_FILE_TYPE" }, 400);

  const notebook = resolveTargetNotebook(targetNotebookId, userId);
  if (!notebook) return c.json({ error: "目标笔记本不存在、已删除或无写权限", code: "FORBIDDEN" }, 403);

  let syncRow = getSyncRow(userId, sourcePathHash);
  if (syncRow?.sha256 === sourceSha) {
    return c.json({ success: true, created: false, updated: false, skipped: true, reason: "unchanged", noteId: syncRow.noteId, sha256: sourceSha });
  }
  let note = getTrackedNote(existingNoteId || syncRow?.noteId);
  if (note) {
    const owner = assertNoteOwner(note, userId);
    if (!owner.ok) return c.json({ error: owner.error, code: owner.code }, owner.status);
  } else if (syncRow) {
    folderSyncFilesRepository.delete(syncRow.id);
    syncRow = undefined;
  }

  const conflict = hasManualConflict(note, syncRow);
  if (conflict && conflictPolicy === "protect") {
    return c.json({ error: "Nowen 内的同步笔记已被手动修改，已阻止源文件静默覆盖", code: "SYNC_CONFLICT", noteId: note?.id }, 409);
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const actualSha = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  if (actualSha !== sourceSha.toLowerCase()) return c.json({ error: "文件 SHA-256 不匹配", code: "HASH_MISMATCH" }, 400);

  const title = filenameToTitle(filename);
  const baseContent = [
    `# ${title}`,
    "",
    "此文件来自桌面端文件夹同步。",
    "",
    `- 文件名：${filename}`,
    `- 相对路径：${relativePath}`,
    `- SHA-256：${sourceSha}`,
  ].join("\n");
  const content = buildManagedContent(baseContent, relativePath, sourceSha, sourcePathHash);
  let noteId = note?.id || uuid();
  let conflictCopyNoteId: string | undefined;

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const directory = path.join(getAttachmentBaseDir(), "attachments", year, month);
  fs.mkdirSync(directory, { recursive: true });
  const attachmentId = uuid();
  const fileNameOnDisk = `${attachmentId}${ext.replace(/[^a-z0-9.]/gi, "")}`;
  const fullPath = path.join(directory, fileNameOnDisk);
  const relativeAttachmentPath = `${year}/${month}/${fileNameOnDisk}`;
  fs.writeFileSync(fullPath, fileBuffer);

  const oldAttachments = noteId
    ? getDb().prepare(`
        SELECT id, path FROM attachments
         WHERE "noteId" = ? AND "userId" = ? AND "uploadSource" = 'folder_sync'
      `).all(noteId, userId) as Array<{ id: string; path: string }>
    : [];

  try {
    const transaction = getDb().transaction(() => {
      if (conflict && conflictPolicy === "copy" && note) conflictCopyNoteId = cloneIndependentNote(note);
      if (note) {
        getDb().prepare(`
          UPDATE notes
             SET title = ?, content = ?, "contentText" = ?, "notebookId" = ?,
                 "workspaceId" = ?, "contentFormat" = 'markdown',
                 version = version + 1, "updatedAt" = datetime('now')
           WHERE id = ?
        `).run(title, content, baseContent, targetNotebookId, notebook.workspaceId, noteId);
      } else {
        getDb().prepare(`
          INSERT INTO notes (
            id, "userId", "notebookId", "workspaceId", title, content,
            "contentText", "contentFormat"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'markdown')
        `).run(noteId, userId, targetNotebookId, notebook.workspaceId, title, content, baseContent);
      }

      getDb().prepare(`
        INSERT INTO attachments (
          id, "userId", "noteId", filename, "mimeType", size, path,
          "workspaceId", hash, "uploadSource"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'folder_sync')
      `).run(attachmentId, userId, noteId, filename, file.type || "application/octet-stream", fileBuffer.length, relativeAttachmentPath, notebook.workspaceId, actualSha);

      if (oldAttachments.length) {
        const placeholders = oldAttachments.map(() => "?").join(",");
        getDb().prepare(`DELETE FROM attachments WHERE id IN (${placeholders})`).run(...oldAttachments.map((item) => item.id));
      }
      if (syncRow) {
        folderSyncFilesRepository.update(syncRow.id, { sha256: sourceSha, relativePath, filename, noteId });
      } else {
        folderSyncFilesRepository.create({ id: uuid(), userId, sourcePathHash, relativePath, filename, sha256: sourceSha, noteId });
      }
    });
    transaction();
  } catch (error) {
    try { fs.unlinkSync(fullPath); } catch { /* best effort */ }
    throw error;
  }

  for (const previous of oldAttachments) safeRemoveAttachmentFile(previous.path);
  broadcastChanged(noteId, userId, title, baseContent);

  let extracted = false;
  let extractedChars = 0;
  let extractionTruncated = false;
  let extractionError: string | undefined;
  let noText = false;
  if (shouldExtractText) {
    try {
      const result = await extractAttachmentText({
        id: attachmentId,
        path: relativeAttachmentPath,
        mimeType: file.type || "application/octet-stream",
        filename,
        size: fileBuffer.length,
      });
      if (result.skipReason) {
        noText = result.skipReason === "empty";
        if (!noText) extractionError = result.skipReason.slice(0, 200);
      } else if (result.text?.trim()) {
        const text = result.text.slice(0, EXTRACT_LIMIT);
        extracted = true;
        extractedChars = text.length;
        extractionTruncated = result.text.length > EXTRACT_LIMIT;
        const extractedBlock = `\n\n<!-- nowen-folder-sync-extracted:start -->\n${text}\n<!-- nowen-folder-sync-extracted:end -->`;
        getDb().prepare(`UPDATE notes SET "contentText" = ? WHERE id = ?`).run(`${baseContent}${extractedBlock}`, noteId);
      } else {
        noText = true;
      }
    } catch (error: any) {
      extractionError = String(error?.message || "extraction failed").slice(0, 200);
      console.warn("[folder-sync] attachment extraction failed:", filename, extractionError);
    }
  }

  return c.json({
    success: true,
    created: !note,
    updated: !!note,
    skipped: false,
    noteId,
    attachmentId,
    sha256: sourceSha,
    conflictCopyNoteId,
    extracted,
    extractedChars,
    extractionTruncated,
    extractionError,
    noText,
  });
});

app.post("/source-deleted", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const sourcePathHash = typeof body.sourcePathHash === "string" ? body.sourcePathHash : "";
  const policy = normalizeDeletionPolicy(body.policy);
  if (!isSha256(sourcePathHash)) return c.json({ error: "sourcePathHash 无效", code: "INVALID_HASH" }, 400);

  const syncRow = getSyncRow(userId, sourcePathHash);
  if (!syncRow) return c.json({ success: true, action: policy, noteId: null, mappingRemoved: false });
  const note = getTrackedNote(syncRow.noteId);
  if (note && note.userId !== userId) return c.json({ error: "无权处理该同步笔记", code: "FORBIDDEN" }, 403);
  if (note && !resolveTargetNotebook(note.notebookId, userId)) {
    return c.json({ error: "目标笔记本无写权限", code: "FORBIDDEN" }, 403);
  }

  const transaction = getDb().transaction(() => {
    if (note && policy === "trash") {
      getDb().prepare(`
        UPDATE notes SET "isTrashed" = 1, version = version + 1, "updatedAt" = datetime('now') WHERE id = ?
      `).run(note.id);
    } else if (note && policy === "detach") {
      const content = stripAllSyncMetadata(note.content);
      const contentText = stripAllSyncMetadata(note.contentText);
      getDb().prepare(`
        UPDATE notes
           SET content = ?, "contentText" = ?, version = version + 1,
               "updatedAt" = datetime('now')
         WHERE id = ?
      `).run(content, contentText, note.id);
    }
    folderSyncFilesRepository.delete(syncRow.id);
  });
  transaction();

  if (note && policy !== "keep") {
    broadcastChanged(note.id, userId, note.title, policy === "detach" ? stripAllSyncMetadata(note.contentText) : note.contentText);
  }
  return c.json({ success: true, action: policy, noteId: note?.id || null, mappingRemoved: true });
});

app.post("/check-dedup", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const body = await c.req.json().catch(() => ({})) as { sourcePathHashes?: unknown };
  const hashes = Array.isArray(body.sourcePathHashes)
    ? body.sourcePathHashes.filter(isSha256).slice(0, 500)
    : [];
  if (!hashes.length) return c.json({});
  return c.json(folderSyncFilesRepository.batchGetNoteIds(userId, hashes));
});

export const folderSyncInternals = {
  stripSyncComment,
  stripAllSyncMetadata,
  extractManagedContentHash,
  buildManagedContent,
  hasManualConflict,
  normalizeConflictPolicy,
  normalizeDeletionPolicy,
};

export default app;
