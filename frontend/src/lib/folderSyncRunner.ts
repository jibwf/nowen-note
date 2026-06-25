/**
 * folderSyncRunner — 文件夹同步执行器（renderer 侧）
 *
 * 抽离 FolderSyncSettings 的扫描+上传逻辑，供手动同步和自动调度共用。
 * 采用方案 A：Electron 负责扫描/读文件，renderer 带 token 上传。
 */

import { api } from "@/lib/api";
import type { FolderSyncScanResult } from "@/lib/desktopBridge";

export interface SyncRunOptions {
  /** 静默模式：不弹 toast，自动同步用 */
  silent?: boolean;
  /** 触发原因，写入日志 */
  reason?: "manual" | "auto";
}

export interface SyncRunResult {
  ok: boolean;
  folderId: string;
  scanResult: FolderSyncScanResult | null;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
}

function getFolderSync() {
  return (window as any).nowenDesktop?.folderSync as import("@/lib/desktopBridge").FolderSyncAPI | undefined;
}

/**
 * 执行一次文件夹同步（扫描 + 上传）。
 * 不管手动还是自动，都走这个函数。
 */
export async function runFolderSyncOnce(folderId: string, options: SyncRunOptions = {}): Promise<SyncRunResult> {
  const { silent = false, reason = "manual" } = options;
  const fs = getFolderSync();
  if (!fs) return { ok: false, folderId, scanResult: null, imported: 0, updated: 0, skipped: 0, failed: 0, error: "Not desktop" };

  // 写日志：开始
  try { await fs.appendLog(folderId, `${reason}_sync_started`, `Sync started (${reason})`); } catch { /* ignore */ }

  // Step 1: 本地扫描
  const scanResult = await fs.runNow(folderId);
  if (!scanResult.ok) {
    const errMsg = scanResult.message || "Scan failed";
    try { await fs.appendLog(folderId, `${reason}_sync_failed`, `Scan failed: ${errMsg}`); } catch { /* ignore */ }
    return { ok: false, folderId, scanResult, imported: 0, updated: 0, skipped: 0, failed: 0, error: errMsg };
  }

  // Step 2: 获取待上传文件
  const pendingResult = await fs.getPendingUploads(folderId);
  if (!pendingResult.ok) {
    const errMsg = pendingResult.error || "Failed to get pending uploads";
    try { await fs.appendLog(folderId, `${reason}_sync_failed`, `Pending uploads failed: ${errMsg}`); } catch { /* ignore */ }
    return { ok: false, folderId, scanResult, imported: 0, updated: 0, skipped: 0, failed: 0, error: errMsg };
  }

  const targetNotebookId = pendingResult.config.targetNotebookId;
  if (!targetNotebookId) {
    // 没有目标笔记本，只扫描不上传
    try { await fs.appendLog(folderId, `${reason}_sync_skipped`, `No target notebook, scan only`); } catch { /* ignore */ }
    return { ok: true, folderId, scanResult, imported: 0, updated: 0, skipped: 0, failed: 0 };
  }

  // Step 3: 逐个上传
  let imported = 0, updated = 0, uploadSkipped = 0, uploadFailed = 0;

  for (const candidate of pendingResult.pending) {
    if (candidate.skipReason || !candidate.contentText) {
      await fs.markUploadResult(folderId, candidate.relativePath, { success: false, skipped: true, error: candidate.skipReason || "No content" });
      uploadSkipped++;
      continue;
    }
    try {
      const res = await api.folderSync.importFile({
        filename: candidate.filename,
        relativePath: candidate.relativePath,
        sha256: candidate.sha256,
        targetNotebookId,
        contentText: candidate.contentText,
        sourcePathHash: candidate.sourcePathHash,
        existingNoteId: candidate.existingNoteId || undefined,
      });
      if (res.skipped) {
        await fs.markUploadResult(folderId, candidate.relativePath, { success: true, noteId: res.noteId, skipped: true });
        uploadSkipped++;
      } else if (res.success) {
        await fs.markUploadResult(folderId, candidate.relativePath, { success: true, noteId: res.noteId });
        if (res.created) imported++;
        else if (res.updated) updated++;
      } else {
        await fs.markUploadResult(folderId, candidate.relativePath, { success: false, error: "Import failed" });
        uploadFailed++;
      }
    } catch (e: any) {
      await fs.markUploadResult(folderId, candidate.relativePath, { success: false, error: e?.message || "Upload error" });
      uploadFailed++;
    }
  }

  // 写日志：完成
  const total = imported + updated + uploadSkipped + uploadFailed;
  try {
    if (uploadFailed > 0) {
      await fs.appendLog(folderId, `${reason}_sync_completed`, `Sync done with errors: +${imported} ~${updated} skip${uploadSkipped} fail${uploadFailed}`, { imported, updated, skipped: uploadSkipped, failed: uploadFailed });
    } else {
      await fs.appendLog(folderId, `${reason}_sync_completed`, `Sync done: +${imported} ~${updated} skip${uploadSkipped}`, { imported, updated, skipped: uploadSkipped, failed: 0 });
    }
  } catch { /* ignore */ }

  return { ok: true, folderId, scanResult, imported, updated, skipped: uploadSkipped, failed: uploadFailed };
}
