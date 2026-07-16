from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, got {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: regex expected one match, got {count}: {pattern[:140]!r}")
    write(path, next_text)


def insert_before(path: str, marker: str, content: str) -> None:
    replace_once(path, marker, content + marker)


# ---------------------------------------------------------------------------
# Shared frontend helpers: stable per-tab visit session + correct public web URL.
# ---------------------------------------------------------------------------
write(
    "frontend/src/lib/shareSession.ts",
    r'''const SHARE_SESSION_KEY = "nowen-share-session-v1";

function randomSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A tab-scoped anonymous visit identifier. It is never sent outside Nowen's
 * `/api/shared/*` endpoints and contains no account or device information.
 */
export function getShareSessionId(): string {
  if (typeof window === "undefined") return "server-render";
  try {
    const existing = window.sessionStorage.getItem(SHARE_SESSION_KEY);
    if (existing) return existing;
    const created = randomSessionId();
    window.sessionStorage.setItem(SHARE_SESSION_KEY, created);
    return created;
  } catch {
    const state = window as typeof window & { __nowenShareSessionId?: string };
    if (!state.__nowenShareSessionId) state.__nowenShareSessionId = randomSessionId();
    return state.__nowenShareSessionId;
  }
}

export function withShareSessionHeader(headers?: HeadersInit): Headers {
  const next = new Headers(headers || {});
  next.set("X-Share-Session", getShareSessionId());
  return next;
}
''',
)

write(
    "frontend/src/lib/publicWebOrigin.ts",
    r'''export function normalizePublicWebOrigin(value: string | null | undefined): string {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** Public SPA origin is independent from the API server origin. */
export function getPublicWebOrigin(): string {
  const configured = normalizePublicWebOrigin(
    import.meta.env.VITE_PUBLIC_WEB_ORIGIN || import.meta.env.VITE_APP_PUBLIC_URL,
  );
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const current = normalizePublicWebOrigin(window.location.origin);
    if (current) return current;
  }
  return "";
}

export function buildPublicWebUrl(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const origin = getPublicWebOrigin();
  return origin ? `${origin}${path}` : path;
}
''',
)

# API direct public-share calls must carry the stable tab session.
replace_once(
    "frontend/src/lib/api.impl.ts",
    'import { normalizeServerBaseUrl as _normalizeBase } from "@/lib/serverUrl";\n',
    'import { normalizeServerBaseUrl as _normalizeBase } from "@/lib/serverUrl";\n'
    'import { withShareSessionHeader } from "@/lib/shareSession";\n',
)
replace_once(
    "frontend/src/lib/api.impl.ts",
    'updateShare: (id: string, data: Partial<{ permission: string; password: string; expiresAt: string; maxViews: number; isActive: number }>) =>',
    'updateShare: (id: string, data: Partial<{ permission: string; password: string | null; expiresAt: string | null; maxViews: number | null; isActive: number; resetViews: boolean; rotateToken: boolean }>) =>',
)
replace_once(
    "frontend/src/lib/api.impl.ts",
    'createNotebookShareLink: (id: string, data?: { role?: "editor" | "viewer"; expiresAt?: string | null }) =>',
    'createNotebookShareLink: (id: string, data?: { role?: "editor" | "viewer"; expiresAt?: string | null; maxUses?: number | null }) =>',
)
replace_once(
    "frontend/src/lib/api.impl.ts",
    'data: { role?: "editor" | "viewer"; expiresAt?: string | null; enabled?: boolean },',
    'data: { role?: "editor" | "viewer"; expiresAt?: string | null; enabled?: boolean; maxUses?: number | null; resetUses?: boolean; rotateToken?: boolean },',
)
replace_once(
    "frontend/src/lib/api.impl.ts",
    '      createdAt: string;\n      name: string;',
    '      createdAt: string;\n      maxUses: number | null;\n      useCount: number;\n      name: string;',
)
# Replace the complete public single-share API block with session-aware headers.
replace_regex(
    "frontend/src/lib/api.impl.ts",
    r'''  // Shared \(公开访问，无需 JWT\).*?  // AI\n''',
    r'''  // Shared (公开访问，无需 JWT)
  getShareInfo: async (token: string): Promise<ShareInfo> => {
    const res = await fetch(`${getBaseUrl()}/shared/${token}`, {
      headers: withShareSessionHeader(),
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `请求失败: ${res.status}`);
    }
    return res.json();
  },
  verifySharePassword: async (token: string, password: string): Promise<{ success: boolean; accessToken: string }> => {
    const res = await fetch(`${getBaseUrl()}/shared/${token}/verify`, {
      method: "POST",
      headers: withShareSessionHeader({ "Content-Type": "application/json" }),
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `请求失败: ${res.status}`);
    }
    return res.json();
  },
  getSharedContent: async (token: string, accessToken?: string): Promise<SharedNoteContent> => {
    const headers = withShareSessionHeader(accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined);
    const res = await fetch(`${getBaseUrl()}/shared/${token}/content`, { headers, cache: "no-store" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `请求失败: ${res.status}`);
    }
    return res.json();
  },

  updateSharedContent: async (
    token: string,
    data: { title?: string; content: string; contentText: string; contentFormat?: string | null; version?: number; guestName: string },
    accessToken?: string,
  ): Promise<{ success: true; noteId: string; title: string; contentFormat?: string | null; version: number; updatedAt: string; guestName: string }> => {
    const headers = withShareSessionHeader({
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    });
    const res = await fetch(`${getBaseUrl()}/shared/${token}/content`, {
      method: "PUT", headers, body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const error = new Error(err.error || `请求失败: ${res.status}`) as Error & { code?: string; currentVersion?: number; status?: number };
      error.code = err.code;
      error.currentVersion = err.currentVersion;
      error.status = res.status;
      throw error;
    }
    return res.json();
  },

  pollSharedNote: async (token: string, accessToken?: string): Promise<{ version: number; updatedAt: string }> => {
    const headers = withShareSessionHeader(accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined);
    const res = await fetch(`${getBaseUrl()}/shared/${token}/poll`, { headers, cache: "no-store" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `请求失败: ${res.status}`);
    }
    return res.json();
  },

  getSharedComments: async (token: string, accessToken?: string): Promise<ShareComment[]> => {
    const headers = withShareSessionHeader(accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined);
    const res = await fetch(`${getBaseUrl()}/shared/${token}/comments`, { headers, cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  },
  addSharedComment: async (token: string, data: { content: string; parentId?: string; guestName?: string }, accessToken?: string): Promise<ShareComment> => {
    const headers = withShareSessionHeader({
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    });
    const res = await fetch(`${getBaseUrl()}/shared/${token}/comments`, {
      method: "POST", headers, body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `请求失败: ${res.status}`);
    }
    return res.json();
  },

  // AI
''',
)

# Attachment access exchange forwards the same anonymous session ID.
replace_once(
    "frontend/src/lib/noteAttachmentAccessBridge.ts",
    'import { toast } from "@/lib/toast";\n',
    'import { toast } from "@/lib/toast";\nimport { getShareSessionId } from "@/lib/shareSession";\n',
)
replace_once(
    "frontend/src/lib/noteAttachmentAccessBridge.ts",
    '''  const requestedWith = source.get("X-Requested-With");\n  if (requestedWith) headers.set("X-Requested-With", requestedWith);\n  return headers;''',
    '''  const requestedWith = source.get("X-Requested-With");\n  if (requestedWith) headers.set("X-Requested-With", requestedWith);\n  const shareSession = source.get("X-Share-Session");\n  if (shareSession) headers.set("X-Share-Session", shareSession);\n  return headers;''',
)
replace_once(
    "frontend/src/lib/noteAttachmentAccessBridge.ts",
    '''      const accessUrl = new URL("/api/attachments/share-access", url.origin);\n      accessUrl.searchParams.set("token", decodeURIComponent(shareMatch[1]));\n      await fetchAccessUrls(originalFetch, accessUrl, authHeaders(input, init), credentials);''',
    '''      const accessUrl = new URL("/api/attachments/share-access", url.origin);\n      accessUrl.searchParams.set("token", decodeURIComponent(shareMatch[1]));\n      const headers = authHeaders(input, init);\n      if (!headers.has("X-Share-Session")) headers.set("X-Share-Session", getShareSessionId());\n      await fetchAccessUrls(originalFetch, accessUrl, headers, credentials);''',
)

# Types now expose member/link provenance and usage.
replace_once(
    "frontend/src/types/index.ts",
    '''  status: NotebookMemberStatus;\n  invitedBy: string | null;''',
    '''  status: NotebookMemberStatus;\n  allowDownload?: number | boolean;\n  allowReshare?: number | boolean;\n  source?: "manual" | "invite_link" | "publication";\n  sourceId?: string | null;\n  invitedBy: string | null;''',
)
replace_once(
    "frontend/src/types/index.ts",
    '''  expiresAt: string | null;\n  createdBy: string;''',
    '''  expiresAt: string | null;\n  maxUses: number | null;\n  useCount: number;\n  createdBy: string;''',
)

# ---------------------------------------------------------------------------
# Notebook invite lifecycle: max uses, usage count, source-aware revoke.
# ---------------------------------------------------------------------------
replace_once(
    "backend/src/db/schema.ts",
    '''      enabled INTEGER NOT NULL DEFAULT 1,\n      expiresAt TEXT,\n      createdBy TEXT NOT NULL,''',
    '''      enabled INTEGER NOT NULL DEFAULT 1,\n      expiresAt TEXT,\n      maxUses INTEGER,\n      useCount INTEGER NOT NULL DEFAULT 0,\n      createdBy TEXT NOT NULL,''',
)
replace_once(
    "backend/src/db/postgres/schema.base.sql",
    '''    enabled BOOLEAN NOT NULL DEFAULT true,\n    "expiresAt" TIMESTAMPTZ,\n    "createdBy" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,''',
    '''    enabled BOOLEAN NOT NULL DEFAULT true,\n    "expiresAt" TIMESTAMPTZ,\n    "maxUses" INTEGER,\n    "useCount" INTEGER NOT NULL DEFAULT 0,\n    "createdBy" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,''',
)
insert_before(
    "backend/src/db/migrations.impl.ts",
    "\n];\n\n/** 当前代码已知的最高 schema 版本",
    r'''
  // v51: 登录邀请链接增加人数限制、使用统计与来源生命周期（Issue #308）。
  {
    version: 51,
    name: "notebook-share-link-lifecycle",
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info(notebook_share_links)").all() as { name: string }[];
      if (!columns.some((column) => column.name === "maxUses")) {
        db.prepare("ALTER TABLE notebook_share_links ADD COLUMN maxUses INTEGER").run();
      }
      if (!columns.some((column) => column.name === "useCount")) {
        db.prepare("ALTER TABLE notebook_share_links ADD COLUMN useCount INTEGER NOT NULL DEFAULT 0").run();
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notebook_share_links_usage
          ON notebook_share_links(enabled, expiresAt, useCount, maxUses);
      `);
    },
  },
''',
)

write(
    "backend/src/repositories/notebookShareLinksRepository.ts",
    r'''import { getDb } from "../db/schema";
import { SqliteAdapter } from "../db/adapters";

function getAdapter() {
  return new SqliteAdapter(getDb());
}

export interface NotebookShareLinkRecord {
  id: string;
  notebookId: string;
  token: string;
  role: string;
  enabled: number;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const RECORD_COLUMNS = `id, "notebookId", token, role, enabled, "expiresAt", "maxUses", "useCount", "createdBy", "createdAt", "updatedAt"`;

export const notebookShareLinksRepository = {
  getByTokenWithDetails(token: string): (NotebookShareLinkRecord & {
    name: string; icon: string; color: string | null; ownerUsername: string; ownerDisplayName: string | null;
  }) | undefined {
    return getDb().prepare(`
      SELECT l.id, l."notebookId", l.token, l.role, l.enabled, l."expiresAt", l."maxUses", l."useCount",
             l."createdBy", l."createdAt", l."updatedAt", nb.name, nb.icon, nb.color,
             u.username AS "ownerUsername", u."displayName" AS "ownerDisplayName"
      FROM notebook_share_links l
      JOIN notebooks nb ON nb.id = l."notebookId"
      JOIN users u ON u.id = nb."userId"
      WHERE l.token = ? AND l.enabled = 1 AND nb."isDeleted" = 0
        AND (l."expiresAt" IS NULL OR l."expiresAt" > datetime('now'))
    `).get(token) as any;
  },

  getEnabledByToken(token: string): (NotebookShareLinkRecord & { ownerId: string }) | undefined {
    return getDb().prepare(`
      SELECT l.id, l."notebookId", l.token, l.role, l.enabled, l."expiresAt", l."maxUses", l."useCount",
             l."createdBy", l."createdAt", l."updatedAt", nb."userId" AS "ownerId"
      FROM notebook_share_links l
      JOIN notebooks nb ON nb.id = l."notebookId"
      WHERE l.token = ? AND l.enabled = 1 AND nb."isDeleted" = 0
        AND (l."expiresAt" IS NULL OR l."expiresAt" > datetime('now'))
    `).get(token) as any;
  },

  getLatestEnabledByNotebook(notebookId: string): NotebookShareLinkRecord | undefined {
    return getDb().prepare(`SELECT ${RECORD_COLUMNS} FROM notebook_share_links
      WHERE "notebookId" = ? AND enabled = 1 ORDER BY "createdAt" DESC LIMIT 1`)
      .get(notebookId) as NotebookShareLinkRecord | undefined;
  },

  getById(linkId: string): NotebookShareLinkRecord | undefined {
    return getDb().prepare(`SELECT ${RECORD_COLUMNS} FROM notebook_share_links WHERE id = ?`)
      .get(linkId) as NotebookShareLinkRecord | undefined;
  },

  disableAllByNotebook(notebookId: string): void {
    getDb().prepare(`UPDATE notebook_share_links SET enabled = 0, "updatedAt" = datetime('now')
      WHERE "notebookId" = ? AND enabled = 1`).run(notebookId);
  },

  create(input: {
    id: string; notebookId: string; token: string; role: string; expiresAt: string | null;
    maxUses?: number | null; createdBy: string;
  }): void {
    getDb().prepare(`INSERT INTO notebook_share_links
      (id, "notebookId", token, role, enabled, "expiresAt", "maxUses", "useCount", "createdBy")
      VALUES (?, ?, ?, ?, 1, ?, ?, 0, ?)`)
      .run(input.id, input.notebookId, input.token, input.role, input.expiresAt, input.maxUses ?? null, input.createdBy);
  },

  update(linkId: string, input: {
    token?: string; role?: string; enabled?: number; expiresAt?: string | null;
    maxUses?: number | null; useCount?: number;
  }): void {
    const updates: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => { updates.push(sql); params.push(value); };
    if (input.token !== undefined) add("token = ?", input.token);
    if (input.role !== undefined) add("role = ?", input.role);
    if (input.enabled !== undefined) add("enabled = ?", input.enabled);
    if (input.expiresAt !== undefined) add('"expiresAt" = ?', input.expiresAt);
    if (input.maxUses !== undefined) add('"maxUses" = ?', input.maxUses);
    if (input.useCount !== undefined) add('"useCount" = ?', input.useCount);
    if (!updates.length) return;
    updates.push('"updatedAt" = datetime(\'now\')');
    params.push(linkId);
    getDb().prepare(`UPDATE notebook_share_links SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  },

  async getByTokenWithDetailsAsync(token: string): Promise<any | undefined> {
    return getAdapter().queryOne(`
      SELECT l.id, l."notebookId", l.token, l.role, l.enabled, l."expiresAt", l."maxUses", l."useCount",
             l."createdBy", l."createdAt", l."updatedAt", nb.name, nb.icon, nb.color,
             u.username AS "ownerUsername", u."displayName" AS "ownerDisplayName"
      FROM notebook_share_links l JOIN notebooks nb ON nb.id = l."notebookId"
      JOIN users u ON u.id = nb."userId"
      WHERE l.token = ? AND l.enabled = 1 AND nb."isDeleted" = 0
        AND (l."expiresAt" IS NULL OR l."expiresAt" > datetime('now'))`, [token]);
  },

  async getEnabledByTokenAsync(token: string): Promise<any | undefined> {
    return getAdapter().queryOne(`
      SELECT l.id, l."notebookId", l.token, l.role, l.enabled, l."expiresAt", l."maxUses", l."useCount",
             l."createdBy", l."createdAt", l."updatedAt", nb."userId" AS "ownerId"
      FROM notebook_share_links l JOIN notebooks nb ON nb.id = l."notebookId"
      WHERE l.token = ? AND l.enabled = 1 AND nb."isDeleted" = 0
        AND (l."expiresAt" IS NULL OR l."expiresAt" > datetime('now'))`, [token]);
  },

  async getLatestEnabledByNotebookAsync(notebookId: string): Promise<NotebookShareLinkRecord | undefined> {
    return getAdapter().queryOne<NotebookShareLinkRecord>(`SELECT ${RECORD_COLUMNS} FROM notebook_share_links
      WHERE "notebookId" = ? AND enabled = 1 ORDER BY "createdAt" DESC LIMIT 1`, [notebookId]);
  },

  async disableAllByNotebookAsync(notebookId: string): Promise<void> {
    await getAdapter().execute(`UPDATE notebook_share_links SET enabled = 0, "updatedAt" = datetime('now')
      WHERE "notebookId" = ? AND enabled = 1`, [notebookId]);
  },

  async createAsync(input: {
    id: string; notebookId: string; token: string; role: string; expiresAt: string | null;
    maxUses?: number | null; createdBy: string;
  }): Promise<void> {
    await getAdapter().execute(`INSERT INTO notebook_share_links
      (id, "notebookId", token, role, enabled, "expiresAt", "maxUses", "useCount", "createdBy")
      VALUES (?, ?, ?, ?, 1, ?, ?, 0, ?)`,
      [input.id, input.notebookId, input.token, input.role, input.expiresAt, input.maxUses ?? null, input.createdBy]);
  },
};
''',
)

# Replace notebook link routes as one cohesive lifecycle implementation.
replace_regex(
    "backend/src/routes/notebooks.ts",
    r'''app\.get\("/share/:token",.*?\napp\.get\("/:id/members",''',
    r'''app.get("/share/:token", (c) => {
  const token = c.req.param("token");
  const link = notebookShareLinksRepository.getByTokenWithDetails(token);
  if (!link) return c.json({ error: "share link not found" }, 404);
  if (link.maxUses && link.useCount >= link.maxUses) {
    return c.json({ error: "邀请链接已达到最大加入人数", code: "SHARE_LINK_USE_LIMIT" }, 410);
  }
  return c.json(link);
});

app.post("/share/:token/join", (c) => {
  const db = getDb();
  const userId = c.req.header("X-User-Id") || "";
  const token = c.req.param("token");
  const link = notebookShareLinksRepository.getEnabledByToken(token);
  if (!link) return c.json({ error: "share link not found" }, 404);
  if (link.ownerId === userId) return c.json({ success: true, notebookId: link.notebookId, role: "owner" });

  const role = parseNotebookMemberRole(link.role) || "viewer";
  const result = db.transaction(() => {
    const existing = db.prepare(`SELECT role, status, source, sourceId FROM notebook_members
      WHERE notebookId = ? AND userId = ?`).get(link.notebookId, userId) as
      | { role: string; status: string; source: string; sourceId: string | null }
      | undefined;
    if (existing?.status === "active") {
      return { success: true as const, role: existing.role, counted: false };
    }
    const consumed = db.prepare(`UPDATE notebook_share_links SET useCount = useCount + 1, updatedAt = datetime('now')
      WHERE id = ? AND enabled = 1 AND (maxUses IS NULL OR useCount < maxUses)`).run(link.id);
    if (!consumed.changes) return null;
    notebookMembersRepository.upsert({
      id: notebookMemberId(link.notebookId, userId), notebookId: link.notebookId, userId,
      role, invitedBy: link.createdBy, source: "invite_link", sourceId: link.id,
    });
    return { success: true as const, role, counted: true };
  })();
  if (!result) return c.json({ error: "邀请链接已达到最大加入人数", code: "SHARE_LINK_USE_LIMIT" }, 410);
  return c.json({ ...result, notebookId: link.notebookId });
});

app.get("/:id/share-link", (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const id = c.req.param("id");
  const { permission } = resolveNotebookPermission(id, userId);
  if (!hasPermission(permission, "manage")) return c.json({ error: "forbidden" }, 403);
  return c.json(notebookShareLinksRepository.getLatestEnabledByNotebook(id) || null);
});

app.post("/:id/share-link", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const role = parseNotebookMemberRole(body.role) || "viewer";
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt.trim() ? body.expiresAt.trim() : null;
  const maxUses = body.maxUses === null || body.maxUses === undefined || body.maxUses === ""
    ? null : Number(body.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000)) {
    return c.json({ error: "maxUses must be 1-100000" }, 400);
  }
  const { permission } = resolveNotebookPermission(id, userId);
  if (!hasPermission(permission, "manage")) return c.json({ error: "forbidden" }, 403);

  const previous = notebookShareLinksRepository.getLatestEnabledByNotebook(id);
  if (previous) {
    notebookShareLinksRepository.disableAllByNotebook(id);
    notebookMembersRepository.removeBySource("invite_link", previous.id);
  }
  const linkId = uuid();
  notebookShareLinksRepository.create({
    id: linkId, notebookId: id, token: generateShareToken(), role, expiresAt, maxUses, createdBy: userId,
  });
  return c.json(notebookShareLinksRepository.getById(linkId), 201);
});

app.patch("/:id/share-link", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { permission } = resolveNotebookPermission(id, userId);
  if (!hasPermission(permission, "manage")) return c.json({ error: "forbidden" }, 403);
  const link = notebookShareLinksRepository.getLatestEnabledByNotebook(id);
  if (!link) return c.json({ error: "share link not found" }, 404);

  const updates: Parameters<typeof notebookShareLinksRepository.update>[1] = {};
  if (body.role !== undefined) {
    const role = parseNotebookMemberRole(body.role);
    if (!role) return c.json({ error: "role must be editor or viewer" }, 400);
    updates.role = role;
  }
  if (body.expiresAt !== undefined) updates.expiresAt = body.expiresAt ? String(body.expiresAt) : null;
  if (body.maxUses !== undefined) {
    const maxUses = body.maxUses === null || body.maxUses === "" ? null : Number(body.maxUses);
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000)) {
      return c.json({ error: "maxUses must be 1-100000" }, 400);
    }
    updates.maxUses = maxUses;
  }
  if (body.resetUses === true) updates.useCount = 0;
  if (body.rotateToken === true) {
    updates.token = generateShareToken();
    updates.useCount = 0;
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;
  if (!Object.keys(updates).length) return c.json({ error: "no changes" }, 400);

  notebookShareLinksRepository.update(link.id, updates);
  if (updates.role || updates.enabled === 0) {
    if (updates.enabled === 0) notebookMembersRepository.removeBySource("invite_link", link.id);
    else notebookMembersRepository.restrictBySource("invite_link", link.id, {
      role: updates.role === "editor" ? "editor" : "viewer", allowDownload: true, allowReshare: false,
    });
  }
  return c.json(notebookShareLinksRepository.getById(link.id));
});

app.delete("/:id/share-link", (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const id = c.req.param("id");
  const { permission } = resolveNotebookPermission(id, userId);
  if (!hasPermission(permission, "manage")) return c.json({ error: "forbidden" }, 403);
  const link = notebookShareLinksRepository.getLatestEnabledByNotebook(id);
  notebookShareLinksRepository.disableAllByNotebook(id);
  const removedMembers = link ? notebookMembersRepository.removeBySource("invite_link", link.id) : 0;
  return c.json({ success: true, removedMembers });
});

app.get("/:id/members",''',
)

# Management list for public comments complements the already-added moderate/delete endpoints.
insert_before(
    "backend/src/runtime/notebook-publication.ts",
    '\nnotebooksRouter.patch("/:id/publication/comments/:commentId",',
    r'''
notebooksRouter.get("/:id/publication/comments", (c) => {
  const notebookId = c.req.param("id");
  const access = requireManageNotebook(c, notebookId);
  if (!access.ok) return access.response;
  const publication = getDb().prepare("SELECT id FROM notebook_publications WHERE notebookId = ?")
    .get(notebookId) as { id: string } | undefined;
  if (!publication) return c.json([]);
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") || 100)));
  const rows = getDb().prepare(`
    SELECT sc.id, sc.noteId, n.title AS noteTitle,
           COALESCE(NULLIF(sc.guestName, ''), u.displayName, u.username, '匿名') AS nickname,
           sc.content, sc.isResolved, sc.isHidden, sc.createdAt
    FROM share_comments sc
    JOIN notes n ON n.id = sc.noteId
    LEFT JOIN users u ON u.id = sc.userId
    WHERE sc.sourceType = 'notebook_publication' AND sc.sourceId = ?
    ORDER BY sc.createdAt DESC LIMIT ?
  `).all(publication.id, limit);
  return c.json(rows);
});
''',
)

# ---------------------------------------------------------------------------
# Frontend APIs for public comment management.
# ---------------------------------------------------------------------------
replace_once(
    "frontend/src/lib/notebookPublicationApi.ts",
    '''export interface PublicComment {\n  id: string;\n  nickname: string;\n  content: string;\n  createdAt: string;\n}\n''',
    '''export interface PublicComment {\n  id: string;\n  nickname: string;\n  content: string;\n  isResolved?: number | boolean;\n  createdAt: string;\n}\n\nexport interface ManagedPublicationComment extends PublicComment {\n  noteId: string;\n  noteTitle: string;\n  isHidden: number | boolean;\n}\n''',
)
replace_once(
    "frontend/src/lib/notebookPublicationApi.ts",
    'addComment(token: string, noteId: string, input: { nickname: string; content: string }, accessToken?: string) {',
    'addComment(token: string, noteId: string, input: { nickname: string; content: string; _hp?: string }, accessToken?: string) {',
)
insert_before(
    "frontend/src/lib/notebookPublicationApi.ts",
    '\n  getPermissionOverrides(notebookId: string) {',
    r'''
  getManagedComments(notebookId: string) {
    return request<ManagedPublicationComment[]>(
      `/notebooks/${encodeURIComponent(notebookId)}/publication/comments`,
      {},
      { authenticated: true },
    );
  },

  moderateComment(notebookId: string, commentId: string, input: { isResolved?: boolean; isHidden?: boolean }) {
    return request<{ success: true; id: string; isResolved: number; isHidden: number }>(
      `/notebooks/${encodeURIComponent(notebookId)}/publication/comments/${encodeURIComponent(commentId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
      { authenticated: true },
    );
  },

  deleteManagedComment(notebookId: string, commentId: string) {
    return request<{ success: true }>(
      `/notebooks/${encodeURIComponent(notebookId)}/publication/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" },
      { authenticated: true },
    );
  },
''',
)

# ---------------------------------------------------------------------------
# Single-note share management UI.
# ---------------------------------------------------------------------------
write(
    "frontend/src/components/ShareModal.tsx",
    r'''import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check, Copy, ExternalLink, Eye, EyeOff, Link2, Loader2, Pencil, RefreshCw,
  RotateCcw, Settings2, Shield, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirm } from "@/components/ui/confirm";
import { api } from "@/lib/api";
import { buildPublicWebUrl } from "@/lib/publicWebOrigin";
import { toast } from "@/lib/toast";
import type { Share, SharePermission } from "@/types";
import { cn } from "@/lib/utils";

interface ShareModalProps {
  noteId: string;
  noteTitle: string;
  onClose: () => void;
}

function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function permissionLabel(value: string): string {
  return value === "comment" ? "可评论" : value === "edit" ? "访客可编辑" : value === "edit_auth" ? "登录后可编辑" : "仅查看";
}

export default function ShareModal({ noteId, noteTitle, onClose }: ShareModalProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permission, setPermission] = useState<SharePermission>("view");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [maxViews, setMaxViews] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      setShares(await api.getSharesByNote(noteId));
    } catch (error: any) {
      toast.error(error?.message || "加载分享列表失败");
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => { void loadShares(); }, [loadShares]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resetForm = () => {
    setEditingId(null);
    setPermission("view");
    setPassword("");
    setExpiresAt("");
    setMaxViews("");
    setShowPassword(false);
  };

  const editShare = (share: Share) => {
    setEditingId(share.id);
    setPermission(share.permission);
    setPassword("");
    setExpiresAt(toLocalDateTime(share.expiresAt));
    setMaxViews(share.maxViews ? String(share.maxViews) : "");
  };

  const submit = async () => {
    if (saving) return;
    const parsedMax = maxViews.trim() ? Number(maxViews) : null;
    if (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 1)) {
      toast.error("最大访问会话数必须是正整数");
      return;
    }
    setSaving(true);
    try {
      const common = {
        permission,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        maxViews: parsedMax,
      };
      if (editingId) {
        await api.updateShare(editingId, {
          ...common,
          ...(password.trim() ? { password: password.trim() } : {}),
        });
        toast.success("分享设置已更新");
      } else {
        await api.createShare({
          noteId,
          permission,
          password: password.trim() || undefined,
          expiresAt: common.expiresAt || undefined,
          maxViews: parsedMax || undefined,
        });
        toast.success("分享链接已创建");
      }
      resetForm();
      await loadShares();
    } catch (error: any) {
      toast.error(error?.message || "保存分享失败");
    } finally {
      setSaving(false);
    }
  };

  const shareUrl = (token: string) => buildPublicWebUrl(`/share/${token}`);
  const copy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1600);
      toast.success("分享链接已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const mutate = async (action: () => Promise<unknown>, success: string) => {
    try { await action(); toast.success(success); await loadShares(); }
    catch (error: any) { toast.error(error?.message || "操作失败"); }
  };

  const rotate = async (share: Share) => {
    if (!await confirm({ title: "轮换分享链接？", description: "旧链接和旧密码访问令牌会立即失效，访问会话数会重置。" })) return;
    await mutate(() => api.updateShare(share.id, { rotateToken: true }), "已生成新链接");
  };
  const resetViews = async (share: Share) => {
    if (!await confirm({ title: "重置访问会话数？", description: "已记录的访问会话将清零，访客可重新占用名额。" })) return;
    await mutate(() => api.updateShare(share.id, { resetViews: true }), "访问会话数已重置");
  };
  const remove = async (share: Share) => {
    if (!await confirm({ title: "删除分享？", description: "链接、评论访问和附件签名将立即失效。", danger: true })) return;
    await mutate(() => api.deleteShare(share.id), "分享已删除");
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-3 py-5 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <motion.div ref={modalRef} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl" initial={{ y: 18, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .98 }}>
          <header className="flex items-center justify-between border-b border-app-border px-5 py-4">
            <div><h2 className="font-semibold">分享笔记</h2><p className="mt-0.5 max-w-xl truncate text-xs text-tx-tertiary">{noteTitle}</p></div>
            <button onClick={onClose} className="rounded-lg p-2 hover:bg-app-hover" aria-label="关闭"><X size={17} /></button>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_1fr]">
            <section className="border-b border-app-border p-5 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center gap-2"><Settings2 size={16} className="text-accent-primary" /><h3 className="text-sm font-semibold">{editingId ? "编辑分享设置" : "创建新分享"}</h3></div>
              <div className="space-y-3">
                <label className="block space-y-1"><span className="text-xs text-tx-secondary">权限</span><select className="h-10 w-full rounded-lg border border-app-border bg-app-bg px-3 text-sm" value={permission} onChange={(event) => setPermission(event.target.value as SharePermission)}><option value="view">仅查看</option><option value="comment">查看 + 评论</option><option value="edit">访客可编辑</option><option value="edit_auth">登录后可编辑</option></select></label>
                <label className="block space-y-1"><span className="text-xs text-tx-secondary">访问密码（可选）</span><div className="relative"><Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={editingId ? "留空保持原密码" : "至少 4 个字符"} className="pr-10" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-2.5 text-tx-tertiary">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
                <label className="block space-y-1"><span className="text-xs text-tx-secondary">有效期（可选）</span><Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
                <label className="block space-y-1"><span className="text-xs text-tx-secondary">最大访问会话数（可选）</span><Input type="number" min={1} value={maxViews} onChange={(event) => setMaxViews(event.target.value)} placeholder="同一浏览器标签页刷新不重复计数" /></label>
                <div className="flex gap-2 pt-1"><Button onClick={submit} disabled={saving} className="flex-1">{saving ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Link2 size={15} className="mr-1" />}{editingId ? "保存设置" : "创建链接"}</Button>{editingId && <Button variant="outline" onClick={resetForm}>取消</Button>}</div>
              </div>
            </section>

            <section className="min-h-0 overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">已创建的分享</h3><Button variant="ghost" size="sm" onClick={loadShares}><RefreshCw size={14} /></Button></div>
              {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-tx-tertiary" /></div> : shares.length === 0 ? (
                <div className="rounded-xl border border-dashed border-app-border py-14 text-center text-sm text-tx-tertiary">暂时没有分享链接</div>
              ) : <div className="space-y-3">{shares.map((share) => {
                const active = Boolean(share.isActive);
                const url = shareUrl(share.shareToken);
                return <article key={share.id} className={cn("rounded-xl border border-app-border p-3", !active && "opacity-60")}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{permissionLabel(share.permission)}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px]", active ? "bg-emerald-500/10 text-emerald-600" : "bg-app-hover text-tx-tertiary")}>{active ? "有效" : "已停用"}</span>{share.hasPassword && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">密码</span>}</div><p className="mt-1 truncate text-xs text-tx-tertiary">{url}</p><p className="mt-1 text-[11px] text-tx-tertiary">访问会话 {share.viewCount || 0}{share.maxViews ? ` / ${share.maxViews}` : ""}{share.expiresAt ? ` · 到期 ${new Date(share.expiresAt).toLocaleString()}` : ""}</p></div><Shield size={16} className="shrink-0 text-tx-tertiary" /></div>
                  <div className="mt-3 flex flex-wrap gap-1.5"><Button size="sm" variant="outline" onClick={() => copy(url, share.id)}>{copied === share.id ? <Check size={13} /> : <Copy size={13} />}<span className="ml-1">复制</span></Button><Button size="sm" variant="outline" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}><ExternalLink size={13} /></Button><Button size="sm" variant="outline" onClick={() => editShare(share)}><Pencil size={13} className="mr-1" />编辑</Button><Button size="sm" variant="outline" onClick={() => resetViews(share)}><RotateCcw size={13} className="mr-1" />清零</Button><Button size="sm" variant="outline" onClick={() => rotate(share)}><RefreshCw size={13} className="mr-1" />换链接</Button><Button size="sm" variant="outline" onClick={() => mutate(() => api.updateShare(share.id, { isActive: active ? 0 : 1 }), active ? "分享已停用" : "分享已启用")}>{active ? "停用" : "启用"}</Button><Button size="sm" variant="outline" className="text-red-500" onClick={() => remove(share)}><Trash2 size={13} /></Button></div>
                </article>;
              })}</div>}
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
''',
)

# ---------------------------------------------------------------------------
# Notebook sharing dialog: editable members, invite controls, moderation.
# ---------------------------------------------------------------------------
write(
    "frontend/src/components/NotebookShareDialog.tsx",
    r'''import { useEffect, useMemo, useState } from "react";
import { Globe2, KeyRound, Link2, LockKeyhole, MessageCircle, RefreshCw, RotateCcw, ShieldCheck, Trash2, Unlink, UserRoundCog, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/ui/confirm";
import { buildPublicWebUrl } from "@/lib/publicWebOrigin";
import type { Notebook, NotebookMember, NotebookShareLink, UserPublicInfo } from "@/types";
import {
  notebookPublicationApi,
  type ManagedPublicationComment,
  type NotebookDirectoryPermission,
  type NotebookPermissionOverride,
  type NotebookPublication,
  type NotebookPublicationAccessMode,
  type NotebookPublicationPermission,
} from "@/lib/notebookPublicationApi";
import { cn } from "@/lib/utils";

interface Props { notebook: Notebook; onClose: () => void; }
type Tab = "members" | "publish" | "permissions";
const bool = (value: number | boolean | undefined) => value === true || value === 1;
const localDateTime = (value: string | null | undefined) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
const permissionLabel = (permission: NotebookDirectoryPermission) => ({ none: "不可见", read: "可查看", comment: "可评论", write: "可编辑", manage: "可管理" })[permission];

export default function NotebookShareDialog({ notebook, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("members");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<NotebookMember[]>([]);
  const [link, setLink] = useState<NotebookShareLink | null>(null);
  const [publication, setPublication] = useState<NotebookPublication | null>(null);
  const [overrides, setOverrides] = useState<NotebookPermissionOverride[]>([]);
  const [inheritsFromParent, setInheritsFromParent] = useState<string | null>(null);
  const [comments, setComments] = useState<ManagedPublicationComment[]>([]);

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<UserPublicInfo[]>([]);
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");
  const [inviteMaxUses, setInviteMaxUses] = useState("");

  const [accessMode, setAccessMode] = useState<NotebookPublicationAccessMode>("link");
  const [publicPermission, setPublicPermission] = useState<NotebookPublicationPermission>("read");
  const [publicSecret, setPublicSecret] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowComment, setAllowComment] = useState(false);
  const [allowEdit, setAllowEdit] = useState(false);
  const [allowReshare, setAllowReshare] = useState(false);

  const [aclQuery, setAclQuery] = useState("");
  const [aclCandidates, setAclCandidates] = useState<UserPublicInfo[]>([]);
  const [aclPermission, setAclPermission] = useState<NotebookDirectoryPermission>("read");
  const [aclAllowDownload, setAclAllowDownload] = useState(true);
  const [aclAllowReshare, setAclAllowReshare] = useState(false);

  const shareUrl = useMemo(() => link?.token ? buildPublicWebUrl(`/notebook-share/${link.token}`) : "", [link?.token]);
  const publicationUrl = useMemo(() => publication?.token && bool(publication.isActive) ? buildPublicWebUrl(`/public/${publication.token}`) : "", [publication?.token, publication?.isActive]);

  const applyPublication = (value: NotebookPublication | null) => {
    setPublication(value);
    if (!value) return;
    setAccessMode(value.accessMode); setPublicPermission(value.permission);
    setExpiresAt(localDateTime(value.expiresAt)); setAllowDownload(bool(value.allowDownload));
    setAllowComment(bool(value.allowComment)); setAllowEdit(bool(value.allowEdit));
    setAllowReshare(bool(value.allowReshare)); setPublicSecret("");
  };
  const applyLink = (value: NotebookShareLink | null) => {
    setLink(value);
    if (!value) return;
    setRole(value.role); setInviteExpiresAt(localDateTime(value.expiresAt));
    setInviteMaxUses(value.maxUses ? String(value.maxUses) : "");
  };

  const reload = async () => {
    const [nextMembers, nextLink, nextPublication, nextOverrides] = await Promise.all([
      api.getNotebookMembers(notebook.id), api.getNotebookShareLink(notebook.id),
      notebookPublicationApi.getPublication(notebook.id), notebookPublicationApi.getPermissionOverrides(notebook.id),
    ]);
    setMembers(nextMembers); applyLink(nextLink); applyPublication(nextPublication);
    setOverrides(nextOverrides.direct); setInheritsFromParent(nextOverrides.inheritsFromParent);
  };
  const loadComments = async () => {
    if (!publication || !bool(publication.isActive)) { setComments([]); return; }
    try { setComments(await notebookPublicationApi.getManagedComments(notebook.id)); }
    catch (error: any) { toast.error(error?.message || "加载公开评论失败"); }
  };

  useEffect(() => { let cancelled = false; setLoading(true); reload().catch((e: any) => !cancelled && toast.error(e?.message || "加载分享设置失败")).finally(() => !cancelled && setLoading(false)); return () => { cancelled = true; }; }, [notebook.id]);
  useEffect(() => { if (tab === "publish") void loadComments(); }, [tab, publication?.id, publication?.isActive]);

  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast.success("链接已复制"); } catch { toast.error("复制失败"); } };
  const searchUsers = async (kind: "member" | "acl") => {
    const keyword = (kind === "member" ? query : aclQuery).trim(); if (!keyword) return;
    const rows = await api.searchUsers(keyword);
    if (kind === "member") setCandidates(rows.filter((u) => !members.some((m) => m.userId === u.id)));
    else setAclCandidates(rows.filter((u) => !overrides.some((entry) => entry.userId === u.id)));
  };
  const addMember = async (userId: string) => { await api.addNotebookMember(notebook.id, { userId, role }); setQuery(""); setCandidates([]); toast.success("成员已添加"); await reload(); };
  const changeMemberRole = async (member: NotebookMember, next: "viewer" | "editor") => { try { await api.updateNotebookMember(notebook.id, member.userId, { role: next }); toast.success("成员权限已更新"); await reload(); } catch (e: any) { toast.error(e?.message || "权限更新失败"); } };
  const removeMember = async (userId: string) => { if (!await confirm({ title: "移除成员？", description: "该成员会立即失去共享目录访问权限。", danger: true })) return; await api.removeNotebookMember(notebook.id, userId); toast.success("成员已移除"); await reload(); };

  const saveInvite = async () => {
    const maxUses = inviteMaxUses.trim() ? Number(inviteMaxUses) : null;
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return toast.error("最大加入人数必须是正整数");
    setSaving(true);
    try {
      const input = { role, expiresAt: inviteExpiresAt ? new Date(inviteExpiresAt).toISOString() : null, maxUses };
      const next = link ? await api.updateNotebookShareLink(notebook.id, input) : await api.createNotebookShareLink(notebook.id, input);
      applyLink(next); toast.success(link ? "邀请设置已保存" : "邀请链接已生成");
    } catch (e: any) { toast.error(e?.message || "邀请链接保存失败"); } finally { setSaving(false); }
  };
  const rotateInvite = async () => { if (!await confirm({ title: "轮换邀请链接？", description: "旧链接立即失效，使用次数会清零；已加入成员不受影响。" })) return; const next = await api.updateNotebookShareLink(notebook.id, { rotateToken: true }); applyLink(next); toast.success("已生成新邀请链接"); };
  const resetInviteUses = async () => { const next = await api.updateNotebookShareLink(notebook.id, { resetUses: true }); applyLink(next); toast.success("加入人数统计已清零"); };
  const revokeInvite = async () => { if (!await confirm({ title: "撤销邀请链接？", description: "旧链接立即失效，并移除仅通过该链接加入的成员；手动成员不受影响。", danger: true })) return; await api.deleteNotebookShareLink(notebook.id); applyLink(null); toast.success("邀请链接已撤销"); await reload(); };

  const savePublication = async () => {
    if ((accessMode === "code" || accessMode === "password") && !publication?.hasSecret && !publicSecret.trim()) return toast.error("请设置访问凭证");
    setSaving(true);
    try { const next = await notebookPublicationApi.savePublication(notebook.id, { accessMode, permission: publicPermission, secret: publicSecret.trim() || undefined, allowDownload, allowComment, allowEdit, allowReshare, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }); applyPublication(next); toast.success("公开发布设置已保存"); }
    catch (e: any) { toast.error(e?.message || "发布失败"); } finally { setSaving(false); }
  };
  const revokePublication = async () => { if (!await confirm({ title: "撤销目录发布？", description: "公开链接、附件签名以及仅通过该发布加入的成员会立即失效。", danger: true })) return; await notebookPublicationApi.revokePublication(notebook.id); setPublication((p) => p ? { ...p, isActive: 0 } : p); setComments([]); toast.success("目录发布已撤销"); };
  const moderate = async (comment: ManagedPublicationComment, input: { isResolved?: boolean; isHidden?: boolean }) => { await notebookPublicationApi.moderateComment(notebook.id, comment.id, input); await loadComments(); };
  const deleteComment = async (comment: ManagedPublicationComment) => { if (!await confirm({ title: "删除评论？", description: "该操作不可恢复。", danger: true })) return; await notebookPublicationApi.deleteManagedComment(notebook.id, comment.id); await loadComments(); };

  const addOverride = async (userId: string) => { await notebookPublicationApi.setPermissionOverride(notebook.id, userId, { permission: aclPermission, allowDownload: aclAllowDownload, allowReshare: aclAllowReshare }); setAclQuery(""); setAclCandidates([]); await reload(); };
  const updateOverride = async (entry: NotebookPermissionOverride, permission: NotebookDirectoryPermission) => { await notebookPublicationApi.setPermissionOverride(notebook.id, entry.userId, { permission, allowDownload: bool(entry.allowDownload), allowReshare: bool(entry.allowReshare) }); await reload(); };
  const removeOverride = async (userId: string) => { await notebookPublicationApi.removePermissionOverride(notebook.id, userId); await reload(); };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Users }> = [{ id: "members", label: "成员与邀请", icon: Users }, { id: "publish", label: "公开发布", icon: Globe2 }, { id: "permissions", label: "目录权限", icon: UserRoundCog }];
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-3 py-5 backdrop-blur-sm"><div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl">
    <header className="flex items-center justify-between border-b border-app-border px-5 py-4"><div><h2 className="font-semibold">分享与发布</h2><p className="text-xs text-tx-tertiary">{notebook.icon} {notebook.name} · 包含全部子目录</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-app-hover"><X size={17} /></button></header>
    <nav className="flex gap-1 border-b border-app-border bg-app-hover/30 px-4 py-2">{tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium", tab === id ? "bg-app-surface text-accent-primary shadow-sm" : "text-tx-secondary hover:bg-app-surface/70")}><Icon size={14} />{label}</button>)}</nav>
    <main className="min-h-0 flex-1 overflow-y-auto p-5">{loading ? <div className="py-16 text-center text-sm text-tx-tertiary">正在加载...</div> : tab === "members" ? <div className="space-y-5">
      <section><h3 className="mb-2 text-sm font-semibold">指定账号</h3><div className="flex gap-2"><select className="h-9 rounded-lg border border-app-border bg-app-bg px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as any)}><option value="viewer">只读</option><option value="editor">可编辑</option></select><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索用户名或邮箱" className="h-9" onKeyDown={(e) => { if (e.key === "Enter") void searchUsers("member"); }} /><Button variant="outline" onClick={() => searchUsers("member")}>搜索</Button></div>{candidates.length > 0 && <div className="mt-2 overflow-hidden rounded-lg border">{candidates.map((u) => <button key={u.id} onClick={() => addMember(u.id)} className="flex w-full justify-between px-3 py-2 text-sm hover:bg-app-hover"><span>{u.displayName || u.username}</span><span className="text-xs text-tx-tertiary">添加</span></button>)}</div>}</section>
      <section><div className="mb-2 text-xs font-medium text-tx-tertiary">当前成员</div><div className="divide-y divide-app-border overflow-hidden rounded-xl border border-app-border">{members.length === 0 ? <div className="p-5 text-center text-sm text-tx-tertiary">暂无指定成员</div> : members.map((m) => <div key={m.userId} className="flex items-center gap-3 px-3 py-2.5"><div className="min-w-0 flex-1"><div className="truncate text-sm">{m.displayName || m.username || m.userId}</div><div className="text-[11px] text-tx-tertiary">{m.source === "invite_link" ? "邀请链接加入" : m.source === "publication" ? "公开发布加入" : "手动成员"}</div></div>{m.role === "owner" ? <span className="text-xs text-tx-tertiary">拥有者</span> : <><select value={m.role} onChange={(e) => changeMemberRole(m, e.target.value as any)} className="h-8 rounded-md border bg-app-bg px-2 text-xs"><option value="viewer">只读</option><option value="editor">可编辑</option></select><button onClick={() => removeMember(m.userId)} className="rounded p-1.5 text-red-500 hover:bg-app-hover"><Trash2 size={14} /></button></>}</div>)}</div></section>
      <section className="rounded-xl border border-app-border bg-app-hover/20 p-4"><div className="flex items-center gap-2"><Link2 size={16} /><h3 className="text-sm font-semibold">登录邀请链接</h3></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="space-y-1"><span className="text-xs">加入权限</span><select value={role} onChange={(e) => setRole(e.target.value as any)} className="h-9 w-full rounded-lg border bg-app-bg px-2 text-sm"><option value="viewer">只读</option><option value="editor">可编辑</option></select></label><label className="space-y-1"><span className="text-xs">最大加入人数</span><Input type="number" min={1} value={inviteMaxUses} onChange={(e) => setInviteMaxUses(e.target.value)} placeholder="不限" className="h-9" /></label><label className="space-y-1"><span className="text-xs">有效期</span><Input type="datetime-local" value={inviteExpiresAt} onChange={(e) => setInviteExpiresAt(e.target.value)} className="h-9" /></label></div>{link && <><div className="mt-3 flex gap-2"><Input readOnly value={shareUrl} className="h-9 text-xs" /><Button variant="outline" onClick={() => copy(shareUrl)}>复制</Button></div><p className="mt-1 text-[11px] text-tx-tertiary">已加入 {link.useCount || 0}{link.maxUses ? ` / ${link.maxUses}` : ""} 人</p></>}<div className="mt-3 flex flex-wrap justify-end gap-2">{link && <><Button variant="outline" onClick={resetInviteUses}><RotateCcw size={13} className="mr-1" />清零统计</Button><Button variant="outline" onClick={rotateInvite}><RefreshCw size={13} className="mr-1" />换链接</Button><Button variant="outline" className="text-red-500" onClick={revokeInvite}><Unlink size={13} className="mr-1" />撤销</Button></>}<Button onClick={saveInvite} disabled={saving}>{link ? "保存邀请设置" : "生成邀请链接"}</Button></div></section>
    </div> : tab === "publish" ? <div className="space-y-5">
      <section className="rounded-xl border border-app-border p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs">访问方式</span><select value={accessMode} onChange={(e) => setAccessMode(e.target.value as any)} className="h-10 w-full rounded-lg border bg-app-bg px-3 text-sm"><option value="public">公共空间公开</option><option value="link">持链接访问</option><option value="code">访问码</option><option value="password">密码保护</option></select></label><label className="space-y-1"><span className="text-xs">基础权限</span><select value={publicPermission} onChange={(e) => { const next = e.target.value as NotebookPublicationPermission; setPublicPermission(next); if (next === "read") { setAllowComment(false); setAllowEdit(false); } else if (next === "comment") setAllowComment(true); }} className="h-10 w-full rounded-lg border bg-app-bg px-3 text-sm"><option value="read">查看</option><option value="comment">查看 + 评论</option><option value="write">登录后加入编辑</option></select></label></div>{(accessMode === "code" || accessMode === "password") && <label className="mt-3 block space-y-1"><span className="text-xs">{accessMode === "code" ? "访问码" : "密码"}</span><Input type={accessMode === "password" ? "password" : "text"} value={publicSecret} onChange={(e) => setPublicSecret(e.target.value)} placeholder={publication?.hasSecret ? "留空保持原凭证" : "设置访问凭证"} /></label>}<label className="mt-3 block space-y-1"><span className="text-xs">有效期</span><Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label><div className="mt-3 grid gap-2 sm:grid-cols-2"><Toggle checked={allowDownload} onChange={setAllowDownload} title="允许附件下载" /><Toggle checked={allowComment} onChange={setAllowComment} title="允许游客评论" /><Toggle checked={allowEdit} onChange={setAllowEdit} disabled={publicPermission !== "write"} title="登录后加入编辑" /><Toggle checked={allowReshare} onChange={setAllowReshare} title="允许二次分享" /></div>{publicationUrl && <div className="mt-3 flex gap-2"><Input readOnly value={publicationUrl} className="text-xs" /><Button variant="outline" onClick={() => copy(publicationUrl)}>复制</Button></div>}<div className="mt-4 flex justify-end gap-2">{publication && bool(publication.isActive) && <Button variant="outline" className="text-red-500" onClick={revokePublication}>撤销发布</Button>}<Button onClick={savePublication} disabled={saving}>保存发布设置</Button></div></section>
      <section><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle size={15} />公开评论管理</div><Button size="sm" variant="ghost" onClick={loadComments}><RefreshCw size={13} /></Button></div><div className="divide-y divide-app-border overflow-hidden rounded-xl border border-app-border">{comments.length === 0 ? <div className="p-6 text-center text-sm text-tx-tertiary">暂无公开评论</div> : comments.map((c) => <div key={c.id} className={cn("p-3", bool(c.isHidden) && "opacity-60")}><div className="flex items-center justify-between gap-3"><div className="text-xs font-medium">{c.nickname} · {c.noteTitle}</div><div className="text-[10px] text-tx-tertiary">{new Date(c.createdAt).toLocaleString()}</div></div><p className="mt-1 whitespace-pre-wrap text-sm">{c.content}</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => moderate(c, { isResolved: !bool(c.isResolved) })}>{bool(c.isResolved) ? "取消解决" : "标记解决"}</Button><Button size="sm" variant="outline" onClick={() => moderate(c, { isHidden: !bool(c.isHidden) })}>{bool(c.isHidden) ? "恢复显示" : "隐藏"}</Button><Button size="sm" variant="outline" className="text-red-500" onClick={() => deleteComment(c)}><Trash2 size={13} /></Button></div></div>)}</div></section>
    </div> : <div className="space-y-5"><section className="rounded-xl border border-app-border bg-app-hover/20 p-4"><h3 className="text-sm font-semibold">目录级权限继承</h3><p className="mt-1 text-xs text-tx-tertiary">最近的显式规则优先，并向子目录继承。{inheritsFromParent ? "当前目录可删除覆盖以恢复父级继承。" : "当前目录是权限树根节点。"}</p></section><section><div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]"><select value={aclPermission} onChange={(e) => setAclPermission(e.target.value as any)} className="h-9 rounded-lg border bg-app-bg px-2 text-sm"><option value="none">不可见</option><option value="read">可查看</option><option value="comment">可评论</option><option value="write">可编辑</option><option value="manage">可管理</option></select><Input value={aclQuery} onChange={(e) => setAclQuery(e.target.value)} placeholder="搜索用户" className="h-9" /><Button variant="outline" onClick={() => searchUsers("acl")}>搜索</Button></div><div className="mt-2 flex gap-4 text-xs"><label><input type="checkbox" checked={aclAllowDownload} onChange={(e) => setAclAllowDownload(e.target.checked)} /> 允许下载</label><label><input type="checkbox" checked={aclAllowReshare} onChange={(e) => setAclAllowReshare(e.target.checked)} /> 允许二次分享</label></div>{aclCandidates.map((u) => <button key={u.id} onClick={() => addOverride(u.id)} className="mt-2 flex w-full justify-between rounded border px-3 py-2 text-sm hover:bg-app-hover"><span>{u.displayName || u.username}</span><span>设为{permissionLabel(aclPermission)}</span></button>)}</section><section><div className="divide-y divide-app-border overflow-hidden rounded-xl border border-app-border">{overrides.length === 0 ? <div className="p-6 text-center text-sm text-tx-tertiary">没有显式覆盖</div> : overrides.map((entry) => <div key={entry.userId} className="flex items-center gap-3 px-3 py-3"><div className="min-w-0 flex-1"><div className="truncate text-sm">{entry.displayName || entry.username}</div><div className="text-[11px] text-tx-tertiary">{bool(entry.allowDownload) ? "可下载" : "不可下载"} · {bool(entry.allowReshare) ? "可二次分享" : "不可二次分享"}</div></div><select value={entry.permission} onChange={(e) => updateOverride(entry, e.target.value as any)} className="h-8 rounded border bg-app-bg px-2 text-xs"><option value="none">不可见</option><option value="read">可查看</option><option value="comment">可评论</option><option value="write">可编辑</option><option value="manage">可管理</option></select><button onClick={() => removeOverride(entry.userId)} className="rounded p-1.5 text-red-500"><Trash2 size={14} /></button></div>)}</div></section></div>}</main>
  </div></div>;
}

function Toggle({ checked, onChange, title, disabled }: { checked: boolean; onChange: (value: boolean) => void; title: string; disabled?: boolean }) {
  return <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border border-app-border p-3 text-xs", disabled && "cursor-not-allowed opacity-50")}><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{title}</span></label>;
}
''',
)

# Public comment honeypot is present in the real form and forwarded to the API.
replace_once(
    "frontend/src/components/PublicNotebookView.tsx",
    '  const [commentText, setCommentText] = useState("");\n',
    '  const [commentText, setCommentText] = useState("");\n  const [commentWebsite, setCommentWebsite] = useState("");\n',
)
replace_once(
    "frontend/src/components/PublicNotebookView.tsx",
    '{ nickname: nickname.trim(), content: commentText.trim() },',
    '{ nickname: nickname.trim(), content: commentText.trim(), _hp: commentWebsite },',
)
# Insert a visually hidden honeypot before the public comment textarea/input block.
replace_once(
    "frontend/src/components/PublicNotebookView.tsx",
    '''                <textarea\n                  value={commentText}''',
    '''                <input\n                  type="text"\n                  value={commentWebsite}\n                  onChange={(event) => setCommentWebsite(event.target.value)}\n                  tabIndex={-1}\n                  autoComplete="off"\n                  aria-hidden="true"\n                  className="absolute -left-[10000px] h-px w-px opacity-0"\n                  name="website"\n                />\n                <textarea\n                  value={commentText}''',
)

# Tests for helpers and invite lifecycle.
write(
    "frontend/src/lib/__tests__/shareAccessHelpers.test.ts",
    r'''import { beforeEach, describe, expect, it } from "vitest";
import { normalizePublicWebOrigin } from "@/lib/publicWebOrigin";
import { getShareSessionId } from "@/lib/shareSession";

describe("share access helpers", () => {
  beforeEach(() => sessionStorage.clear());
  it("keeps one anonymous session id inside a browser tab", () => {
    const first = getShareSessionId();
    expect(first).toBeTruthy();
    expect(getShareSessionId()).toBe(first);
  });
  it("normalizes only http public origins", () => {
    expect(normalizePublicWebOrigin("https://note.example.com///")).toBe("https://note.example.com");
    expect(normalizePublicWebOrigin("javascript:alert(1)")).toBe("");
  });
});
''',
)

write(
    "backend/tests/notebook-share-link-lifecycle.test.ts",
    r'''import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nowen-invite-lifecycle-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.ELECTRON_USER_DATA = dir;

let closeDb: () => void;

test("invite link enforces unique join limit and revoke removes only link members", async () => {
  const [{ default: notebooksRouter }, schema] = await Promise.all([
    import("../src/routes/notebooks"), import("../src/db/schema"),
  ]);
  closeDb = schema.closeDb;
  const db = schema.getDb();
  for (const id of ["owner", "member-a", "member-b"]) {
    db.prepare("INSERT INTO users (id, username, passwordHash) VALUES (?, ?, 'hash')").run(id, id);
  }
  db.prepare("INSERT INTO notebooks (id, userId, name) VALUES ('nb', 'owner', 'Notebook')").run();
  const app = new Hono();
  app.route("/notebooks", notebooksRouter);

  const created = await app.request("/notebooks/nb/share-link", {
    method: "POST", headers: { "X-User-Id": "owner", "Content-Type": "application/json" },
    body: JSON.stringify({ role: "viewer", maxUses: 1 }),
  });
  assert.equal(created.status, 201);
  const link = await created.json() as { id: string; token: string; maxUses: number; useCount: number };
  assert.equal(link.maxUses, 1);
  assert.equal(link.useCount, 0);

  const first = await app.request(`/notebooks/share/${link.token}/join`, { method: "POST", headers: { "X-User-Id": "member-a" } });
  assert.equal(first.status, 200);
  const repeat = await app.request(`/notebooks/share/${link.token}/join`, { method: "POST", headers: { "X-User-Id": "member-a" } });
  assert.equal(repeat.status, 200);
  const exhausted = await app.request(`/notebooks/share/${link.token}/join`, { method: "POST", headers: { "X-User-Id": "member-b" } });
  assert.equal(exhausted.status, 410);

  const member = db.prepare("SELECT status, source, sourceId FROM notebook_members WHERE notebookId = 'nb' AND userId = 'member-a'").get() as any;
  assert.equal(member.status, "active"); assert.equal(member.source, "invite_link"); assert.equal(member.sourceId, link.id);

  const revoked = await app.request("/notebooks/nb/share-link", { method: "DELETE", headers: { "X-User-Id": "owner" } });
  assert.equal(revoked.status, 200);
  const removed = db.prepare("SELECT status FROM notebook_members WHERE notebookId = 'nb' AND userId = 'member-a'").get() as any;
  assert.equal(removed.status, "removed");
});

test.after(() => {
  closeDb?.();
  fs.rmSync(dir, { recursive: true, force: true });
});
''',
)

print("Issue #308 sharing management patch applied")
