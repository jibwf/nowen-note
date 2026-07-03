import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  cleanSiyuanMarkdownWithReport,
  cleanSiyuanMarkdown,
  collectMarkdownAssetRefs,
  enhanceSiyuanImageMap,
  inspectSiyuanZip,
  isSiyuanMarkdownZip,
  isSiyuanSyZip,
  normalizeAssetRef,
  readSiyuanMarkdownZip,
} from "@/lib/siyuanImportService";

async function makeZipFile(entries: Record<string, string | Uint8Array>, name = "siyuan-export.zip"): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name, { type: "application/zip" });
}

describe("siyuanImportService", () => {
  it("detects a Markdown zip with an assets directory as a Siyuan Markdown export", () => {
    expect(isSiyuanMarkdownZip(["Notebook/Doc.md", "Notebook/assets/a.png"])).toBe(true);
    expect(isSiyuanMarkdownZip(["Notebook/Doc.md"])).toBe(false);
  });

  it("detects Siyuan .sy packages separately", () => {
    expect(isSiyuanSyZip(["data/20240101000000.sy"])).toBe(true);
    expect(isSiyuanSyZip(["Notebook/Doc.md"])).toBe(false);
  });

  it("detects Siyuan Markdown content markers even without assets", async () => {
    const file = await makeZipFile({
      "Notebook/Doc.md": "段落\n{: id=\"20240101000000-abcdefg\"}\n",
    });

    const inspection = await inspectSiyuanZip(file);

    expect(inspection.hasMarkdownFiles).toBe(true);
    expect(inspection.isSiyuanMarkdownZip).toBe(true);
  });

  it("cleans block attributes and safely degrades links and block refs", () => {
    const cleaned = cleanSiyuanMarkdown([
      "# 标题 {: id=\"heading-id\"}",
      "",
      "正文 ((20240101000000-abcdefg \"引用文字\")) 和 [[双链笔记]]",
      "{: id=\"block-id\" updated=\"20240101000000\"}",
      "",
      "#标签#",
    ].join("\n"));

    expect(cleaned).toContain("# 标题");
    expect(cleaned).not.toContain("{: id=");
    expect(cleaned).toContain("引用文字");
    expect(cleaned).toContain("[双链笔记](");
    expect(cleaned).toContain("#标签#");
  });

  it("reports markdown cleanup counts and detected tags", () => {
    const result = cleanSiyuanMarkdownWithReport([
      "# 标题",
      "",
      "正文 #项目# #读书笔记# [[双链笔记]] [[另一个笔记]]",
      "继续 ((20240101000000-abcdefg \"引用文字\")) 和 ((20240101000001-hijklmn))",
      "{: id=\"block-id\" updated=\"20240101000000\"}",
      "段落 {: id=\"inline-id\"}",
      "",
      "## 二级标题",
    ].join("\n"));

    expect(result.cleanedBlockAttrs).toBe(2);
    expect(result.convertedWikiLinks).toBe(2);
    expect(result.convertedBlockRefs).toBe(2);
    expect(result.detectedTags).toEqual(["读书笔记", "项目"]);
    expect(result.detectedTags).not.toContain("标题");
    expect(result.markdown).toContain("[双链笔记](");
    expect(result.markdown).toContain("引用文字");
  });

  it("normalizes real-world Siyuan asset references", () => {
    expect(normalizeAssetRef("assets/a.png")).toContain("assets/a.png");
    expect(normalizeAssetRef("./assets/a.png")).toContain("assets/a.png");
    expect(normalizeAssetRef("../assets/a.png")).toContain("assets/a.png");
    expect(normalizeAssetRef("assets/a%20b.png")).toContain("assets/a b.png");
    expect(normalizeAssetRef("assets/%E4%B8%AD%E6%96%87%20%E5%9B%BE%E7%89%87.png")).toContain("assets/中文 图片.png");
    expect(normalizeAssetRef("assets/a.png?updated=123")).toContain("assets/a.png");
    expect(normalizeAssetRef("assets/a.png#hash")).toContain("assets/a.png");
    expect(normalizeAssetRef("Notebook\\assets\\a.png")).toContain("assets/a.png");
  });

  it("collects asset refs from Markdown and HTML", () => {
    const refs = collectMarkdownAssetRefs([
      "![pic](assets/a.png?updated=123)",
      "[file](assets/doc.pdf)",
      "<img src=\"./assets/b.png#hash\">",
      "<a href='../assets/c.zip'>附件</a>",
      "[external](https://example.com/assets/nope.png)",
    ].join("\n"));

    expect(refs).toContain("assets/a.png");
    expect(refs).toContain("assets/doc.pdf");
    expect(refs).toContain("./assets/b.png");
    expect(refs).toContain("../assets/c.zip");
    expect(refs.some((ref) => ref.includes("example.com"))).toBe(false);
  });

  it("adds assets image aliases relative to the note path", () => {
    const enhanced = enhanceSiyuanImageMap(
      {
        "Notebook/assets/a.png": "data:image/png;base64,aaa",
        "Notebook/assets/a b.png": "data:image/png;base64,bbb",
        "Notebook/assets/中文 图片.png": "data:image/png;base64,ccc",
      },
      "Notebook/Doc.md",
    );

    expect(enhanced?.["assets/a.png"]).toBe("data:image/png;base64,aaa");
    expect(enhanced?.["a.png"]).toBe("data:image/png;base64,aaa");
    expect(enhanced?.["assets/a b.png"]).toBe("data:image/png;base64,bbb");
    expect(enhanced?.["assets/中文 图片.png"]).toBe("data:image/png;base64,ccc");
  });

  it("reads Siyuan Markdown zip files as ImportFileInfo while preserving hierarchy", async () => {
    const file = await makeZipFile({
      "Notebook/Section/Doc.md": [
        "# Doc",
        "",
        "![pic](assets/a.png?updated=123)",
        "![中文](assets/%E4%B8%AD%E6%96%87%20%E5%9B%BE%E7%89%87.png)",
        "<img src=\"./assets/a b.png#hash\">",
        "![missing](assets/missing.png)",
        "[attachment](assets/doc.pdf)",
        "#项目# #项目# #工作#",
        "[[双链笔记]]",
        "",
        "((20240101000000-abcdefg))",
        "{: id=\"block-id\"}",
      ].join("\n"),
      "Notebook/Section/assets/a.png": new Uint8Array([1, 2, 3]),
      "Notebook/Section/assets/a b.png": new Uint8Array([4, 5, 6]),
      "Notebook/Section/assets/中文 图片.png": new Uint8Array([7, 8, 9]),
      "Notebook/Section/20240101000000.sy": JSON.stringify({ Type: "NodeDocument" }),
    });

    const result = await readSiyuanMarkdownZip(file);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].source).toBe("siyuan");
    expect(result.files[0].title).toBe("Doc");
    expect(result.files[0].notebookPath).toContain("Notebook");
    expect(result.files[0].notebookPath).toContain("Section");
    expect(result.files[0].content).not.toContain("{: id=");
    expect(result.files[0].content).toContain("[块引用:");
    expect(result.files[0].imageMap?.["assets/a.png"]).toMatch(/^data:image\/png;base64,/);
    expect(result.files[0].imageMap?.["assets/a b.png"]).toMatch(/^data:image\/png;base64,/);
    expect(result.files[0].imageMap?.["assets/中文 图片.png"]).toMatch(/^data:image\/png;base64,/);
    expect(result.report.totalMarkdownFiles).toBe(1);
    expect(result.report.totalSyFiles).toBe(1);
    expect(result.report.cleanedBlockAttrs).toBe(1);
    expect(result.report.convertedWikiLinks).toBe(1);
    expect(result.report.convertedBlockRefs).toBe(1);
    expect(result.report.detectedTags).toEqual(["工作", "项目"]);
    expect(result.report.unresolvedAssets).toEqual(["assets/missing.png"]);
    expect(result.report.unsupportedFiles).toEqual(["assets/doc.pdf"]);
    expect(result.warnings).toContain("siyuanSyNotSupported");
  });

  it("reports .sy files without treating a sy-only zip as Markdown import", async () => {
    const file = await makeZipFile({
      "data/20240101000000.sy": JSON.stringify({ Type: "NodeDocument" }),
    });

    const inspection = await inspectSiyuanZip(file);

    expect(inspection.hasSyFiles).toBe(true);
    expect(inspection.hasMarkdownFiles).toBe(false);
    expect(inspection.isSiyuanMarkdownZip).toBe(false);
  });
});
