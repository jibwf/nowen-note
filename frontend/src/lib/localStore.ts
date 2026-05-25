/**
 * localStore — 本地 IndexedDB 缓存层（Phase B 基建）
 * =========================================================================
 *
 * 路径 1（半套 local-first）的核心数据层。负责把"曾经从服务端拉到的元数据 +
 * 按需正文"完整缓存在本地，使应用在断网时仍能浏览和编辑。
 *
 * 设计要点：
 *   1. **按用户隔离**：DB 名 = `nowen-cache-${userId}`，避免多账号串数据。
 *      切换账号时 close 当前 DB，打开新的；登出时不销毁（保留快照便于下次重登）。
 *   2. **schema 版本 1**：四张 store
 *        - notebooks         主键 id；索引 parentId、updatedAt
 *        - notes             主键 id；索引 notebookId、updatedAt、isTrashed
 *                            （正文可能很大，但 IDB 不限大小，按需写入即可）
 *        - tags              主键 id
 *        - meta              主键 key（用来存 lastSyncAt、schemaInitialized 等）
 *   3. **写入语义**：所有 putXxx() 都是 upsert；deleteXxx() 是 hard delete。
 *      tombstone 由 syncEngine 处理（这里只关心当前可见数据）。
 *   4. **零业务逻辑**：本文件只做 CRUD + 简单 query，不做合并、不调 API。
 *      合并 / 拉取 / 推送都是 syncEngine 的事。
 *   5. **错误吞掉**：底层 IDB 失败时打 warn 但不抛 —— 缓存失败不该影响主流程，
 *      最坏情况就是退化回"每次都打网络"。
 *
 * 不做：
 *   - 不缓存附件二进制（量大，未来用 Cache API 单独管）
 *   - 不缓存协作 doc / Yjs 状态（已有 y-indexeddb）
 *   - 不缓存搜索索引（先用全表 LIKE 兜底）
 */

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { Note, NoteListItem, Notebook, Tag } from "@/types";

// ─── Schema ────────────────────────────────────────────────────────────────────

interface NowenCacheSchema extends DBSchema {
  notebooks: {
    key: string;
    value: Notebook;
    indexes: {
      "by-parent": string;
      "by-updated": string;
    };
  };
  notes: {
    key: string;
    value: Note;
    indexes: {
      "by-notebook": string;
      "by-updated": string;
      "by-trashed": number;
    };
  };
  tags: {
    key: string;
    value: Tag;
  };
  meta: {
    key: string;
    value: {
      key: string;
      value: unknown;
      updatedAt: number;
    };
  };
}

const DB_NAME_PREFIX = "nowen-cache-";
const DB_VERSION = 1;

// ─── 单例连接管理 ──────────────────────────────────────────────────────────────

let currentUserId: string | null = null;
let dbPromise: Promise<IDBPDatabase<NowenCacheSchema>> | null = null;

function getDbName(userId: string): string {
  // 用户 ID 已是 UUID/纯字符串，但仍做最简单的兜底
  return `${DB_NAME_PREFIX}${userId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/**
 * 切换或初始化当前用户的 IDB 连接。每次登录后调一次（或登录态变更时）。
 * 同 userId 重复调用是 no-op；不同 userId 会关掉旧连接。
 */
export function setCurrentUser(userId: string | null): void {
  if (currentUserId === userId) return;
  // 关旧连接
  if (dbPromise) {
    dbPromise.then((db) => {
      try { db.close(); } catch { /* ignore */ }
    }).catch(() => { /* ignore */ });
    dbPromise = null;
  }
  currentUserId = userId;
}

function getDb(): Promise<IDBPDatabase<NowenCacheSchema>> | null {
  if (!currentUserId) return null;
  if (!dbPromise) {
    dbPromise = openDB<NowenCacheSchema>(getDbName(currentUserId), DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notebooks")) {
          const s = db.createObjectStore("notebooks", { keyPath: "id" });
          s.createIndex("by-parent", "parentId");
          s.createIndex("by-updated", "updatedAt");
        }
        if (!db.objectStoreNames.contains("notes")) {
          const s = db.createObjectStore("notes", { keyPath: "id" });
          s.createIndex("by-notebook", "notebookId");
          s.createIndex("by-updated", "updatedAt");
          s.createIndex("by-trashed", "isTrashed");
        }
        if (!db.objectStoreNames.contains("tags")) {
          db.createObjectStore("tags", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
      blocked() {
        console.warn("[localStore] db blocked by another tab/version");
      },
      blocking() {
        console.warn("[localStore] db blocking newer version, will close");
      },
    }).catch((e) => {
      console.warn("[localStore] openDB failed:", e);
      throw e;
    });
  }
  return dbPromise;
}

// 内部小工具：吞错执行
async function safe<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try { return await fn(); }
  catch (e) {
    console.warn(`[localStore] ${label} failed:`, e);
    return fallback;
  }
}

// ─── Notebooks ─────────────────────────────────────────────────────────────────

export async function putNotebooks(notebooks: Notebook[]): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    const tx = db.transaction("notebooks", "readwrite");
    await Promise.all(notebooks.map((nb) => tx.store.put(nb)));
    await tx.done;
  }, undefined, "putNotebooks");
}

export async function getAllNotebooks(): Promise<Notebook[]> {
  const p = getDb();
  if (!p) return [];
  return safe(async () => {
    const db = await p;
    return db.getAll("notebooks");
  }, [], "getAllNotebooks");
}

export async function deleteNotebook(id: string): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    await db.delete("notebooks", id);
  }, undefined, "deleteNotebook");
}

// ─── Notes ─────────────────────────────────────────────────────────────────────

export async function putNote(note: Note): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    await db.put("notes", note);
  }, undefined, "putNote");
}

/**
 * 批量写入"列表项"（轻量字段）。
 * 列表接口返回的是 NoteListItem（不含 content），但我们存储为 Note 形态，
 * content/contentText 用空串占位，等用户打开某篇时再 putNote 覆盖完整正文。
 */
export async function putNoteListItems(items: NoteListItem[]): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    const tx = db.transaction("notes", "readwrite");
    for (const it of items) {
      const existing = await tx.store.get(it.id);
      // 已经有完整正文且版本相同 → 不要被列表项覆盖丢正文；否则 upsert
      if (existing && existing.version === it.version && existing.content) {
        // 保留正文，但同步元数据字段（pinned/favorite/title 可能在其它端被改）
        const merged: Note = {
          ...existing,
          ...it,
          content: existing.content,
          contentText: existing.contentText,
        };
        await tx.store.put(merged);
      } else {
        // NoteListItem 不含 content/trashedAt/sortOrder，需要补上 Note 必填字段
        const placeholder: Note = {
          ...it,
          content: existing?.content ?? "",
          contentText: existing?.contentText ?? it.contentText ?? "",
          trashedAt: existing?.trashedAt ?? null,
          sortOrder: existing?.sortOrder ?? 0,
        };
        await tx.store.put(placeholder);
      }
    }
    await tx.done;
  }, undefined, "putNoteListItems");
}

export async function getNote(id: string): Promise<Note | undefined> {
  const p = getDb();
  if (!p) return undefined;
  return safe(async () => {
    const db = await p;
    return db.get("notes", id);
  }, undefined, "getNote");
}

export async function getAllNotes(): Promise<Note[]> {
  const p = getDb();
  if (!p) return [];
  return safe(async () => {
    const db = await p;
    return db.getAll("notes");
  }, [], "getAllNotes");
}

export async function getNotesByNotebook(notebookId: string): Promise<Note[]> {
  const p = getDb();
  if (!p) return [];
  return safe(async () => {
    const db = await p;
    return db.getAllFromIndex("notes", "by-notebook", notebookId);
  }, [], "getNotesByNotebook");
}

export async function deleteNote(id: string): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    await db.delete("notes", id);
  }, undefined, "deleteNote");
}

// ─── Tags ──────────────────────────────────────────────────────────────────────

export async function putTags(tags: Tag[]): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    const tx = db.transaction("tags", "readwrite");
    await Promise.all(tags.map((t) => tx.store.put(t)));
    await tx.done;
  }, undefined, "putTags");
}

export async function getAllTags(): Promise<Tag[]> {
  const p = getDb();
  if (!p) return [];
  return safe(async () => {
    const db = await p;
    return db.getAll("tags");
  }, [], "getAllTags");
}

export async function deleteTag(id: string): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    await db.delete("tags", id);
  }, undefined, "deleteTag");
}

// ─── Meta（同步状态 / 标志位） ─────────────────────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    await db.put("meta", { key, value, updatedAt: Date.now() });
  }, undefined, "setMeta");
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const p = getDb();
  if (!p) return undefined;
  return safe(async () => {
    const db = await p;
    const row = await db.get("meta", key);
    return row?.value as T | undefined;
  }, undefined, "getMeta");
}

// ─── 全清（用户登出 / 切账号时调） ─────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  const p = getDb();
  if (!p) return;
  await safe(async () => {
    const db = await p;
    const tx = db.transaction(["notebooks", "notes", "tags", "meta"], "readwrite");
    await Promise.all([
      tx.objectStore("notebooks").clear(),
      tx.objectStore("notes").clear(),
      tx.objectStore("tags").clear(),
      tx.objectStore("meta").clear(),
    ]);
    await tx.done;
  }, undefined, "clearAll");
}

/** 当前是否已绑定用户（用于上层判定是否能用本地缓存） */
export function isReady(): boolean {
  return !!currentUserId;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}
