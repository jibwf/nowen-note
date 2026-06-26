/**
 * 今日日记路由
 * ---------------------------------------------------------------------------
 * 提供"一键创建今日日记"功能。
 *
 * 接口：
 *   GET  /api/journals/today   获取或创建今日日记
 *   GET  /api/journals/check   检查今日日记是否存在
 *
 * 设计决策：
 *   - 使用 note_type = 'journal' 区分日记和普通笔记
 *   - journal_date 使用 YYYY-MM-DD 格式，按用户本地日期
 *   - 唯一性通过查询保证（userId + journal_date + note_type = journal）
 *   - 标题默认使用日期格式 "2026-06-26"
 */

import { Hono } from "hono";
import { getDb } from "../db/schema";
import { v4 as uuid } from "uuid";

const app = new Hono();

/**
 * 获取本地日期字符串（YYYY-MM-DD 格式）
 *
 * 重要：不使用 toISOString().slice(0, 10)，因为这会返回 UTC 日期，
 * 在 UTC+8 时区晚上/凌晨会生成前一天的日期。
 *
 * @param date 可选日期对象，默认当前时间
 * @returns YYYY-MM-DD 格式的本地日期字符串
 */
function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 获取或创建今日日记
 *
 * 逻辑：
 * 1. 计算用户本地日期（YYYY-MM-DD）
 * 2. 查询是否已有今日日记
 * 3. 如果存在，返回已有日记
 * 4. 如果不存在，创建新日记并返回
 *
 * 并发安全：使用 UNIQUE 约束或查询+插入的事务保证
 */
app.get("/today", async (c) => {
  const db = getDb();
  const userId = c.req.header("X-User-Id") || "";

  if (!userId) {
    return c.json({ error: "未授权" }, 401);
  }

  const today = getLocalDateKey();

  // 查询是否已有今日日记
  const existing = db.prepare(`
    SELECT id, userId, notebookId, workspaceId, title, content, contentText,
           isPinned, isLocked, isArchived, isTrashed, version, sortOrder,
           createdAt, updatedAt, trashedAt, contentFormat, note_type, journal_date
    FROM notes
    WHERE userId = ? AND note_type = 'journal' AND journal_date = ?
      AND isTrashed = 0
  `).get(userId, today) as any;

  if (existing) {
    // 已存在，返回
    return c.json({
      ...existing,
      isNew: false,
    });
  }

  // 不存在，创建新日记
  const id = uuid();
  const title = today; // 标题使用日期格式 "2026-06-26"

  // 查找用户的默认笔记本（个人空间）
  const defaultNotebook = db.prepare(`
    SELECT id FROM notebooks
    WHERE userId = ? AND workspaceId IS NULL AND isDeleted = 0
    ORDER BY sortOrder ASC, createdAt ASC
    LIMIT 1
  `).get(userId) as { id: string } | undefined;

  if (!defaultNotebook) {
    return c.json({ error: "请先创建一个笔记本" }, 400);
  }

  try {
    db.prepare(`
      INSERT INTO notes (id, userId, notebookId, title, content, contentText, note_type, journal_date)
      VALUES (?, ?, ?, ?, '{}', '', 'journal', ?)
    `).run(id, userId, defaultNotebook.id, title, today);

    const created = db.prepare(`
      SELECT id, userId, notebookId, workspaceId, title, content, contentText,
             isPinned, isLocked, isArchived, isTrashed, version, sortOrder,
             createdAt, updatedAt, trashedAt, contentFormat, note_type, journal_date
      FROM notes
      WHERE id = ?
    `).get(id);

    return c.json({
      ...created as any,
      isNew: true,
    }, 201);
  } catch (err: any) {
    // 并发创建时可能触发唯一约束冲突
    if (String(err?.code || "").startsWith("SQLITE_CONSTRAINT")) {
      // 冲突时重新查询
      const retry = db.prepare(`
        SELECT id, userId, notebookId, workspaceId, title, content, contentText,
               isPinned, isLocked, isArchived, isTrashed, version, sortOrder,
               createdAt, updatedAt, trashedAt, contentFormat, note_type, journal_date
        FROM notes
        WHERE userId = ? AND note_type = 'journal' AND journal_date = ?
          AND isTrashed = 0
      `).get(userId, today);

      return c.json({
        ...retry as any,
        isNew: false,
      });
    }
    throw err;
  }
});

/**
 * 检查今日日记是否存在（轻量接口，不创建）
 */
app.get("/check", (c) => {
  const db = getDb();
  const userId = c.req.header("X-User-Id") || "";

  if (!userId) {
    return c.json({ error: "未授权" }, 401);
  }

  const today = getLocalDateKey();

  const existing = db.prepare(`
    SELECT id, title
    FROM notes
    WHERE userId = ? AND note_type = 'journal' AND journal_date = ?
      AND isTrashed = 0
  `).get(userId, today) as { id: string; title: string } | undefined;

  return c.json({
    exists: !!existing,
    noteId: existing?.id || null,
    title: existing?.title || null,
  });
});

/**
 * 获取日记列表（按日期倒序）
 */
app.get("/list", (c) => {
  const db = getDb();
  const userId = c.req.header("X-User-Id") || "";
  const limit = Math.min(parseInt(c.req.query("limit") || "30"), 100);
  const cursor = c.req.query("cursor"); // 上次最后一条的 journal_date

  if (!userId) {
    return c.json({ error: "未授权" }, 401);
  }

  let query = `
    SELECT id, userId, notebookId, workspaceId, title, content, contentText,
           isPinned, isLocked, isArchived, isTrashed, version, sortOrder,
           createdAt, updatedAt, trashedAt, contentFormat, note_type, journal_date
    FROM notes
    WHERE userId = ? AND note_type = 'journal' AND isTrashed = 0
  `;
  const params: any[] = [userId];

  if (cursor) {
    query += " AND journal_date < ?";
    params.push(cursor);
  }

  query += " ORDER BY journal_date DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];
  const hasMore = rows.length === limit;
  const nextCursor = rows.length > 0 ? rows[rows.length - 1].journal_date : null;

  return c.json({
    items: rows,
    hasMore,
    nextCursor,
  });
});

export default app;
