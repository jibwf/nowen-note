import { Hono } from "hono";
import { getDb } from "../db/schema";
import { v4 as uuid } from "uuid";
import { attachmentFoldersRepository } from "../repositories";

const app = new Hono();

/**
 * GET /api/attachment-folders
 * 获取当前用户的文件夹列表
 */
app.get("/", (c) => {
  const db = getDb();
  const userId = c.req.header("X-User-Id") || "";

  const folders = attachmentFoldersRepository.listByUser(userId);

  // 统计每个文件夹下的附件数
  const counts = db
    .prepare(
      `SELECT folderId, COUNT(*) AS count
       FROM attachments
       WHERE userId = ? AND folderId IS NOT NULL
       GROUP BY folderId`
    )
    .all(userId) as Array<{ folderId: string; count: number }>;
  const countMap = new Map(counts.map((r) => [r.folderId, r.count]));

  return c.json({
    folders: folders.map((f) => ({
      ...f,
      fileCount: countMap.get(f.id) || 0,
    })),
  });
});

/**
 * POST /api/attachment-folders
 * 创建文件夹
 */
app.post("/", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const body = await c.req.json();
  const name = (body.name || "").trim();
  const parentId = body.parentId || null;

  if (!name) return c.json({ error: "文件夹名称不能为空" }, 400);
  if (name.length > 100) return c.json({ error: "文件夹名称过长" }, 400);

  // 同级同名校验
  if (attachmentFoldersRepository.existsByName(userId, name, parentId)) {
    return c.json({ error: "同级已存在同名文件夹" }, 409);
  }

  // 如果有 parentId，校验父文件夹存在且属于当前用户
  if (parentId) {
    if (!attachmentFoldersRepository.parentExists(parentId, userId)) {
      return c.json({ error: "父文件夹不存在" }, 404);
    }
  }

  const id = uuid();
  attachmentFoldersRepository.create({ id, userId, name, parentId });

  return c.json({
    id,
    name,
    parentId,
    fileCount: 0,
  }, 201);
});

/**
 * PATCH /api/attachment-folders/:id
 * 重命名文件夹
 */
app.patch("/:id", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const id = c.req.param("id");
  const body = await c.req.json();
  const name = (body.name || "").trim();

  if (!name) return c.json({ error: "文件夹名称不能为空" }, 400);
  if (name.length > 100) return c.json({ error: "文件夹名称过长" }, 400);

  const folder = attachmentFoldersRepository.getById(id, userId);
  if (!folder) return c.json({ error: "文件夹不存在" }, 404);

  // 同级同名校验（排除自身）
  if (attachmentFoldersRepository.existsByName(userId, name, folder.parentId, id)) {
    return c.json({ error: "同级已存在同名文件夹" }, 409);
  }

  attachmentFoldersRepository.updateName(id, name);

  return c.json({ id, name, parentId: folder.parentId });
});

/**
 * DELETE /api/attachment-folders/:id
 * 删除文件夹，文件夹内附件的 folderId 置为 NULL（归入未归档）
 */
app.delete("/:id", (c) => {
  const db = getDb();
  const userId = c.req.header("X-User-Id") || "";
  const id = c.req.param("id");

  const folder = attachmentFoldersRepository.getById(id, userId);
  if (!folder) return c.json({ error: "文件夹不存在" }, 404);

  // 把该文件夹内附件的 folderId 清空
  db.prepare("UPDATE attachments SET folderId = NULL WHERE folderId = ? AND userId = ?")
    .run(id, userId);

  attachmentFoldersRepository.delete(id);

  return c.json({ success: true });
});

export default app;
