import type { Editor } from "@tiptap/react";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { canJoin } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

export function createPlainTextParagraphContainer(text: string): HTMLDivElement {
  const root = document.createElement("div");
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  for (const line of lines) {
    const paragraph = document.createElement("p");
    if (line.length > 0) {
      paragraph.textContent = line;
    } else {
      paragraph.appendChild(document.createElement("br"));
    }
    root.appendChild(paragraph);
  }

  return root;
}

export function insertPlainTextPreservingParagraphs(view: EditorView, text: string): boolean {
  if (!text) return true;

  if (!/[\r\n]/.test(text)) {
    view.dispatch(view.state.tr.insertText(text));
    return true;
  }

  const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
  const slice = parser.parseSlice(createPlainTextParagraphContainer(text));
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}

export function isAllowedRemoteImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function attrsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

export function findAdjacentListJoinPositions(doc: any): number[] {
  const positions: number[] = [];

  const scanChildren = (parent: any, contentStart: number) => {
    if (!parent?.content || parent.childCount === 0) return;

    let offset = contentStart;
    let previous: any = null;
    for (let index = 0; index < parent.childCount; index += 1) {
      const child = parent.child(index);
      const isJoinableList =
        child.type.name === "orderedList" || child.type.name === "bulletList";

      if (
        previous &&
        isJoinableList &&
        previous.type.name === child.type.name &&
        attrsEqual(previous.attrs, child.attrs) &&
        canJoin(doc, offset)
      ) {
        positions.push(offset);
      }

      scanChildren(child, offset + 1);
      previous = child;
      offset += child.nodeSize;
    }
  };

  scanChildren(doc, 0);

  return positions;
}

export function normalizeAdjacentLists(editor: Editor): boolean {
  if (!editor || editor.isDestroyed) return false;

  const positions = findAdjacentListJoinPositions(editor.state.doc);
  if (positions.length === 0) return false;

  let tr = editor.state.tr;
  for (const pos of positions.sort((a, b) => b - a)) {
    tr = tr.join(pos);
  }
  editor.view.dispatch(tr);
  return true;
}

export function toggleOrderedListSmart(editor: Editor): boolean {
  const ok = editor.chain().focus().toggleOrderedList().run();
  if (ok) normalizeAdjacentLists(editor);
  return ok;
}

export function toggleBulletListSmart(editor: Editor): boolean {
  const ok = editor.chain().focus().toggleBulletList().run();
  if (ok) normalizeAdjacentLists(editor);
  return ok;
}
