/**
 * Folder Sync Files Repository
 *
 * 职责：
 * - 封装 folder_sync_files 表的数据库操作
 * - 提供类型安全的接口
 * - 保持现有 SQLite 行为不变
 */

import { getDb } from "../db/schema";

/** folder_sync_files 记录 */
export interface FolderSyncFileRecord {
  id: string;
  userId: string;
  sourcePathHash: string;
  relativePath: string;
  filename: string;
  sha256: string;
  noteId: string;
  createdAt: string;
  updatedAt: string;
}

export const folderSyncFilesRepository = {
  /**
   * 根据 sourcePathHash 查询同步记录。
   *
   * @param userId 用户 ID
   * @param sourcePathHash 源路径哈希
   * @returns 同步记录，或 undefined
   */
  getBySourcePathHash(userId: string, sourcePathHash: string): { id: string; noteId: string; oldSha: string } | undefined {
    const db = getDb();
    return db
      .prepare("SELECT id, noteId, sha256 AS oldSha FROM folder_sync_files WHERE userId = ? AND sourcePathHash = ?")
      .get(userId, sourcePathHash) as { id: string; noteId: string; oldSha: string } | undefined;
  },

  /**
   * 创建同步记录。
   *
   * @param input 同步记录数据
   */
  create(input: {
    id: string;
    userId: string;
    sourcePathHash: string;
    relativePath: string;
    filename: string;
    sha256: string;
    noteId: string;
  }): void {
    const db = getDb();
    db.prepare(
      "INSERT INTO folder_sync_files (id, userId, sourcePathHash, relativePath, filename, sha256, noteId) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(input.id, input.userId, input.sourcePathHash, input.relativePath, input.filename, input.sha256, input.noteId);
  },

  /**
   * 更新同步记录。
   *
   * @param recordId 记录 ID
   * @param input 更新数据
   */
  update(recordId: string, input: {
    sha256: string;
    relativePath: string;
    filename: string;
    noteId?: string;
  }): void {
    const db = getDb();
    if (input.noteId !== undefined) {
      db.prepare(
        "UPDATE folder_sync_files SET sha256 = ?, relativePath = ?, filename = ?, noteId = ?, updatedAt = datetime('now') WHERE id = ?"
      ).run(input.sha256, input.relativePath, input.filename, input.noteId, recordId);
    } else {
      db.prepare(
        "UPDATE folder_sync_files SET sha256 = ?, relativePath = ?, filename = ?, updatedAt = datetime('now') WHERE id = ?"
      ).run(input.sha256, input.relativePath, input.filename, recordId);
    }
  },

  /**
   * 删除同步记录。
   *
   * @param recordId 记录 ID
   */
  delete(recordId: string): void {
    const db = getDb();
    db.prepare("DELETE FROM folder_sync_files WHERE id = ?").run(recordId);
  },

  /**
   * 批量查询 sourcePathHash 对应的 noteId。
   *
   * @param userId 用户 ID
   * @param hashes sourcePathHash 列表
   * @returns sourcePathHash -> noteId 映射
   */
  batchGetNoteIds(userId: string, hashes: string[]): Record<string, string> {
    const db = getDb();
    if (hashes.length === 0) return {};

    const placeholders = hashes.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT sourcePathHash, noteId FROM folder_sync_files WHERE userId = ? AND sourcePathHash IN (${placeholders})`)
      .all(userId, ...hashes) as { sourcePathHash: string; noteId: string }[];

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.sourcePathHash] = row.noteId;
    }
    return result;
  },
};
