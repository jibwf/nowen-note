import { describe, expect, it } from "vitest";
import type { Notebook } from "@/types";
import {
  buildNotebookTree,
  compareNotebooks,
  getNotebookDragHint,
  normalizeNotebookSortPref,
} from "@/lib/notebookSort";

const notebook = (id: string, overrides: Partial<Notebook> = {}): Notebook => ({
  id,
  userId: "user-1",
  workspaceId: null,
  parentId: null,
  name: id,
  description: null,
  icon: "📒",
  color: null,
  sortOrder: 0,
  isExpanded: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("buildNotebookTree", () => {
  it("keeps hierarchy while sorting siblings by name", () => {
    const tree = buildNotebookTree(
      [
        notebook("root-b", { name: "Beta", sortOrder: 0 }),
        notebook("child-z", { parentId: "root-a", name: "Zulu", sortOrder: 0 }),
        notebook("root-a", { name: "Alpha", sortOrder: 1 }),
        notebook("child-a", { parentId: "root-a", name: "Alpha child", sortOrder: 1 }),
      ],
      { by: "name", dir: "asc" },
    );

    expect(tree.map((nb) => nb.id)).toEqual(["root-a", "root-b"]);
    expect(tree[0].children?.map((nb) => nb.id)).toEqual(["child-a", "child-z"]);
  });

  it("uses manual sortOrder without changing source notebooks", () => {
    const source = [
      notebook("b", { sortOrder: 2 }),
      notebook("a", { sortOrder: 1 }),
    ];

    expect(buildNotebookTree(source, { by: "manual", dir: "desc" }).map((nb) => nb.id)).toEqual(["a", "b"]);
    expect(source[0].children).toBeUndefined();
  });
});

describe("compareNotebooks", () => {
  it("sorts dates according to direction", () => {
    const older = notebook("older", { createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = notebook("newer", { createdAt: "2026-02-01T00:00:00.000Z" });

    expect(compareNotebooks(older, newer, { by: "createdAt", dir: "asc" })).toBeLessThan(0);
    expect(compareNotebooks(older, newer, { by: "createdAt", dir: "desc" })).toBeGreaterThan(0);
  });
});

describe("normalizeNotebookSortPref", () => {
  it("falls back to manual desc for invalid input", () => {
    expect(normalizeNotebookSortPref({ by: "bad", dir: "bad" })).toEqual({ by: "manual", dir: "desc" });
  });
});

describe("getNotebookDragHint", () => {
  it("explains when notebook drag sorting is locked", () => {
    expect(getNotebookDragHint(false)).toBe("切换到手动排序后可拖动调整顺序");
  });
});
