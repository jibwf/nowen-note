import { Hono } from "hono";
import { getDb } from "../db/schema";
import { getUserWorkspaceRole } from "../middleware/acl";
import { buildFtsSearchTerm, hasHanText, splitSearchTerms } from "../lib/searchQuery";

const app = new Hono();

type SearchRow = {
  id: string;
  userId: string;
  notebookId: string;
  workspaceId: string | null;
  title: string;
  contentText?: string;
  updatedAt: string;
  isFavorite: number;
  isPinned: number;
  snippet: string;
  titleHtml: string;
  snippetHtml: string;
  score: number;
  matchedField?: "title" | "content" | "title+content";
  matchCount?: number;
  contentFormat?: string;
  notebookName?: string | null;
};

function escapeHtml(text: string): string {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSearchTerms(query: string): string[] {
  const terms = splitSearchTerms(query)
    .map((term) => term.trim())
    .filter(Boolean);
  return Array.from(new Set(terms.length > 0 ? terms : [query.trim()]))
    .sort((a, b) => b.length - a.length);
}

function countOccurrences(source: string, term: string): number {
  if (!source || !term) return 0;
  const haystack = source.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  let count = 0;
  let from = 0;
  while (from < haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    count += 1;
    from = index + Math.max(needle.length, 1);
  }
  return count;
}

function buildMatchMeta(title: string, contentText: string, query: string): {
  matchedField: "title" | "content" | "title+content";
  matchCount: number;
} {
  const terms = getSearchTerms(query);
  const titleCount = terms.reduce((sum, term) => sum + countOccurrences(title || "", term), 0);
  const contentCount = terms.reduce((sum, term) => sum + countOccurrences(contentText || "", term), 0);

  const matchedField = titleCount > 0 && contentCount > 0
    ? "title+content"
    : titleCount > 0
      ? "title"
      : "content";

  // FTS tokenization may match a normalized form that cannot be reproduced with a literal
  // substring count (for example punctuation-separated terms). A returned search row still
  // represents at least one match, so never expose a zero badge to the client.
  return { matchedField, matchCount: Math.max(1, titleCount + contentCount) };
}

function markPlainText(text: string, query: string): string {
  if (!text || !query) return escapeHtml(text || "");
  const terms = getSearchTerms(query).filter(Boolean);
  if (terms.length === 0) return escapeHtml(text);

  const matcher = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return text
    .split(matcher)
    .map((part, index) => index % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part))
    .join("");
}

function findFirstMatch(source: string, terms: string[]): { index: number; length: number } | null {
  if (!source) return null;
  const lowerSource = source.toLocaleLowerCase();
  let best: { index: number; length: number } | null = null;

  for (const term of terms) {
    const index = lowerSource.indexOf(term.toLocaleLowerCase());
    if (index < 0) continue;
    if (!best || index < best.index || (index === best.index && term.length > best.length)) {
      best = { index, length: term.length };
    }
  }
  return best;
}

function buildPlainSnippet(title: string, contentText: string, query: string): string {
  const terms = getSearchTerms(query);
  const contentMatch = findFirstMatch(contentText, terms);
  if (contentMatch) {
    const start = Math.max(0, contentMatch.index - 70);
    const end = Math.min(contentText.length, contentMatch.index + contentMatch.length + 150);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < contentText.length ? "..." : "";
    return `${prefix}${markPlainText(contentText.slice(start, end), query)}${suffix}`;
  }

  const titleMatch = findFirstMatch(title, terms);
  if (titleMatch) return markPlainText(title, query);

  const source = contentText || title || "";
  return markPlainText(source.slice(0, 220), query);
}

app.get("/", (c) => {
  const db = getDb();
  const userId = c.req.header("X-User-Id") || "demo";
  const q = (c.req.query("q") || "").trim();
  const workspaceId = c.req.query("workspaceId");
  if (!q) return c.json([]);

  const scopeParams: any[] = [];
  const scopeSql =
    workspaceId && workspaceId !== "personal"
      ? (() => {
          const role = getUserWorkspaceRole(workspaceId, userId);
          if (!role) return null;
          scopeParams.push(workspaceId);
          return "n.workspaceId = ?";
        })()
      : (() => {
          scopeParams.push(userId, userId, userId);
          return `((n.userId = ? AND n.workspaceId IS NULL)
            OR EXISTS (
              SELECT 1
              FROM notebook_members nm
              JOIN notebooks shared_nb ON shared_nb.id = nm.notebookId
              WHERE nm.notebookId = n.notebookId
                AND nm.userId = ?
                AND nm.status = 'active'
                AND shared_nb.userId <> ?
                AND shared_nb.isDeleted = 0
            ))`;
        })();

  if (!scopeSql) return c.json({ error: "无权访问该工作区" }, 403);

  const rows = new Map<string, SearchRow>();
  const searchTerm = buildFtsSearchTerm(q);

  if (searchTerm) {
    const ftsRows = db.prepare(`
      SELECT n.id, n.userId, n.notebookId, n.workspaceId, n.title, n.contentText, n.updatedAt,
        CASE WHEN EXISTS(SELECT 1 FROM favorites f WHERE f.noteId = n.id AND f.userId = ?) THEN 1 ELSE 0 END AS isFavorite,
        n.isPinned,
        snippet(notes_fts, 1, '<mark>', '</mark>', '...', 90) AS snippet,
        highlight(notes_fts, 0, '<mark>', '</mark>') AS titleHtml,
        snippet(notes_fts, 1, '<mark>', '</mark>', '...', 90) AS snippetHtml,
        rank AS score,
        n.contentFormat,
        nb.name AS notebookName
      FROM notes_fts
      JOIN notes n ON notes_fts.rowid = n.rowid
      LEFT JOIN notebooks nb ON nb.id = n.notebookId
      WHERE notes_fts MATCH ? AND ${scopeSql} AND n.isTrashed = 0
      ORDER BY rank
      LIMIT 100
    `).all(userId, searchTerm, ...scopeParams) as SearchRow[];

    for (const row of ftsRows) {
      rows.set(row.id, {
        ...row,
        ...buildMatchMeta(row.title, row.contentText || "", q),
      });
    }
  }

  if (hasHanText(q)) {
    // FTS5's default tokenizer is not reliable for every CJK phrase. Keep the existing
    // literal AND fallback, but return the same rich result contract as the FTS branch.
    const terms = splitSearchTerms(q).map((term) => term.trim()).filter(Boolean);
    if (terms.length > 0) {
      const andConditions = terms
        .map(() => `(n.title LIKE '%' || ? || '%' OR n.contentText LIKE '%' || ? || '%')`)
        .join(" AND ");
      const likeParams = terms.flatMap((term) => [term, term]);

      const likeRows = db.prepare(`
        SELECT n.id, n.userId, n.notebookId, n.workspaceId, n.title, n.contentText, n.updatedAt,
          CASE WHEN EXISTS(SELECT 1 FROM favorites f WHERE f.noteId = n.id AND f.userId = ?) THEN 1 ELSE 0 END AS isFavorite,
          n.isPinned,
          n.contentFormat,
          nb.name AS notebookName
        FROM notes n
        LEFT JOIN notebooks nb ON nb.id = n.notebookId
        WHERE ${scopeSql} AND n.isTrashed = 0
          AND (${andConditions})
        ORDER BY n.updatedAt DESC
        LIMIT 100
      `).all(userId, ...scopeParams, ...likeParams) as Array<SearchRow & { contentText: string }>;

      for (const row of likeRows) {
        if (rows.has(row.id)) continue;
        const snippetHtml = buildPlainSnippet(row.title, row.contentText || "", q);
        const matchMeta = buildMatchMeta(row.title, row.contentText || "", q);

        rows.set(row.id, {
          id: row.id,
          userId: row.userId,
          notebookId: row.notebookId,
          workspaceId: row.workspaceId,
          title: row.title,
          contentText: row.contentText,
          updatedAt: row.updatedAt,
          isFavorite: row.isFavorite,
          isPinned: row.isPinned,
          snippet: snippetHtml,
          titleHtml: markPlainText(row.title, q),
          snippetHtml,
          score: 10,
          contentFormat: row.contentFormat,
          notebookName: row.notebookName,
          ...matchMeta,
        });
      }
    }
  }

  return c.json(
    Array.from(rows.values())
      .sort((a, b) => a.score - b.score || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 100)
      .map(({ score, contentText: _contentText, ...row }) => ({
        ...row,
        matchedField: row.matchedField || "title+content",
        matchCount: Math.max(1, row.matchCount || 1),
      })),
  );
});

export default app;
