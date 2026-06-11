/**
 * 服务器地址工具
 *
 * 核心概念：serverBaseUrl = protocol://host[:port][/path-prefix]
 *   - 不含 /api 后缀（由 getBaseUrl() 拼接）
 *   - 不含末尾斜杠
 *   - 保留 path 前缀（用于 fnOS / 樱花穿透 / 反代路径场景）
 *
 * 示例：
 *   http://192.168.1.10:3001
 *   https://fnos.net/user:3001
 *   https://example.com
 */

export type ServerScheme = "http" | "https";

// =====================================================================
//  新 API：normalizeServerBaseUrl
// =====================================================================

/**
 * 识别 path 末尾的 API 子路径并剥离。
 *
 * 规则：pathname 末尾匹配以下模式之一时，截断到该位置之前：
 *   /api/health
 *   /api/version
 *   /api/auth/login  （/api/auth/...）
 *   /api/settings
 *   /api             （单独的 /api）
 *
 * 但不误删：
 *   /api-gateway
 *   /my-api
 *   /user:3001
 *
 * 实现：从 pathname 末尾向前找 "/api" 段，且该段必须是独立路径段
 *       （前一个字符必须是 / 或字符串开头）。
 */
function stripApiSuffix(pathname: string): string {
  // 匹配末尾的 /api 或 /api/... 子路径
  // 正则：在 /api 之前必须是 / 或字符串开头，/api 后面必须是 / 或结尾
  const apiSuffixRe = /\/api(\/.*)?$/;
  const match = pathname.match(apiSuffixRe);
  if (!match) return pathname;
  return pathname.slice(0, match.index) || "";
}

/**
 * 将用户输入的任意格式服务器地址归一化为标准 serverBaseUrl。
 *
 * 容错范围：
 *   - 补 scheme（无 scheme 默认 http://）
 *   - 去末尾 /
 *   - 剥离 API 子路径（/api/health → 去掉）
 *   - 保留反代路径前缀（/user:3001 → 保留）
 *   - 过滤非法值（null / file:// / 空串）
 *
 * 不抛异常，解析失败返回空串。
 */
export function normalizeServerBaseUrl(input: string | null | undefined): string {
  if (!input) return "";
  const raw = input.trim();
  if (!raw) return "";

  // 过滤非法值
  if (raw === "null" || raw === "undefined" || raw === "file://" || raw.startsWith("file:")) {
    return "";
  }

  // 补 scheme
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;

  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return "";
  }

  // 只接受 http/https
  if (u.protocol !== "http:" && u.protocol !== "https:") return "";

  const protocol = u.protocol === "https:" ? "https" : "http";
  const host = u.hostname;
  if (!host) return "";

  const port = u.port;
  // 剥离 API 子路径
  const pathPrefix = stripApiSuffix(u.pathname).replace(/\/+$/, "");

  let result = `${protocol}://${host}`;
  if (port) result += `:${port}`;
  if (pathPrefix) result += pathPrefix;
  return result;
}

/**
 * 判定输入是否为合法的服务器地址（调用归一化后非空即合法）。
 */
export function isValidServerUrl(input: string | null | undefined): boolean {
  return normalizeServerBaseUrl(input) !== "";
}

// =====================================================================
//  旧 API（保留向后兼容，内部使用新函数）
// =====================================================================

export interface ServerAddressParts {
  protocol: ServerScheme;
  host: string;
  /** 字符串形式，空串表示不指定 */
  port: string;
  /** 反代路径前缀，如 /user:3001；空串表示无 path */
  path: string;
}

/**
 * 把用户填写的 (protocol, host, port) 拼成后端期望的 baseUrl。
 *
 * 注意：旧版三段式模型不含 path，调用方如需 path 支持请改用
 * normalizeServerBaseUrl() 直接接收完整 URL。
 */
export function buildServerUrl(parts: ServerAddressParts): string {
  const host = normalizeHost(parts.host);
  if (!host) return "";
  const port = normalizePort(parts.port);
  const base = `${parts.protocol}://${host}`;
  return port ? `${base}:${port}` : base;
}

/**
 * 解析一个已经完整的 URL（或用户粘贴的半成品），返回 3 段。
 *
 * 注意：旧版三段式模型不保留 path 前缀。
 * 如需保留 path，请改用 normalizeServerBaseUrl()。
 */
export function parseServerUrl(input: string | null | undefined): ServerAddressParts {
  const fallback: ServerAddressParts = { protocol: "http", host: "", port: "" };
  if (!input) return fallback;

  const raw = input.trim();
  if (!raw) return fallback;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    const protocol: ServerScheme = u.protocol === "https:" ? "https" : "http";
    return {
      protocol,
      host: u.hostname,
      port: u.port || "",
      path: stripApiSuffix(u.pathname).replace(/\/+$/, ""),
    };
  } catch {
    return fallback;
  }
}

function normalizeHost(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function normalizePort(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^\d+$/.test(trimmed) ? trimmed : "";
}