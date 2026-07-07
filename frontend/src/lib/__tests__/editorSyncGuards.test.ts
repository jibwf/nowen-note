import { describe, expect, it } from "vitest";
import {
  isRemoteVersionNewer,
  shouldSkipUnchangedTitleOnlyUpdate,
} from "../editorSyncGuards";

describe("editor sync guards", () => {
  it("skips unchanged title-only updates", () => {
    expect(
      shouldSkipUnchangedTitleOnlyUpdate("Title", { title: "Title" }),
    ).toBe(true);
  });

  it("does not skip content saves or real title changes", () => {
    expect(
      shouldSkipUnchangedTitleOnlyUpdate("Title", {
        title: "Title",
        content: "body",
        contentText: "body",
      }),
    ).toBe(false);
    expect(
      shouldSkipUnchangedTitleOnlyUpdate("Title", { title: "New title" }),
    ).toBe(false);
  });

  it("detects newer remote versions for the active note only", () => {
    const current = { id: "note-1", version: 2 };

    expect(isRemoteVersionNewer(current, { noteId: "note-1", version: 3 })).toBe(true);
    expect(isRemoteVersionNewer(current, { id: "note-1", version: 3 })).toBe(true);
    expect(isRemoteVersionNewer(current, { noteId: "note-1", version: 2 })).toBe(false);
    expect(isRemoteVersionNewer(current, { noteId: "note-2", version: 4 })).toBe(false);
  });
});
