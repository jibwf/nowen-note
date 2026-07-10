// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { markOfflineNoteSnapshot, clearOfflineNoteSnapshot } from "@/lib/offlineRead";
import { installNoteSyncSafety, NOTE_SYNC_PENDING_EVENT } from "@/lib/noteSyncSafety";

const INSTALL_KEY = "__NOWEN_NOTE_SYNC_SAFETY_V1__";
const realGetNote = api.getNote;
const realUpdateNote = api.updateNote;

function note(version: number, content = "server body") {
  return {
    id: "note-1",
    userId: "user-1",
    notebookId: "notebook-1",
    workspaceId: null,
    title: "Title",
    content,
    contentText: content,
    contentFormat: "markdown",
    version,
    isPinned: 0,
    isFavorite: 0,
    isLocked: 0,
    isArchived: 0,
    isTrashed: 0,
    sortOrder: 0,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    tags: [],
  } as any;
}

beforeEach(() => {
  localStorage.clear();
  clearOfflineNoteSnapshot("note-1");
  const uninstall = (window as any)[INSTALL_KEY] as (() => void) | undefined;
  uninstall?.();
  (api as any).getNote = realGetNote;
  (api as any).updateNote = realUpdateNote;
});

afterEach(() => {
  const uninstall = (window as any)[INSTALL_KEY] as (() => void) | undefined;
  uninstall?.();
  (api as any).getNote = realGetNote;
  (api as any).updateNote = realUpdateNote;
  clearOfflineNoteSnapshot("note-1");
});

describe("installed note sync safety", () => {
  it("does not report an optimistic offline response as server-confirmed", async () => {
    const transportUpdate = vi.fn().mockResolvedValue(note(4, "local body"));
    (api as any).getNote = vi.fn().mockResolvedValue(note(4));
    (api as any).updateNote = transportUpdate;
    installNoteSyncSafety();

    const pending = vi.fn();
    window.addEventListener(NOTE_SYNC_PENDING_EVENT, pending);
    await expect(api.updateNote("note-1", {
      version: 4,
      title: "Title",
      content: "local body",
      contentText: "local body",
      contentFormat: "markdown",
    } as any)).rejects.toMatchObject({
      code: "OFFLINE_WRITE_QUEUED",
      queued: true,
    });
    window.removeEventListener(NOTE_SYNC_PENDING_EVENT, pending);

    expect(transportUpdate).toHaveBeenCalledTimes(1);
    expect(pending).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("nowen-draft-note-1")).toContain("local body");
  });

  it("fetches the server revision and blocks PUT when an offline detail is stale", async () => {
    const transportGet = vi.fn().mockResolvedValue(note(9, "new server body"));
    const transportUpdate = vi.fn();
    (api as any).getNote = transportGet;
    (api as any).updateNote = transportUpdate;
    markOfflineNoteSnapshot(note(4, "old cached body"));
    installNoteSyncSafety();

    await expect(api.updateNote("note-1", {
      version: 4,
      title: "Title",
      content: "old cached body",
      contentText: "old cached body",
      contentFormat: "markdown",
    } as any)).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      currentVersion: 9,
    });

    expect(transportGet).toHaveBeenCalledTimes(1);
    expect(transportUpdate).not.toHaveBeenCalled();
    expect(localStorage.getItem("nowen-note-sync-conflicts:v1")).toContain("new server body");
  });

  it("allows a stale cached detail only after a fresh GET confirms the same revision", async () => {
    const transportGet = vi.fn().mockResolvedValue(note(4, "cached body"));
    const transportUpdate = vi.fn().mockResolvedValue(note(5, "edited body"));
    (api as any).getNote = transportGet;
    (api as any).updateNote = transportUpdate;
    markOfflineNoteSnapshot(note(4, "cached body"));
    installNoteSyncSafety();

    await expect(api.updateNote("note-1", {
      version: 4,
      title: "Title",
      content: "edited body",
      contentText: "edited body",
      contentFormat: "markdown",
    } as any)).resolves.toMatchObject({ version: 5, content: "edited body" });

    expect(transportGet).toHaveBeenCalledTimes(1);
    expect(transportUpdate).toHaveBeenCalledTimes(1);
  });
});
