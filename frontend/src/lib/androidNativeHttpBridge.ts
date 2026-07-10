import { Capacitor, CapacitorHttp } from "@capacitor/core";

const BRIDGE_FLAG = "__nowenAndroidNativeHttpBridgeInstalled";
const DEFAULT_NATIVE_TIMEOUT_MS = 6000;

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type FetchFn = typeof fetch;

export interface AndroidNativeHttpBridgeOptions {
  nativeTimeoutMs?: number;
}

function isRequest(input: FetchInput): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function getRequestUrl(input: FetchInput): string {
  return isRequest(input) ? input.url : String(input);
}

function getRequestMethod(input: FetchInput, init?: FetchInit): string {
  return (init?.method || (isRequest(input) ? input.method : "GET") || "GET").toUpperCase();
}

function getRequestSignal(input: FetchInput, init?: FetchInit): AbortSignal | null {
  return init?.signal || (isRequest(input) ? input.signal : null) || null;
}

function mergeRequestHeaders(input: FetchInput, init?: FetchInit): Record<string, string> {
  const headers = new Headers(isRequest(input) ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function normalizeResponseHeaders(headers: unknown): Headers {
  const result = new Headers();
  if (!headers || typeof headers !== "object") return result;

  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    result.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }
  return result;
}

function nativeResponseBody(data: unknown): string {
  if (data === undefined || data === null) return "";
  return typeof data === "string" ? data : JSON.stringify(data);
}

function createBridgeError(message: string, name: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

async function withAbortAndTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal | null,
  timeoutMs: number,
): Promise<T> {
  if (signal?.aborted) {
    throw createBridgeError("The request was aborted", "AbortError");
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(createBridgeError("The request was aborted", "AbortError")));
    const timeoutId = window.setTimeout(
      () => finish(() => reject(createBridgeError("Native HTTP request timed out", "TimeoutError"))),
      timeoutMs,
    );

    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function isAndroidNativeRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/**
 * Only JSON-style API reads are routed through CapacitorHttp.
 *
 * Uploads, downloads, streaming responses and mutations keep using the existing
 * fetch path so their body/stream semantics and offline queue behavior remain
 * unchanged.
 */
export function shouldUseAndroidNativeHttp(input: FetchInput, init?: FetchInit): boolean {
  if (!isAndroidNativeRuntime()) return false;

  const method = getRequestMethod(input, init);
  if (method !== "GET" && method !== "HEAD") return false;

  try {
    const url = new URL(getRequestUrl(input), window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return /(?:^|\/)api(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

async function androidNativeFetch(
  input: FetchInput,
  init: FetchInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const method = getRequestMethod(input, init);
  const signal = getRequestSignal(input, init);
  const url = new URL(getRequestUrl(input), window.location.href).toString();
  const nativeResponse = await withAbortAndTimeout(
    CapacitorHttp.request({
      url,
      method,
      headers: mergeRequestHeaders(input, init),
      responseType: "text",
    }),
    signal,
    timeoutMs,
  );

  if (nativeResponse.status < 200 || nativeResponse.status > 599) {
    throw new Error(`Native HTTP returned invalid status: ${nativeResponse.status}`);
  }

  const headers = normalizeResponseHeaders(nativeResponse.headers);
  const body = method === "HEAD" || nativeResponse.status === 204 || nativeResponse.status === 205
    ? null
    : nativeResponseBody(nativeResponse.data);

  if (body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(body, {
    status: nativeResponse.status,
    headers,
  });
}

/**
 * Installs a narrow fetch bridge before React mounts.
 *
 * Android WebView requests can remain pending on cellular networks when CORS,
 * DNS or IPv6 negotiation is unhealthy. API GET/HEAD requests therefore use
 * CapacitorHttp first (which is not constrained by WebView CORS). If the native
 * request fails or times out, the original fetch implementation remains as a
 * compatibility fallback.
 */
export function installAndroidNativeHttpBridge(
  options: AndroidNativeHttpBridgeOptions = {},
): (() => void) | null {
  if (typeof window === "undefined" || !isAndroidNativeRuntime()) return null;

  const runtime = window as typeof window & Record<string, unknown>;
  if (runtime[BRIDGE_FLAG]) return null;

  const originalFetch: FetchFn = window.fetch.bind(window);
  const nativeTimeoutMs = Math.max(1000, options.nativeTimeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS);

  const bridgedFetch: FetchFn = async (input, init) => {
    if (!shouldUseAndroidNativeHttp(input, init)) {
      return originalFetch(input, init);
    }

    try {
      return await androidNativeFetch(input, init, nativeTimeoutMs);
    } catch (nativeError) {
      const signal = getRequestSignal(input, init);
      if (signal?.aborted) throw nativeError;

      console.warn("[android-http] native request failed; falling back to WebView fetch", {
        method: getRequestMethod(input, init),
        url: getRequestUrl(input),
        errorName: (nativeError as { name?: string })?.name,
        errorMessage: (nativeError as { message?: string })?.message,
      });
      return originalFetch(input, init);
    }
  };

  runtime[BRIDGE_FLAG] = true;
  window.fetch = bridgedFetch;

  return () => {
    if (window.fetch === bridgedFetch) window.fetch = originalFetch;
    delete runtime[BRIDGE_FLAG];
  };
}
