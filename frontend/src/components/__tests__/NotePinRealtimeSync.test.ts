import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(path.resolve(__dirname, "../Sidebar.tsx"), "utf8");
const noteListSource = readFileSync(path.resolve(__dirname, "../NoteList.tsx"), "utf8");

describe("realtime note pin synchronization", () => {
  it("reconciles global pin state into the sidebar tree cache", () => {
    expect(sidebarSource).toContain("syncPinnedStateToNotebookCache(prev, state.notes)");
    expect(sidebarSource).toContain("state.activeNote ? [state.activeNote] : []");
  });

  it("updates the active note when pinning it from the directory list", () => {
    expect(noteListSource).toContain(
      "actions.setActiveNote({ ...state.activeNote, isPinned: newVal });",
    );
  });
});
