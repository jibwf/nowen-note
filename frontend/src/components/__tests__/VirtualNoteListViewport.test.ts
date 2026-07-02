import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const noteListSource = readFileSync(
  path.resolve(__dirname, "../NoteList.tsx"),
  "utf8",
);

describe("VirtualNoteList scroll viewport", () => {
  it("给虚拟列表滚动容器标记专用 viewport", () => {
    const start = noteListSource.indexOf("function VirtualNoteList");
    const end = noteListSource.indexOf("function NoteList", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const virtualListSource = noteListSource.slice(start, end);
    expect(virtualListSource).toContain('data-note-list-scroll-viewport="virtual"');
  });
});
