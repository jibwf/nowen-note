import { afterEach, describe, expect, it, vi } from "vitest";
import { exportSingleNote, noteContentToExportHtml } from "@/lib/exportService";
import { api } from "@/lib/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("noteContentToExportHtml", () => {
  it("renders native Markdown notes to HTML for image export", () => {
    const markdown = [
      "# 一级标题",
      "",
      "正文段落",
      "",
      "## 二级标题",
      "",
      "- 第一条",
      "- 第二条",
      "",
      "> 引用内容",
      "",
      "```js",
      "console.log(\"hello\");",
      "```",
      "",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");

    const html = noteContentToExportHtml(markdown, "", "markdown");

    expect(html).toContain("<h1>一级标题</h1>");
    expect(html).toContain("<h2>二级标题</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<pre><code");
    expect(html).toContain("<table>");
    expect(html).not.toContain("# 一级标题");
  });
});

describe("exportSingleNote", () => {
  it("routes a note with attachments through the flat server ZIP job", async () => {
    vi.spyOn(api, "getNote").mockResolvedValue({
      id: "note-1",
      title: "资料分析模块",
      content: JSON.stringify({
        type: "doc",
        content: [{
          type: "image",
          attrs: { src: "/api/attachments/att-1", alt: "图" },
        }],
      }),
      contentText: "图",
      contentFormat: "tiptap-json",
      createdAt: "2026-07-11 10:00:00",
      updatedAt: "2026-07-11 10:00:00",
    } as Awaited<ReturnType<typeof api.getNote>>);
    const createJob = vi.spyOn(api, "createMarkdownExportJob").mockResolvedValue({
      job: {
        id: "job-1",
        state: "ready",
        current: 1,
        total: 1,
        message: "导出完成",
        filename: "资料分析模块.zip",
        downloadToken: "token-1",
        warnings: 0,
      },
    });
    const download = vi.spyOn(api, "downloadMarkdownExport").mockImplementation(() => {});

    await expect(exportSingleNote("note-1")).resolves.toBe(true);

    expect(createJob).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "note-1", title: "资料分析模块" })],
      expect.objectContaining({ layout: "flat", filenameBase: "资料分析模块" }),
    );
    expect(download).toHaveBeenCalledWith("token-1", "资料分析模块.zip");
  });
});
