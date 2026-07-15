import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import EditorPane from "@/components/EditorPane";
import NoteTabsBar from "@/components/NoteTabsBar";
import TiptapEditor from "@/components/TiptapEditor";
import MarkdownEditor from "@/components/MarkdownEditor";
import type { NoteEditorHandle, NoteEditorUpdatePayload } from "@/components/editors/types";
import { useApp, useAppActions } from "@/store/AppContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { canWriteNote } from "@/lib/notePermissions";
import type { Note } from "@/types";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export default function EditorSplitView() {
  const { state } = useApp();
  const { prefs } = useUserPreferences();
  const split = state.editorSplit;
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const pendingRatioRef = useRef(0.5);
  const [splitRatio, setSplitRatio] = useState(0.5);

  useEffect(() => {
    setSplitRatio(0.5);
    pendingRatioRef.current = 0.5;
  }, [split?.direction, split?.noteId]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  const applySplitRatio = useCallback((ratio: number) => {
    pendingRatioRef.current = ratio;
    if (dragRafRef.current !== null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      const primary = `${pendingRatioRef.current * 100}%`;
      const secondary = `${(1 - pendingRatioRef.current) * 100}%`;
      splitContainerRef.current?.style.setProperty("--split-primary", primary);
      splitContainerRef.current?.style.setProperty("--split-secondary", secondary);
    });
  }, []);

  const startResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!split || event.button !== 0) return;
    event.preventDefault();

    const applyRatio = (clientX: number, clientY: number) => {
      const rect = splitContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = split.direction === "down"
        ? (clientY - rect.top) / rect.height
        : (clientX - rect.left) / rect.width;
      applySplitRatio(Math.max(0.2, Math.min(0.8, raw)));
    };

    applyRatio(event.clientX, event.clientY);
    const cursor = split.direction === "down" ? "row-resize" : "col-resize";
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";

    const onMouseMove = (moveEvent: MouseEvent) => {
      applyRatio(moveEvent.clientX, moveEvent.clientY);
    };
    const cleanup = () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      const finalRatio = pendingRatioRef.current;
      splitContainerRef.current?.style.setProperty("--split-primary", `${finalRatio * 100}%`);
      splitContainerRef.current?.style.setProperty("--split-secondary", `${(1 - finalRatio) * 100}%`);
      setSplitRatio(finalRatio);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", cleanup);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", cleanup);
  }, [applySplitRatio, split]);

  if (!split || !state.activeNote) return <EditorPane />;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-app-bg">
      {prefs.enableNoteTabs && <NoteTabsBar />}
      <div
        ref={splitContainerRef}
        style={{
          "--split-primary": `${splitRatio * 100}%`,
          "--split-secondary": `${(1 - splitRatio) * 100}%`,
        } as React.CSSProperties}
        className={cn(
          "flex-1 min-h-0 min-w-0 overflow-hidden",
          split.direction === "down" ? "flex flex-col" : "flex"
        )}
      >
        <div
          className="flex min-h-0 min-w-0 flex-none flex-col overflow-hidden"
          style={{ flexBasis: "var(--split-primary)" }}
        >
          <EditorPane />
        </div>
        <div
          role="separator"
          aria-orientation={split.direction === "down" ? "horizontal" : "vertical"}
          title={split.direction === "down" ? "上下拖动调整分屏" : "左右拖动调整分屏"}
          onMouseDown={startResize}
          className={cn(
            "group relative shrink-0 bg-app-border hover:bg-accent-primary/30 active:bg-accent-primary/40",
            split.direction === "down" ? "h-2 w-full cursor-row-resize" : "h-full w-2 cursor-col-resize"
          )}
        >
          <div
            className={cn(
              "absolute rounded-full bg-transparent transition-colors group-hover:bg-accent-primary/70",
              split.direction === "down"
                ? "left-1/2 top-1/2 h-0.5 w-12 -translate-x-1/2 -translate-y-1/2"
                : "left-1/2 top-1/2 h-12 w-0.5 -translate-x-1/2 -translate-y-1/2"
            )}
          />
        </div>
        <div
          className="min-h-0 min-w-0 flex-none overflow-hidden"
          style={{ flexBasis: "var(--split-secondary)" }}
        >
          <SplitEditorPane noteId={split.noteId} />
        </div>
      </div>
    </div>
  );
}

function SplitEditorPane({ noteId }: { noteId: string }) {
  const { state } = useApp();
  const actions = useAppActions();
  const { t } = useTranslation();
  const [note, setNote] = useState<Note | null>(() => state.activeNote?.id === noteId ? state.activeNote : null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const editorHandleRef = useRef<NoteEditorHandle | null>(null);
  const noteRef = useRef<Note | null>(note);
  noteRef.current = note;

  const tabMeta = useMemo(
    () => state.openNoteTabs.find((tab) => tab.id === noteId) || null,
    [noteId, state.openNoteTabs]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getNote(noteId)
      .then((loaded) => {
        if (cancelled) return;
        setNote(loaded);
        actions.openNoteTab({
          id: loaded.id,
          title: loaded.title,
          notebookId: loaded.notebookId,
          workspaceId: loaded.workspaceId,
          contentFormat: loaded.contentFormat,
          isLocked: loaded.isLocked,
          isTrashed: loaded.isTrashed,
          updatedAt: loaded.updatedAt,
          pinned: tabMeta?.pinned,
        });
      })
      .catch((err: any) => {
        if (!cancelled) toast.error(err?.message || t("editorTabs.splitLoadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actions, noteId, t, tabMeta?.pinned]);

  useEffect(() => {
    return () => {
      try { editorHandleRef.current?.flushSave?.(); } catch { /* ignore */ }
    };
  }, [noteId]);

  const handleUpdate = useCallback(async (data: NoteEditorUpdatePayload) => {
    const current = noteRef.current;
    if (!current || !canWriteNote(current) || (data._noteId && data._noteId !== current.id)) return;
    setSyncing(true);
    try {
      const updated = await api.updateNote(current.id, {
        title: data.title,
        content: data.content ?? current.content,
        contentText: data.contentText ?? current.contentText,
        contentFormat: current.contentFormat,
        version: current.version,
      } as any);
      setNote(updated);
      actions.updateNoteInList({
        id: updated.id,
        title: updated.title,
        contentText: updated.contentText,
        updatedAt: updated.updatedAt,
      });
      actions.updateNoteTab({
        id: updated.id,
        title: updated.title,
        updatedAt: updated.updatedAt,
        contentFormat: updated.contentFormat,
        isLocked: updated.isLocked,
        isTrashed: updated.isTrashed,
      });
      if (state.activeNote?.id === updated.id) {
        actions.setActiveNote(updated);
      }
    } catch (err: any) {
      toast.error(err?.message || t("editor.saveFailed"));
    } finally {
      setSyncing(false);
    }
  }, [actions, state.activeNote?.id, t]);

  const handleOpenNote = useCallback(async (targetNoteId: string) => {
    try {
      const target = await api.getNote(targetNoteId);
      actions.setActiveNote(target);
      actions.openNoteTab({
        id: target.id,
        title: target.title,
        notebookId: target.notebookId,
        workspaceId: target.workspaceId,
        contentFormat: target.contentFormat,
        isLocked: target.isLocked,
        isTrashed: target.isTrashed,
        updatedAt: target.updatedAt,
      });
    } catch (err: any) {
      toast.error(err?.message || t("noteList.createFailed"));
    }
  }, [actions, t]);

  const title = note?.title || tabMeta?.title || t("editorTabs.noTitle");
  const editable = !!note && canWriteNote(note) && !note.isLocked && !note.isTrashed;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-app-bg">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-app-border bg-app-surface/60 px-3">
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-tx-primary">{title}</div>
        {syncing && <Loader2 size={14} className="shrink-0 animate-spin text-tx-tertiary" />}
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tx-tertiary hover:bg-app-hover hover:text-tx-primary"
          onClick={() => actions.closeEditorSplit()}
          title={t("editorTabs.closeSplit")}
          aria-label={t("editorTabs.closeSplit")}
        >
          <X size={15} />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-app-bg/80 text-sm text-tx-tertiary">
            <Loader2 size={16} className="mr-2 animate-spin" />
            {t("editor.noteLoading")}
          </div>
        )}
        {note ? (
          note.contentFormat === "markdown" ? (
            <MarkdownEditor
              key={`split-md-${note.id}`}
              ref={editorHandleRef}
              note={note}
              onUpdate={handleUpdate}
              editable={editable}
              onOpenNote={handleOpenNote}
            />
          ) : (
            <TiptapEditor
              key={`split-rte-${note.id}`}
              ref={editorHandleRef}
              note={note}
              onUpdate={handleUpdate}
              editable={editable}
              onOpenNote={handleOpenNote}
              searchQuery={state.searchQuery}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-tx-tertiary">
            {t("editorTabs.splitLoadFailed")}
          </div>
        )}
      </div>
    </section>
  );
}
