/**
 * Note Tags Repository
 *
 * 职责：
 * - 封装 note_tags 表的数据库操作
 * - 提供类型安全的接口
 * - 保持现有 SQLite 行为不变
 *
 * 注意：
 * - B1B3 阶段迁移 note_tags 绑定/解绑和笔记详情 tags 返回
 * - routes/notes.ts 标签筛选暂不迁移
 */

import { getDb } from "../db/schema";
import type { Tag } from "./types";

export const noteTagsRepository = {
  /**
   * 给笔记添加标签。
   *
   * 使用 INSERT OR IGNORE 防止重复绑定。
   *
   * @param noteId 笔记 ID
   * @param tagId 标签 ID
   */
  addTagToNote(noteId: string, tagId: string): void {
    const db = getDb();
    db.prepare("INSERT OR IGNORE INTO note_tags (noteId, tagId) VALUES (?, ?)").run(noteId, tagId);
  },

  /**
   * 从笔记移除标签。
   *
   * 移除不存在绑定时不报错。
   *
   * @param noteId 笔记 ID
   * @param tagId 标签 ID
   */
  removeTagFromNote(noteId: string, tagId: string): void {
    const db = getDb();
    db.prepare("DELETE FROM note_tags WHERE noteId = ? AND tagId = ?").run(noteId, tagId);
  },

  /**
   * 获取笔记的所有标签。
   *
   * @param noteId 笔记 ID
   * @returns 标签列表
   */
  listTagsByNoteId(noteId: string): Tag[] {
    const db = getDb();
    return db
      .prepare(
        `
        SELECT t.* FROM tags t
        JOIN note_tags nt ON t.id = nt.tagId
        WHERE nt.noteId = ?
        `,
      )
      .all(noteId) as Tag[];
  },

  /**
   * 按标签筛选笔记 ID 列表。
   *
   * 支持单标签、多标签 OR、多标签 AND 三种模式。
   *
   * @param tagIds 标签 ID 列表
   * @param mode 筛选模式："and"（默认）或 "or"
   * @returns 笔记 ID 列表
   */
  listNoteIdsByTagFilter(tagIds: string[], mode: "and" | "or" = "and"): string[] {
    if (tagIds.length === 0) return [];

    const db = getDb();

    if (mode === "and" && tagIds.length > 1) {
      // AND 逻辑：笔记必须同时拥有所有已选标签
      // 使用 GROUP BY + HAVING COUNT 确保每个 tagId 都命中
      const placeholders = tagIds.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT noteId FROM note_tags
           WHERE tagId IN (${placeholders})
           GROUP BY noteId
           HAVING COUNT(DISTINCT tagId) >= ?`,
        )
        .all(...tagIds, tagIds.length) as { noteId: string }[];
      return rows.map((r) => r.noteId);
    } else {
      // OR 逻辑 或 单标签：只要命中任一标签即可
      const placeholders = tagIds.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT DISTINCT noteId FROM note_tags WHERE tagId IN (${placeholders})`,
        )
        .all(...tagIds) as { noteId: string }[];
      return rows.map((r) => r.noteId);
    }
  },
};
