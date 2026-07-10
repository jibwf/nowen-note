import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { SmilePlus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getLatestContextMenuState } from "@/hooks/useContextMenu";
import { realtime } from "@/lib/realtime";
import { toast } from "@/lib/toast";
import {
  getCachedNoteIcon,
  getNoteIconStoreVersion,
  primeNoteIcon,
  queueNoteIcons,
  refreshNoteIcons,
  setNoteIcon,
  subscribeNoteIcons,
} from "@/lib/noteIcons";

const PRESET_ICONS = [
  "📝", "📌", "📚", "💡", "✅", "⭐", "🔥", "🎯",
  "🚀", "💻", "🧠", "📅", "💼", "🏠", "❤️", "🔖",
  "📖", "✍️", "🗂️", "🔒", "🌱", "🎨", "📊", "🧩",
  "🔬", "🛠️", "🎵", "🌍", "💬", "📎", "🧪", "☕",
] as const;
const MAX_ICON_CODE_POINTS = 32;
const SNAPSHOT_LIMIT = 12;

type SnapshotNote = {
  id: string;
  title: string;
  isLocked?: number;
};

type NoteSnapshot = {
  notes: SnapshotNote[];
  capturedAt: number;
};

const snapshots: NoteSnapshot[] = [];
const snapshotListeners = new Set<() => void>();
let snapshotVersion = 0;

function emitSnapshots(): void {
  snapshotVersion += 1;
  for (const listener of snapshotListeners) {
    try { listener(); } catch { /* ignore isolated listeners */ }
  }
}

function captureSnapshot(rows: unknown): void {
  if (!Array.isArray(rows)) return;
  const notes = rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      title: typeof row.title === "string" ? row.title : "",
      isLocked: typeof row.isLocked === "number" ? row.isLocked : undefined,
    }))
    .filter((note) => note.id);
  if (notes.length === 0) return;

  const signature = notes.map((note) => note.id).join("|");
  const duplicateIndex = snapshots.findIndex(
    (snapshot) => snapshot.notes.map((note) => note.id).join("|") === signature,
  );
  if (duplicateIndex >= 0) snapshots.splice(duplicateIndex, 1);
  snapshots.unshift({ notes, capturedAt: Date.now() });
  if (snapshots.length > SNAPSHOT_LIMIT) snapshots.length = SNAPSHOT_LIMIT;
  emitSnapshots();
}

function subscribeSnapshots(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

function getSnapshotVersion(): number {
  return snapshotVersion;
}

// NoteList has several fetch paths (normal list, search, calendar badges). Capturing all recent
// responses lets the renderer choose the contiguous result set that best matches the visible cards.
const apiWithBridge = api as typeof api & { __noteIconSnapshotBridge?: boolean };
if (!apiWithBridge.__noteIconSnapshotBridge) {
  apiWithBridge.__noteIconSnapshotBridge = true;
  const apiAny = apiWithBridge as any;
  const originalGetNotes = apiAny.getNotes?.bind(apiAny);
  const originalSearch = apiAny.search?.bind(apiAny);

  if (originalGetNotes) {
    apiAny.getNotes = async (...args: unknown[]) => {
      const rows = await originalGetNotes(...args);
      captureSnapshot(rows);
      return rows;
    };
  }
  if (originalSearch) {
    apiAny.search = async (...args: unknown[]) => {
      const rows = await originalSearch(...args);
      captureSnapshot(rows);
      return rows;
    };
  }
}

function normalizeTitle(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function findBestVisibleNotes(titleElements: HTMLElement[]): SnapshotNote[] {
  if (titleElements.length === 0) return [];
  const visibleTitles = titleElements.map((element) => normalizeTitle(element.textContent));
  let best: { score: number; freshness: number; notes: SnapshotNote[] } | null = null;

  for (const snapshot of snapshots) {
    const source = snapshot.notes;
    if (source.length < visibleTitles.length) continue;
    for (let start = 0; start <= source.length - visibleTitles.length; start += 1) {
      let score = 0;
      for (let index = 0; index < visibleTitles.length; index += 1) {
        if (normalizeTitle(source[start + index]?.title) === visibleTitles[index]) score += 1;
      }
      if (!best || score > best.score || (score === best.score && snapshot.capturedAt > best.freshness)) {
        best = {
          score,
          freshness: snapshot.capturedAt,
          notes: source.slice(start, start + visibleTitles.length),
        };
      }
    }
  }

  const requiredScore = Math.max(1, Math.ceil(visibleTitles.length * 0.6));
  return best && best.score >= requiredScore ? best.notes : [];
}

function findContextMenuRoot(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("div.w-48.select-none"));
  return candidates.find((element) => element.style.position === "fixed" && element.style.zIndex === "100") || null;
}

function resolveKnownNote(noteId: string): SnapshotNote | null {
  for (const snapshot of snapshots) {
    const note = snapshot.notes.find((item) => item.id === noteId);
    if (note) return note;
  }
  return null;
}

function getLanguageCopy() {
  const language = (localStorage.getItem("i18nextLng") || navigator.language || "").toLowerCase();
  const isZh = language.startsWith("zh");
  return isZh ? {
    menu: "设置图标",
    title: "设置笔记图标",
    subtitle: "选择 emoji，或粘贴一个自定义短图标。",
    custom: "自定义图标",
    placeholder: "例如：📝",
    remove: "移除图标",
    cancel: "取消",
    save: "保存",
    saving: "保存中…",
    success: "笔记图标已更新",
    failed: "更新笔记图标失败",
    locked: "笔记已锁定，无法修改图标",
    invalid: `图标最多 ${MAX_ICON_CODE_POINTS} 个字符，且不能包含换行`,
  } : {
    menu: "Set icon",
    title: "Set note icon",
    subtitle: "Choose an emoji or paste a short custom icon.",
    custom: "Custom icon",
    placeholder: "For example: 📝",
    remove: "Remove icon",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    success: "Note icon updated",
    failed: "Failed to update note icon",
    locked: "This note is locked and its icon cannot be changed",
    invalid: `The icon must be at most ${MAX_ICON_CODE_POINTS} characters without line breaks`,
  };
}

export default function NoteIconFeatureBridge() {
  useSyncExternalStore(subscribeSnapshots, getSnapshotVersion, getSnapshotVersion);
  useSyncExternalStore(subscribeNoteIcons, getNoteIconStoreVersion, getNoteIconStoreVersion);

  const copy = useMemo(() => getLanguageCopy(), []);
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  const [menuNoteId, setMenuNoteId] = useState<string | null>(null);
  const [menuLocked, setMenuLocked] = useState(false);
  const [pickerNoteId, setPickerNoteId] = useState<string | null>(null);
  const [iconInput, setIconInput] = useState("");
  const [originalIcon, setOriginalIcon] = useState("");
  const [loadingIcon, setLoadingIcon] = useState(false);
  const [savingIcon, setSavingIcon] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const scheduledRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reconcileDom = useCallback(() => {
    if (scheduledRef.current !== null) return;
    scheduledRef.current = window.requestAnimationFrame(() => {
      scheduledRef.current = null;

      const titleElements = Array.from(document.querySelectorAll<HTMLElement>(".note-card-title"));
      const visibleNotes = findBestVisibleNotes(titleElements);
      const visibleIds = visibleNotes.map((note) => note.id);
      queueNoteIcons(visibleIds);

      titleElements.forEach((titleElement, index) => {
        const row = titleElement.parentElement;
        if (!row) return;
        row.querySelectorAll("[data-nowen-note-icon-badge]").forEach((element) => element.remove());
        row.removeAttribute("data-nowen-note-id");

        const note = visibleNotes[index];
        if (!note) return;
        row.setAttribute("data-nowen-note-id", note.id);
        const icon = getCachedNoteIcon(note.id);
        if (!icon) return;

        const badge = document.createElement("span");
        badge.setAttribute("data-nowen-note-icon-badge", "1");
        badge.setAttribute("role", "img");
        badge.setAttribute("aria-label", copy.menu);
        badge.className = "shrink-0 text-base leading-none select-none";
        badge.textContent = icon;
        row.insertBefore(badge, titleElement);
      });

      const menuState = getLatestContextMenuState();
      const root = menuState.isOpen && menuState.targetType === "note"
        ? findContextMenuRoot()
        : null;
      if (!root || !menuState.targetId) {
        setMenuHost(null);
        setMenuNoteId(null);
        setMenuLocked(false);
        return;
      }

      let host = root.querySelector<HTMLElement>("[data-nowen-note-icon-menu-host]");
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-nowen-note-icon-menu-host", "1");
        const header = root.firstElementChild as HTMLElement | null;
        if (header?.className.includes("border-b")) header.after(host);
        else root.prepend(host);
      }
      const known = resolveKnownNote(menuState.targetId);
      setMenuHost(host);
      setMenuNoteId(menuState.targetId);
      setMenuLocked(known?.isLocked === 1);
    });
  }, [copy.menu]);

  useEffect(() => {
    reconcileDom();
    const observer = new MutationObserver(reconcileDom);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const unsubscribeSnapshots = subscribeSnapshots(reconcileDom);
    const unsubscribeIcons = subscribeNoteIcons(reconcileDom);
    window.addEventListener("resize", reconcileDom);
    window.addEventListener("scroll", reconcileDom, true);
    return () => {
      observer.disconnect();
      unsubscribeSnapshots();
      unsubscribeIcons();
      window.removeEventListener("resize", reconcileDom);
      window.removeEventListener("scroll", reconcileDom, true);
      if (scheduledRef.current !== null) window.cancelAnimationFrame(scheduledRef.current);
    };
  }, [reconcileDom]);

  useEffect(() => realtime.on("note:list-updated", (message: any) => {
    const note = message?.note;
    if (!note?.id || !Object.prototype.hasOwnProperty.call(note, "icon")) return;
    primeNoteIcon(note.id, note.icon);
  }), []);

  useEffect(() => {
    const handleFocus = () => {
      const ids = Array.from(document.querySelectorAll<HTMLElement>("[data-nowen-note-id]"))
        .map((element) => element.dataset.nowenNoteId || "")
        .filter(Boolean);
      if (ids.length > 0) void refreshNoteIcons(ids);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const openPicker = useCallback((noteId: string) => {
    const known = resolveKnownNote(noteId);
    if (known?.isLocked === 1) {
      toast.warning(copy.locked);
      return;
    }
    const cached = getCachedNoteIcon(noteId) || "";
    setPickerNoteId(noteId);
    setIconInput(cached);
    setOriginalIcon(cached);
    setPickerError("");
    setLoadingIcon(true);
    void refreshNoteIcons([noteId]).finally(() => {
      const fresh = getCachedNoteIcon(noteId) || "";
      setIconInput(fresh);
      setOriginalIcon(fresh);
      setLoadingIcon(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    });
  }, [copy.locked]);

  const closePicker = useCallback(() => {
    if (savingIcon) return;
    setPickerNoteId(null);
    setPickerError("");
  }, [savingIcon]);

  useEffect(() => {
    if (!pickerNoteId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pickerNoteId, closePicker]);

  const normalizedIcon = iconInput.trim();
  const invalidIcon = /[\r\n\t]/.test(normalizedIcon)
    || Array.from(normalizedIcon).length > MAX_ICON_CODE_POINTS;
  const unchangedIcon = normalizedIcon === originalIcon.trim();

  const persistIcon = useCallback(async (nextIcon: string) => {
    if (!pickerNoteId || savingIcon) return;
    const normalized = nextIcon.trim();
    if (/[\r\n\t]/.test(normalized) || Array.from(normalized).length > MAX_ICON_CODE_POINTS) {
      setPickerError(copy.invalid);
      inputRef.current?.focus();
      return;
    }

    setSavingIcon(true);
    setPickerError("");
    try {
      await setNoteIcon(pickerNoteId, normalized || null);
      toast.success(copy.success);
      setPickerNoteId(null);
      reconcileDom();
    } catch (error: any) {
      const message = error?.code === "NOTE_LOCKED" ? copy.locked : (error?.message || copy.failed);
      setPickerError(message);
      toast.error(message);
    } finally {
      setSavingIcon(false);
    }
  }, [copy.failed, copy.invalid, copy.locked, copy.success, pickerNoteId, reconcileDom, savingIcon]);

  return (
    <>
      {menuHost && menuNoteId && createPortal(
        <button
          type="button"
          disabled={menuLocked}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (menuLocked) return;
            openPicker(menuNoteId);
            window.setTimeout(() => {
              document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            }, 0);
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 transition-colors duration-150 ease-out hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-tx-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <SmilePlus size={14} />
          </span>
          {copy.menu}
        </button>,
        menuHost,
      )}

      {pickerNoteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closePicker} />
          <div className="relative w-full max-w-[460px] overflow-hidden rounded-xl border border-app-border bg-app-elevated shadow-2xl">
            <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <SmilePlus size={16} className="shrink-0 text-accent-primary" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-tx-primary">{copy.title}</div>
                  <div className="mt-0.5 truncate text-[11px] text-tx-tertiary">{copy.subtitle}</div>
                </div>
              </div>
              <button
                type="button"
                disabled={savingIcon}
                onClick={closePicker}
                className="rounded-md p-1 text-tx-tertiary hover:bg-app-hover disabled:opacity-40"
                aria-label={copy.cancel}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
                {PRESET_ICONS.map((preset) => {
                  const selected = normalizedIcon === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={loadingIcon || savingIcon}
                      onClick={() => {
                        setIconInput(preset);
                        setPickerError("");
                      }}
                      className={`flex aspect-square items-center justify-center rounded-lg border text-xl transition-colors ${selected
                        ? "border-accent-primary bg-accent-primary/10"
                        : "border-app-border bg-app-bg hover:border-accent-primary/40 hover:bg-app-hover"}`}
                      aria-pressed={selected}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-tx-secondary">{copy.custom}</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={iconInput}
                  disabled={loadingIcon || savingIcon}
                  onChange={(event) => {
                    setIconInput(event.target.value);
                    if (pickerError) setPickerError("");
                  }}
                  placeholder={copy.placeholder}
                  className="w-full rounded-lg border border-app-border bg-app-bg px-3 py-2 text-lg text-tx-primary outline-none transition-colors placeholder:text-sm placeholder:text-tx-tertiary focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              {invalidIcon && <p className="text-xs text-red-500">{copy.invalid}</p>}
              {pickerError && <p className="text-xs text-red-500">{pickerError}</p>}
            </div>

            <div className="flex items-center justify-between border-t border-app-border px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loadingIcon || savingIcon || !originalIcon}
                onClick={() => void persistIcon("")}
                className="text-red-500 hover:text-red-600"
              >
                <Trash2 size={14} className="mr-1.5" />
                {copy.remove}
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={closePicker} disabled={savingIcon}>
                  {copy.cancel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={loadingIcon || savingIcon || invalidIcon || unchangedIcon}
                  onClick={() => void persistIcon(normalizedIcon)}
                  className="bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-40"
                >
                  {savingIcon ? copy.saving : copy.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
