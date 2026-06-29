/**
 * Share Comments Repository
 *
 * 职责：
 * - 封装 share_comments 表的数据库操作
 * - 提供类型安全的接口
 * - 保持现有 SQLite 行为不变
 */

import { getDb } from "../db/schema";

export const shareCommentsRepository = {
  /**
   * 获取评论详情（用于权限校验）。
   *
   * @param commentId 评论 ID
   * @returns 评论记录，或 undefined
   */
  getById(commentId: string): { id: string; userId: string | null } | undefined {
    const db = getDb();
    return db
      .prepare("SELECT id, userId FROM share_comments WHERE id = ?")
      .get(commentId) as { id: string; userId: string | null } | undefined;
  },

  /**
   * 获取评论的解决状态。
   *
   * @param commentId 评论 ID
   * @returns 评论记录，或 undefined
   */
  getResolved(commentId: string): { isResolved: number } | undefined {
    const db = getDb();
    return db
      .prepare("SELECT isResolved FROM share_comments WHERE id = ?")
      .get(commentId) as { isResolved: number } | undefined;
  },

  /**
   * 更新评论的解决状态。
   *
   * @param commentId 评论 ID
   * @param isResolved 是否解决
   */
  updateResolved(commentId: string, isResolved: number): void {
    const db = getDb();
    db.prepare("UPDATE share_comments SET isResolved = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(isResolved, commentId);
  },

  /**
   * 删除评论。
   *
   * @param commentId 评论 ID
   */
  delete(commentId: string): void {
    const db = getDb();
    db.prepare("DELETE FROM share_comments WHERE id = ?").run(commentId);
  },
};
