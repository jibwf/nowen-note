from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TIPTAP = ROOT / "frontend/src/components/TiptapEditor.tsx"
HELPER = ROOT / "frontend/src/lib/outlineScroll.ts"
TEST = ROOT / "frontend/src/lib/__tests__/outlineScroll.test.ts"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


helper_source = r'''export const OUTLINE_SCROLL_RESERVE_PROPERTY = "--outline-scroll-reserve";
export const DEFAULT_OUTLINE_SCROLL_GAP = 24;

export interface OutlineScrollMetrics {
  scrollTop: number;
  containerTop: number;
  targetTop: number;
  scrollHeight: number;
  clientHeight: number;
  topOffset?: number;
  gap?: number;
}

export interface OutlineReserveMetrics {
  desiredScrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  currentReserve?: number;
}

export function calculateOutlineDesiredScrollTop({
  scrollTop,
  containerTop,
  targetTop,
  topOffset = 0,
  gap = DEFAULT_OUTLINE_SCROLL_GAP,
}: Omit<OutlineScrollMetrics, "scrollHeight" | "clientHeight">): number {
  return scrollTop
    + targetTop
    - containerTop
    - Math.max(0, topOffset)
    - Math.max(0, gap);
}

export function calculateOutlineScrollTop(metrics: OutlineScrollMetrics): number {
  const desired = calculateOutlineDesiredScrollTop(metrics);
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  return Math.max(0, Math.min(desired, maxScrollTop));
}

/**
 * Return the minimum extra bottom padding needed to make the desired heading position
 * reachable. `scrollHeight` already contains `currentReserve`, so subtract it before
 * calculating the natural maximum scroll position.
 */
export function calculateRequiredOutlineReserve({
  desiredScrollTop,
  scrollHeight,
  clientHeight,
  currentReserve = 0,
}: OutlineReserveMetrics): number {
  const safeCurrentReserve = Math.max(0, currentReserve);
  const naturalScrollHeight = Math.max(0, scrollHeight - safeCurrentReserve);
  const naturalMaxScrollTop = Math.max(0, naturalScrollHeight - clientHeight);
  const required = Math.max(0, desiredScrollTop - naturalMaxScrollTop);
  return Math.max(safeCurrentReserve, Math.ceil(required));
}

function readCurrentReserve(container: HTMLElement): number {
  const raw = container.style.getPropertyValue(OUTLINE_SCROLL_RESERVE_PROPERTY);
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function calculateTopOverlayOverlap(
  containerRect: DOMRect,
  overlay: HTMLElement | null | undefined,
): number {
  if (!overlay) return 0;
  const overlayRect = overlay.getBoundingClientRect();
  // Only count an element that actually covers the scroll viewport's top edge.
  // A toolbar ending immediately above the viewport remains normal-flow content and
  // must not be subtracted a second time.
  if (overlayRect.top > containerRect.top + 1 || overlayRect.bottom <= containerRect.top) {
    return 0;
  }
  return Math.max(0, Math.min(containerRect.bottom, overlayRect.bottom) - containerRect.top);
}

export function clearOutlineScrollReserve(container: HTMLElement | null | undefined): void {
  container?.style.removeProperty(OUTLINE_SCROLL_RESERVE_PROPERTY);
}

export interface ScrollOutlineTargetOptions {
  container: HTMLElement;
  target: HTMLElement;
  topOverlay?: HTMLElement | null;
  gap?: number;
  behavior?: ScrollBehavior;
}

/**
 * Scroll a heading to one deterministic top anchor inside its real scroll container.
 *
 * Unlike Element.scrollIntoView(), this never delegates alignment to the browser's
 * nearest-edge heuristics. It also adds only the bottom reserve that is actually needed,
 * allowing the last heading to reach the same anchor as headings in the middle.
 */
export function scrollOutlineTargetIntoView({
  container,
  target,
  topOverlay = null,
  gap = DEFAULT_OUTLINE_SCROLL_GAP,
  behavior = "smooth",
}: ScrollOutlineTargetOptions): number {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const topOffset = calculateTopOverlayOverlap(containerRect, topOverlay);
  const desiredScrollTop = calculateOutlineDesiredScrollTop({
    scrollTop: container.scrollTop,
    containerTop: containerRect.top,
    targetTop: targetRect.top,
    topOffset,
    gap,
  });

  const currentReserve = readCurrentReserve(container);
  const requiredReserve = calculateRequiredOutlineReserve({
    desiredScrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
    currentReserve,
  });

  if (requiredReserve > currentReserve) {
    container.style.setProperty(
      OUTLINE_SCROLL_RESERVE_PROPERTY,
      `${requiredReserve}px`,
    );
  }

  // Reading scrollHeight after updating the CSS custom property forces the browser to
  // include the new padding before the final, single scroll operation.
  const top = calculateOutlineScrollTop({
    scrollTop: container.scrollTop,
    containerTop: containerRect.top,
    targetTop: targetRect.top,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
    topOffset,
    gap,
  });

  container.scrollTo({ top, behavior });
  return top;
}
'''


test_source = r'''import { describe, expect, it } from "vitest";
import {
  calculateOutlineDesiredScrollTop,
  calculateOutlineScrollTop,
  calculateRequiredOutlineReserve,
} from "../outlineScroll";

describe("outline scroll positioning", () => {
  it("uses the same anchor whether the heading starts above, inside or below the viewport", () => {
    const states = [
      { scrollTop: 0, targetTop: 700 },
      { scrollTop: 500, targetTop: 200 },
      { scrollTop: 700, targetTop: 0 },
    ];

    const positions = states.map((state) => calculateOutlineDesiredScrollTop({
      ...state,
      containerTop: 100,
      topOffset: 0,
      gap: 24,
    }));

    expect(positions).toEqual([576, 576, 576]);
  });

  it("subtracts only the explicit top overlap and safety gap", () => {
    expect(calculateOutlineDesiredScrollTop({
      scrollTop: 320,
      containerTop: 120,
      targetTop: 460,
      topOffset: 48,
      gap: 20,
    })).toBe(592);
  });

  it("clamps the destination to the available scroll range", () => {
    expect(calculateOutlineScrollTop({
      scrollTop: 0,
      containerTop: 100,
      targetTop: 20,
      scrollHeight: 1200,
      clientHeight: 500,
      gap: 24,
    })).toBe(0);

    expect(calculateOutlineScrollTop({
      scrollTop: 0,
      containerTop: 100,
      targetTop: 1200,
      scrollHeight: 1000,
      clientHeight: 400,
      gap: 24,
    })).toBe(600);
  });

  it("adds the minimum reserve required for a final heading to reach the anchor", () => {
    const reserve = calculateRequiredOutlineReserve({
      desiredScrollTop: 900,
      scrollHeight: 1000,
      clientHeight: 400,
    });
    expect(reserve).toBe(300);

    expect(calculateOutlineScrollTop({
      scrollTop: 0,
      containerTop: 0,
      targetTop: 924,
      scrollHeight: 1000 + reserve,
      clientHeight: 400,
      gap: 24,
    })).toBe(900);
  });

  it("keeps an existing reserve to avoid a second layout jump during rapid navigation", () => {
    expect(calculateRequiredOutlineReserve({
      desiredScrollTop: 200,
      scrollHeight: 1300,
      clientHeight: 400,
      currentReserve: 300,
    })).toBe(300);
  });
});
'''


source = TIPTAP.read_text(encoding="utf-8")

source = replace_once(
    source,
    '''} from "@/lib/asyncEditorInsert";

import { useTranslation } from "react-i18next";''',
    '''} from "@/lib/asyncEditorInsert";
import {
  clearOutlineScrollReserve,
  scrollOutlineTargetIntoView,
} from "@/lib/outlineScroll";

import { useTranslation } from "react-i18next";''',
    "outline helper import",
)

source = replace_once(
    source,
    '''  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  // 防止 setContent 触发 onUpdate 导致无限循环''',
    '''  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const outlineToolbarRef = useRef<HTMLDivElement | null>(null);
  const outlineScrollRequestRef = useRef(0);
  // 防止 setContent 触发 onUpdate 导致无限循环''',
    "outline refs",
)

old_scroll_effect = '''  // Provide scrollTo callback to parent
  useEffect(() => {
    if (!editor) return;
    const scrollTo = (pos: number) => {
      editor.commands.focus();
      editor.commands.setTextSelection(pos);
      // Scroll the heading node into view
      const dom = editor.view.domAtPos(pos + 1);
      if (dom?.node) {
        const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    onEditorReady?.(scrollTo);
  }, [editor, onEditorReady]);'''

new_scroll_effect = '''  // Provide a deterministic outline scroll callback to the parent.
  // Selection updates and scrolling have one owner each: ProseMirror receives a
  // non-scrolling transaction, then the actual editor container is moved exactly once.
  useEffect(() => {
    if (!editor) return;
    const scrollTo = (pos: number) => {
      if (editor.isDestroyed) return;
      const docSize = editor.state.doc.content.size;
      const clamped = Math.max(0, Math.min(docSize, pos));
      const requestId = ++outlineScrollRequestRef.current;

      try {
        const selection = TextSelection.near(editor.state.doc.resolve(clamped), 1);
        editor.view.dispatch(editor.state.tr.setSelection(selection));
      } catch {
        // A stale outline position can briefly exist while the heading list updates.
        return;
      }

      // Focusing through Tiptap commands may invoke ProseMirror's nearest-edge scrolling.
      // Focus the DOM directly and explicitly prevent that implicit first scroll.
      try {
        editor.view.dom.focus({ preventScroll: true });
      } catch {
        editor.view.focus();
      }

      requestAnimationFrame(() => {
        if (editor.isDestroyed || requestId !== outlineScrollRequestRef.current) return;
        const container = scrollContainerRef.current || editorScrollRef.current;
        if (!container) return;

        const nodeDom = editor.view.nodeDOM(clamped);
        const nodeElement = nodeDom instanceof HTMLElement
          ? nodeDom
          : nodeDom?.parentElement ?? null;
        let target = nodeElement?.matches("h1, h2, h3, h4, h5, h6")
          ? nodeElement
          : nodeElement?.closest<HTMLElement>("h1, h2, h3, h4, h5, h6") ?? null;

        if (!target) {
          const fallbackPos = Math.min(docSize, clamped + 1);
          const dom = editor.view.domAtPos(fallbackPos);
          const fallbackElement = dom.node instanceof HTMLElement
            ? dom.node
            : dom.node.parentElement;
          target = fallbackElement?.matches("h1, h2, h3, h4, h5, h6")
            ? fallbackElement
            : fallbackElement?.closest<HTMLElement>("h1, h2, h3, h4, h5, h6") ?? null;
        }
        if (!target) return;

        scrollOutlineTargetIntoView({
          container,
          target,
          topOverlay: outlineToolbarRef.current,
          gap: 24,
          behavior: "smooth",
        });
      });
    };
    onEditorReady?.(scrollTo);
    return () => {
      outlineScrollRequestRef.current += 1;
    };
  }, [editor, onEditorReady]);'''

source = replace_once(source, old_scroll_effect, new_scroll_effect, "Tiptap outline callback")

source = replace_once(
    source,
    '''  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const el = scrollContainerRef.current;''',
    '''  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    clearOutlineScrollReserve(el);
    return () => clearOutlineScrollReserve(el);
  }, [note.id]);
  useEffect(() => {
    const el = scrollContainerRef.current;''',
    "outline reserve lifecycle",
)

source = replace_once(
    source,
    '''      <div
        className={cn(
          "editor-toolbar-scroll-fade hide-scrollbar sticky top-0 z-20''',
    '''      <div
        ref={outlineToolbarRef}
        className={cn(
          "editor-toolbar-scroll-fade hide-scrollbar sticky top-0 z-20''',
    "toolbar ref",
)

source = replace_once(
    source,
    '''style={{ paddingBottom: "calc(3rem + var(--keyboard-height, 0px))" }}''',
    '''style={{ paddingBottom: "calc(3rem + var(--keyboard-height, 0px) + var(--outline-scroll-reserve, 0px))" }}''',
    "outline bottom reserve style",
)

TIPTAP.write_text(source, encoding="utf-8")
HELPER.write_text(helper_source, encoding="utf-8")
TEST.parent.mkdir(parents=True, exist_ok=True)
TEST.write_text(test_source, encoding="utf-8")

print("Applied issue #313 outline navigation fix")
