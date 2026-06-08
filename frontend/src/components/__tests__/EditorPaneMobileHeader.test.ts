import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editorPaneSource = readFileSync(
  path.resolve(__dirname, "../EditorPane.tsx"),
  "utf8",
);

function mobileHeaderSource() {
  const start = editorPaneSource.indexOf("{/* Mobile Editor Header");
  const end = editorPaneSource.indexOf("{/* Mobile Outline Panel");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return editorPaneSource.slice(start, end);
}

describe("EditorPane mobile header", () => {
  it("pins lock toggle before search and keeps it out of the mobile more menu", () => {
    const header = mobileHeaderSource();
    const lockButton = header.indexOf("onClick={toggleLock}");
    const searchButton = header.indexOf("nowen:open-search");
    const moreMenu = header.slice(header.indexOf("{showMobileMenu && ("));

    expect(lockButton).toBeGreaterThanOrEqual(0);
    expect(searchButton).toBeGreaterThan(lockButton);
    expect(moreMenu).not.toContain("toggleLock()");
  });
});
