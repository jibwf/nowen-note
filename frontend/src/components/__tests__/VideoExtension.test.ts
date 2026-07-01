import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { describe, expect, it } from "vitest";

import { getVideoDisplayStyle, Video } from "@/components/VideoExtension";

describe("VideoExtension file uploads", () => {
  it("inserts uploaded video attachments as file video nodes", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Video],
      content: "<p>hello</p>",
    });

    const ok = (editor.commands as any).setVideoFile({
      previewUrl: "/api/attachments/att-video?inline=1",
      url: "/api/attachments/att-video",
      attachmentId: "att-video",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      size: 1024,
    });

    expect(ok).toBe(true);
    const videoNode = editor.getJSON().content?.find((node) => node.type === "video");
    expect(videoNode?.attrs).toMatchObject({
      src: "/api/attachments/att-video?inline=1",
      originalUrl: "/api/attachments/att-video",
      platform: "file",
      kind: "file",
      attachmentId: "att-video",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      size: 1024,
    });
    expect(editor.getHTML()).toContain("playsinline");
  });

  it("uses a compact portrait card for vertical video ratios", () => {
    const style = getVideoDisplayStyle(9 / 16);

    expect(style.wrapper.maxWidth).toBe("min(320px, 100%)");
    expect(style.video.width).toBe("min(320px, calc(100vw - 48px))");
    expect(style.video.aspectRatio).toBe(String(9 / 16));
  });

  it("uses a medium card for landscape video ratios", () => {
    const style = getVideoDisplayStyle(16 / 9);

    expect(style.wrapper.maxWidth).toBe("min(640px, 100%)");
    expect(style.video.width).toBe("min(640px, 100%)");
    expect(style.video.aspectRatio).toBe(String(16 / 9));
  });

  it("uses a compact fallback before video metadata is loaded", () => {
    const style = getVideoDisplayStyle(null);

    expect(style.wrapper.maxWidth).toBe("min(480px, 100%)");
    expect(style.video.width).toBe("min(480px, 100%)");
    expect(style.video.aspectRatio).toBe("16 / 9");
  });
});
