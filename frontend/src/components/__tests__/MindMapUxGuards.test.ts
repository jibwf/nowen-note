import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/MindMapEditor.tsx"), "utf8");

describe("MindMapEditor UX guardrails", () => {
  it("uses pointer capture and rAF for canvas pan interactions", () => {
    expect(source).toContain("setPointerCapture");
    expect(source).toContain("releasePointerCapture");
    expect(source).toContain("panFrameRef");
    expect(source).toContain("requestAnimationFrame");
  });

  it("keeps box selection and canonical selected node ids wired", () => {
    expect(source).toContain("selectionRect");
    expect(source).toContain("hitTestSelection");
    expect(source).toContain("setSelectedNodeIds(ids)");
    expect(source).toContain("e.ctrlKey || e.metaKey || e.shiftKey");
  });

  it("deletes multi-selected non-root nodes through one guarded path", () => {
    expect(source).toContain("handleDeleteSelectedNodes");
    expect(source).toContain('.filter((id) => id !== "root")');
    expect(source).toContain("removeNodes(mapData.root, ids)");
  });

  it("hides the single-node toolbar for multi-selection", () => {
    expect(source).toContain("selectedNodeIds.length > 1 ? null");
  });
});
