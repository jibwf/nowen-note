import type { Notebook } from "@/types";

export type NotebookSortBy = "manual" | "name" | "createdAt" | "updatedAt";
export type NotebookSortDir = "asc" | "desc";
export type NotebookSortPref = { by: NotebookSortBy; dir: NotebookSortDir };

export const DEFAULT_NOTEBOOK_SORT_PREF: NotebookSortPref = { by: "manual", dir: "desc" };

export function normalizeNotebookSortPref(raw: unknown): NotebookSortPref {
  if (!raw || typeof raw !== "object") return DEFAULT_NOTEBOOK_SORT_PREF;
  const input = raw as { by?: unknown; dir?: unknown };
  const by: NotebookSortBy =
    input.by === "name" || input.by === "createdAt" || input.by === "updatedAt" || input.by === "manual"
      ? input.by
      : "manual";
  const dir: NotebookSortDir = input.dir === "asc" ? "asc" : "desc";
  return { by, dir };
}

export function compareNotebooks(a: Notebook, b: Notebook, pref: NotebookSortPref): number {
  if (pref.by === "manual") {
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id);
  }

  const factor = pref.dir === "asc" ? 1 : -1;
  if (pref.by === "name") {
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }) * factor
      || a.id.localeCompare(b.id);
  }

  const av = a[pref.by] || "";
  const bv = b[pref.by] || "";
  return ((av < bv ? -1 : av > bv ? 1 : 0) * factor) || a.id.localeCompare(b.id);
}

export function buildNotebookTree(notebooks: Notebook[], pref: NotebookSortPref = DEFAULT_NOTEBOOK_SORT_PREF): Notebook[] {
  const map = new Map<string, Notebook>();
  const roots: Notebook[] = [];
  notebooks.forEach((nb) => map.set(nb.id, { ...nb, children: [] }));
  notebooks.forEach((nb) => {
    const node = map.get(nb.id)!;
    if (nb.parentId && map.has(nb.parentId)) {
      map.get(nb.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortRecursive = (list: Notebook[]) => {
    list.sort((a, b) => compareNotebooks(a, b, pref));
    list.forEach((n) => {
      if (n.children && n.children.length > 0) sortRecursive(n.children);
    });
  };
  sortRecursive(roots);
  return roots;
}

export function getNotebookDragHint(canDragSort: boolean): string {
  return canDragSort ? "拖动调整笔记本顺序" : "切换到手动排序后可拖动调整顺序";
}
