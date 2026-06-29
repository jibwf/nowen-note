/**
 * Attachment Chunks Repository
 *
 * 职责：
 * - 封装 attachment_chunks 表的数据库操作
 * - 提供类型安全的接口
 * - 保持现有 SQLite 行为不变
 */

import { getDb } from "../db/schema";

export const attachmentChunksRepository = {
  /**
   * 删除附件的所有分块。
   *
   * @param attachmentId 附件 ID
   */
  deleteByAttachmentId(attachmentId: string): void {
    const db = getDb();
    db.prepare("DELETE FROM attachment_chunks WHERE attachmentId = ?").run(attachmentId);
  },

  /**
   * 创建附件分块。
   *
   * @param attachmentId 附件 ID
   * @param chunkIndex 分块索引
   * @param chunkText 分块文本
   */
  create(attachmentId: string, chunkIndex: number, chunkText: string): void {
    const db = getDb();
    db.prepare(
      "INSERT INTO attachment_chunks (attachmentId, chunkIndex, chunkText, createdAt) VALUES (?, ?, ?, datetime('now'))"
    ).run(attachmentId, chunkIndex, chunkText);
  },

  /**
   * 批量删除附件分块（根据附件 ID 列表）。
   *
   * @param attachmentIds 附件 ID 列表
   */
  deleteByAttachmentIds(attachmentIds: string[]): void {
    if (attachmentIds.length === 0) return;
    const db = getDb();
    const placeholders = attachmentIds.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM attachment_chunks WHERE attachmentId IN (${placeholders})`
    ).run(...attachmentIds);
  },

  /**
   * 根据附件查询条件删除分块。
   *
   * @param whereClause WHERE 子句（不含 WHERE 关键字）
   * @param params 参数
   */
  deleteByAttachmentWhere(whereClause: string, params: any[]): void {
    const db = getDb();
    db.prepare(
      `DELETE FROM attachment_chunks WHERE attachmentId IN (SELECT id FROM attachments ${whereClause})`
    ).run(...params);
  },
};
