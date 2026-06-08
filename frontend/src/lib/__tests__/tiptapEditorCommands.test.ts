import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import {
  createPlainTextParagraphContainer,
  findAdjacentListJoinPositions,
  isAllowedRemoteImageUrl,
} from "@/lib/tiptapEditorCommands";

const listSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "inline*",
      group: "block",
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    },
    text: { group: "inline" },
    orderedList: {
      content: "listItem+",
      group: "block",
      attrs: { start: { default: 1 } },
      toDOM: (node) => ["ol", { start: node.attrs.start }, 0],
      parseDOM: [{ tag: "ol" }],
    },
    bulletList: {
      content: "listItem+",
      group: "block",
      toDOM: () => ["ul", 0],
      parseDOM: [{ tag: "ul" }],
    },
    listItem: {
      content: "paragraph block*",
      toDOM: () => ["li", 0],
      parseDOM: [{ tag: "li" }],
    },
  },
});

const p = (text: string) =>
  text
    ? listSchema.node("paragraph", null, listSchema.text(text))
    : listSchema.node("paragraph");
const li = (text: string) => listSchema.node("listItem", null, p(text));
const ol = (...items: string[]) => listSchema.node("orderedList", null, items.map(li));
const ul = (...items: string[]) => listSchema.node("bulletList", null, items.map(li));

describe("createPlainTextParagraphContainer", () => {
  it("turns CRLF multiline text into real paragraph elements", () => {
    const root = createPlainTextParagraphContainer("first\r\n\r\nthird");
    const paragraphs = Array.from(root.querySelectorAll("p"));

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs.map((node) => node.textContent)).toEqual(["first", "", "third"]);
    expect(paragraphs[1].querySelector("br")).not.toBeNull();
  });
});

describe("isAllowedRemoteImageUrl", () => {
  it("allows only http and https image URLs", () => {
    expect(isAllowedRemoteImageUrl("https://example.com/a.png")).toBe(true);
    expect(isAllowedRemoteImageUrl("http://example.com/a.png")).toBe(true);
    expect(isAllowedRemoteImageUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedRemoteImageUrl("data:image/png;base64,abc")).toBe(false);
    expect(isAllowedRemoteImageUrl("file:///C:/tmp/a.png")).toBe(false);
  });
});

describe("findAdjacentListJoinPositions", () => {
  it("finds adjacent ordered lists with matching attrs", () => {
    const doc = listSchema.node("doc", null, [ol("one"), ol("two")]);

    expect(findAdjacentListJoinPositions(doc)).toHaveLength(1);
  });

  it("does not join across a different list type", () => {
    const doc = listSchema.node("doc", null, [ol("one"), ul("nested"), ol("two")]);

    expect(findAdjacentListJoinPositions(doc)).toHaveLength(0);
  });
});
