import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Download,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  exportQueueDiagnostics,
  getFailedQueueItems,
  getQueue,
  retryFailedQueueItems,
  retryQueueItem,
  subscribe as subscribeOfflineQueue,
  type OfflineQueueItem,
} from "@/lib/offlineQueue";
import {
  getSyncSummary,
  subscribeSyncSummary,
  SYNC_SNAPSHOT_APPLIED_EVENT,
  type SyncSummary,
} from "@/lib/syncEngine";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useAppActions } from "@/store/AppContext";

function itemTypeLabel(item: OfflineQueueItem): string {
  if (item.type === "createNote") return "新建笔记";
  if (item.type === "deleteNote") return "删除笔记";
  return "更新笔记";
}

function downloadDiagnostics(): void {
  const blob = new Blob([exportQueueDiagnostics()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `nowen-sync-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function OfflineIndicator() {
  const actions = useAppActions();
  const { isOnline, wasOffline, pendingCount, flush } = useNetworkStatus();
  const [summary, setSummary] = useState<SyncSummary>(() => getSyncSummary());
  const [queue, setQueue] = useState<OfflineQueueItem[]>(() => getQueue());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [dismissedRecovery, setDismissedRecovery] = useState(false);

  useEffect(() => subscribeSyncSummary(setSummary), []);
  useEffect(() => subscribeOfflineQueue(() => setQueue(getQueue())), []);
  useEffect(() => {
    if (!wasOffline) setDismissedRecovery(false);
  }, [wasOffline]);

  useEffect(() => {
    const handleSnapshot = () => {
      actions.refreshNotes();
      actions.refreshNotebooks();
      api.getTags().then(actions.setTags).catch((error) => {
        console.warn("[OfflineIndicator] refresh tags after sync failed:", error);
      });
    };
    window.addEventListener(SYNC_SNAPSHOT_APPLIED_EVENT, handleSnapshot);
    return () => window.removeEventListener(SYNC_SNAPSHOT_APPLIED_EVENT, handleSnapshot);
  }, [actions]);

  const failedItems = useMemo(() => getFailedQueueItems(), [queue]);
  const conflictCount = failedItems.filter(
    (item) => item.conflict || item.errorCode === "VERSION_CONFLICT",
  ).length;

  const status = useMemo(() => {
    if (!isOnline) {
      return {
        tone: "offline" as const,
        label: pendingCount > 0 ? `离线 · ${pendingCount} 条待同步` : "当前离线",
        description: "恢复网络后会自动补拉服务端变更并重试队列。",
      };
    }
    if (summary.state === "bootstrapping") {
      return {
        tone: "syncing" as const,
        label: "正在同步",
        description: "正在等待服务器确认并刷新本地派生数据。",
      };
    }
    if (failedItems.length > 0 || summary.lastError) {
      return {
        tone: "error" as const,
        label: conflictCount > 0
          ? `${conflictCount} 条同步冲突待处理`
          : `${Math.max(failedItems.length, pendingCount)} 条同步失败`,
        description: summary.lastError || failedItems[0]?.message || "操作已保留在本地，未被静默丢弃。",
      };
    }
    if (pendingCount > 0) {
      return {
        tone: "pending" as const,
        label: `${pendingCount} 条待同步`,
        description: "服务器尚未确认完成，可点击立即重试。",
      };
    }
    if (wasOffline && !dismissedRecovery) {
      return {
        tone: "success" as const,
        label: "已恢复连接并完成校验",
        description: "列表、笔记本和标签状态已重新拉取。",
      };
    }
    return null;
  }, [conflictCount, dismissedRecovery, failedItems, isOnline, pendingCount, summary.lastError, summary.state, wasOffline]);

  const retryOne = useCallback(async (item: OfflineQueueItem) => {
    if (!isOnline || item.conflict || item.errorCode === "VERSION_CONFLICT") return;
    setRetryingId(item.id);
    try {
      if (retryQueueItem(item.id)) await flush(true);
    } finally {
      setRetryingId(null);
    }
  }, [flush, isOnline]);

  const retryAll = useCallback(async () => {
    if (!isOnline) return;
    setRetryingAll(true);
    try {
      retryFailedQueueItems();
      await flush(true);
    } finally {
      setRetryingAll(false);
    }
  }, [flush, isOnline]);

  if (!status) return null;

  const toneClasses = {
    offline: "border-zinc-300 bg-zinc-900 text-white dark:border-zinc-700",
    syncing: "border-blue-300 bg-blue-600 text-white dark:border-blue-800",
    error: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
    pending: "border-blue-200 bg-white text-zinc-900 dark:border-blue-900 dark:bg-zinc-900 dark:text-zinc-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  }[status.tone];

  const StatusIcon = status.tone === "offline"
    ? CloudOff
    : status.tone === "syncing"
      ? Loader2
      : status.tone === "error"
        ? AlertTriangle
        : status.tone === "success"
          ? CheckCircle2
          : RefreshCw;

  return (
    <div
      className="fixed right-3 z-[95] w-[min(420px,calc(100vw-24px))]"
      style={{ bottom: "calc(12px + var(--safe-area-bottom, 0px))" }}
    >
      {detailsOpen && (
        <section className="mb-2 max-h-[min(60vh,520px)] overflow-hidden rounded-2xl border border-app-border bg-app-elevated shadow-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-app-border px-4 py-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-tx-primary">同步队列</h3>
              <p className="mt-0.5 text-xs leading-5 text-tx-tertiary">
                成功项会在服务器 ACK 后移除；失败项保留本地内容，不会自动清空。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen(false)}
              className="rounded-lg p-1.5 text-tx-tertiary hover:bg-app-hover hover:text-tx-primary"
              aria-label="关闭同步详情"
            >
              <X size={15} />
            </button>
          </header>

          <div className="max-h-[360px] overflow-y-auto p-3">
            {queue.length === 0 ? (
              <div className="rounded-xl border border-dashed border-app-border px-4 py-8 text-center text-sm text-tx-tertiary">
                当前没有待同步操作
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((item) => {
                  const isConflict = item.conflict || item.errorCode === "VERSION_CONFLICT";
                  const canRetry = isOnline && !isConflict;
                  return (
                    <article key={item.id} className="rounded-xl border border-app-border bg-app-bg/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-tx-primary">{itemTypeLabel(item)}</span>
                            <span className="rounded-full bg-app-hover px-2 py-0.5 text-[10px] text-tx-tertiary">
                              重试 {item.retryCount} 次
                            </span>
                            {isConflict && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                                版本冲突
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate font-mono text-[10px] text-tx-tertiary" title={item.noteId}>
                            {item.noteId}
                          </p>
                          <p className="mt-1.5 text-xs leading-5 text-tx-secondary">
                            {item.message || (item.blocked ? "已暂停自动重试" : "等待服务器确认")}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!canRetry || retryingId === item.id}
                          onClick={() => void retryOne(item)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-app-border px-2.5 py-1.5 text-xs font-medium text-tx-secondary hover:bg-app-hover disabled:cursor-not-allowed disabled:opacity-40"
                          title={isConflict ? "版本冲突不能盲目重放，请先导出诊断或从版本历史处理" : "重试此项"}
                        >
                          {retryingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          重试
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-app-border px-3 py-2.5">
            <button
              type="button"
              onClick={downloadDiagnostics}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-tx-secondary hover:bg-app-hover"
            >
              <Download size={13} />
              导出诊断与本地副本
            </button>
            <button
              type="button"
              disabled={!isOnline || retryingAll || queue.every((item) => item.conflict || item.errorCode === "VERSION_CONFLICT")}
              onClick={() => void retryAll()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {retryingAll ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              重试全部可重试项
            </button>
          </footer>
        </section>
      )}

      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 shadow-lg ${toneClasses}`}>
        <StatusIcon size={16} className={status.tone === "syncing" ? "shrink-0 animate-spin" : "shrink-0"} />
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-xs font-semibold">{status.label}</span>
          <span className="block truncate text-[11px] opacity-75">{status.description}</span>
        </button>
        {status.tone === "success" && (
          <button
            type="button"
            onClick={() => setDismissedRecovery(true)}
            className="rounded-md p-1 opacity-70 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
            aria-label="关闭提示"
          >
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="rounded-md p-1 opacity-70 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
          aria-label="查看同步详情"
        >
          <ChevronDown size={14} className={detailsOpen ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>
    </div>
  );
}
