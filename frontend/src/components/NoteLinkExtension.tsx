/**
 * 笔记引用扩展
 *
 * 支持两种触发方式：
 *   - 输入 [[ 触发笔记搜索
 *   - 输入 @ 触发笔记搜索
 *
 * 引用格式：[[note:NOTE_ID|笔记标题]]
 * 显示为可点击的链接，点击打开目标笔记。
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Editor, Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { FileText, Search, Loader2 } from "lucide-react";

// 笔记搜索结果
interface NoteSearchResult {
  id: string;
  title: string;
  notebookId: string;
  updatedAt: string;
}

// 笔记引用菜单属性
interface NoteLinkMenuProps {
  editor: Editor;
  position: { top: number; left: number };
  query: string;
  onSelect: (note: NoteSearchResult) => void;
  onClose: () => void;
}

// 笔记引用菜单组件
function NoteLinkMenu({ editor, position, query, onSelect, onClose }: NoteLinkMenuProps) {
  const { t } = useTranslation();
  const [results, setResults] = useState<NoteSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 搜索笔记
  useEffect(() => {
    if (!query && query !== "") return;

    const searchNotes = async () => {
      setLoading(true);
      try {
        const data = await api.searchNotes(query, 10);
        setResults(data || []);
      } catch (err) {
        console.error("Failed to search notes:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    // 防抖
    const timer = setTimeout(searchNotes, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // 滚动选中项到可见区域
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, results.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(1, results.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [results, selectedIndex, onSelect, onClose]);

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-app-elevated rounded-lg border border-app-border shadow-lg overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        minWidth: 280,
        maxHeight: 300,
      }}
    >
      {/* 搜索输入框 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-app-border">
        <Search size={14} className="text-tx-tertiary" />
        <input
          type="text"
          value={query}
          readOnly
          className="flex-1 bg-transparent text-xs text-tx-primary outline-none placeholder:text-tx-tertiary"
          placeholder={t("noteLink.searchPlaceholder", { defaultValue: "搜索笔记..." })}
        />
        {loading && <Loader2 size={14} className="animate-spin text-tx-tertiary" />}
      </div>

      {/* 搜索结果 */}
      <div className="overflow-y-auto max-h-[250px]">
        {results.length === 0 && !loading ? (
          <div className="px-3 py-4 text-center text-xs text-tx-tertiary">
            {t("noteLink.noResults", { defaultValue: "没有找到匹配的笔记" })}
          </div>
        ) : (
          results.map((note, index) => (
            <button
              key={note.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              onClick={() => onSelect(note)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                index === selectedIndex
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "text-tx-secondary hover:bg-app-hover"
              )}
            >
              <FileText size={14} className="shrink-0" />
              <span className="flex-1 truncate">{note.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// 笔记引用扩展插件
const noteLinkPluginKey = new PluginKey("noteLink");

export function createNoteLinkExtension(
  onOpenNote: (noteId: string) => void
) {
  return Extension.create({
    name: "noteLink",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: noteLinkPluginKey,
          props: {
            handleKeyDown: (view, event) => {
              // 检测 [[ 触发
              const { state } = view;
              const { selection } = state;
              const { $from } = selection;

              // 获取当前行文本
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
              const isTrigger = textBefore.endsWith("[[");

              if (isTrigger && event.key === "[") {
                // 触发笔记搜索菜单
                // 这里需要通过事件通知外部组件显示菜单
                return false;
              }

              return false;
            },
            handleClick: (view, pos, event) => {
              // 检测点击笔记链接
              const { state } = view;
              const node = state.doc.nodeAt(pos);
              if (!node) return false;

              // 检查是否是带有 note-link 属性的链接
              const marks = node.marks;
              for (const mark of marks) {
                if (mark.type.name === "link") {
                  const href = mark.attrs.href;
                  if (href && href.startsWith("note:")) {
                    const noteId = href.slice(5);
                    onOpenNote(noteId);
                    return true;
                  }
                }
              }

              return false;
            },
          },
        }),
      ];
    },
  });
}

// 导出菜单组件供外部使用
export { NoteLinkMenu };
export type { NoteSearchResult };
