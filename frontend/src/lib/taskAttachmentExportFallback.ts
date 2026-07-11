import { toast } from "@/lib/toast";

const INSTALL_MARKER = "__nowenTaskAttachmentExportFallbackInstalled";
const TASK_ATTACHMENT_PATH_RE = /^\/api\/task-attachments\/([A-Za-z0-9_-]+)$/;

let pendingMissingCount = 0;
let warningTimer: number | null = null;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function matchTaskAttachment(url: string): { id: string } | null {
  try {
    const parsed = new URL(url, window.location.href);
    const match = parsed.pathname.match(TASK_ATTACHMENT_PATH_RE);
    return match ? { id: match[1] } : null;
  } catch {
    return null;
  }
}

function buildMissingImageSvg(attachmentId: string, status: number): string {
  const safeId = xmlEscape(attachmentId);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-label="任务图片已丢失">
  <rect width="960" height="540" rx="28" fill="#f8fafc"/>
  <rect x="28" y="28" width="904" height="484" rx="22" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="12 10"/>
  <circle cx="480" cy="205" r="54" fill="#fff7ed" stroke="#fb923c" stroke-width="3"/>
  <path d="M480 170v50" stroke="#ea580c" stroke-width="10" stroke-linecap="round"/>
  <circle cx="480" cy="238" r="6" fill="#ea580c"/>
  <text x="480" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#0f172a">原任务图片已丢失</text>
  <text x="480" y="354" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#64748b">备份已继续生成，并用此占位图替代失效引用</text>
  <text x="480" y="402" text-anchor="middle" font-family="monospace" font-size="15" fill="#94a3b8">attachment: ${safeId}</text>
  <text x="480" y="432" text-anchor="middle" font-family="monospace" font-size="14" fill="#c2410c">source HTTP ${status}</text>
</svg>`;
}

function scheduleMissingWarning(): void {
  pendingMissingCount += 1;
  if (warningTimer !== null) return;

  warningTimer = window.setTimeout(() => {
    const count = pendingMissingCount;
    pendingMissingCount = 0;
    warningTimer = null;
    toast.warning(
      `检测到 ${count} 张历史任务图片已失效，完整备份已使用“图片已丢失”占位图继续生成。`,
      6000,
    );
  }, 120);
}

/**
 * 待办完整备份会通过 fetch 读取 `/api/task-attachments/:id`。
 * 历史数据中可能存在“任务 Markdown 引用仍在，但附件行或物理文件已被删除”的坏引用。
 *
 * 仅对明确的 404 / 410 做降级：返回一张可见的 SVG 占位图，使整包导出继续完成，
 * 并在重新导入后把旧 404 地址替换成目标实例的新附件地址。
 * 401 / 403 / 5xx / 网络错误仍原样抛出，避免把权限或临时故障误判为永久丢失。
 *
 * 当前仓库中 JS fetch 读取 task-attachments 仅用于待办完整备份；普通任务图片渲染由
 * `<img src>` 发起，不经过此拦截器。
 */
export function installTaskAttachmentExportFallback(): void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;

  const target = window as Window & Record<string, unknown>;
  if (target[INSTALL_MARKER]) return;
  target[INSTALL_MARKER] = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = getRequestMethod(input, init);
    const matched = method === "GET" ? matchTaskAttachment(getRequestUrl(input)) : null;
    const response = await originalFetch(input, init);

    if (!matched || (response.status !== 404 && response.status !== 410)) return response;

    console.warn(
      `[task-backup] attachment ${matched.id} returned HTTP ${response.status}; using a visible placeholder`,
    );
    scheduleMissingWarning();

    return new Response(buildMissingImageSvg(matched.id, response.status), {
      status: 200,
      statusText: "Missing task attachment replaced for backup",
      headers: {
        "Content-Type": "image/svg+xml;charset=utf-8",
        "Cache-Control": "no-store",
        "X-Nowen-Task-Attachment-Placeholder": "missing",
        "X-Nowen-Original-Status": String(response.status),
      },
    });
  };
}
