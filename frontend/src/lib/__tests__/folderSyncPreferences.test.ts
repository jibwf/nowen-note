import { describe, expect, it } from "vitest";
import {
  normalizeFolderSyncPreferences,
  sanitizeFolderSyncExcludePatterns,
} from "@/lib/folderSyncPreferences";

describe("folder sync advanced preferences", () => {
  it("accepts stop-tracking as an explicit conflict policy", () => {
    expect(normalizeFolderSyncPreferences({ conflictPolicy: "detach" }).conflictPolicy).toBe("detach");
  });

  it("falls back to safe defaults for unknown policies", () => {
    const normalized = normalizeFolderSyncPreferences({
      conflictPolicy: "merge" as any,
      deletionPolicy: "delete-permanently" as any,
    });
    expect(normalized.conflictPolicy).toBe("protect");
    expect(normalized.deletionPolicy).toBe("keep");
  });

  it("normalizes, de-duplicates and caps exclusion patterns", () => {
    const patterns = sanitizeFolderSyncExcludePatterns([
      "  **/draft/**  ",
      "**/draft/**",
      "private\\**",
      "# ignored comment",
      ...Array.from({ length: 20 }, (_, index) => `file-${index}.tmp`),
    ]);

    expect(patterns[0]).toBe("**/draft/**");
    expect(patterns[1]).toBe("private/**");
    expect(patterns).toHaveLength(10);
    expect(new Set(patterns).size).toBe(patterns.length);
  });
});
