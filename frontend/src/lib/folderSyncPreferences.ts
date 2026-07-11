import type { FolderSyncAPI } from "@/lib/desktopBridge";

export type FolderSyncConflictPolicy = "protect" | "copy" | "overwrite";
export type FolderSyncDeletionPolicy = "keep" | "trash" | "detach";

export interface FolderSyncPreferences {
  conflictPolicy: FolderSyncConflictPolicy;
  deletionPolicy: FolderSyncDeletionPolicy;
  extractAttachmentText: boolean;
  excludePatterns: string[];
}

export const FOLDER_SYNC_PREFS_MESSAGE_PREFIX = "__NOWEN_FOLDER_SYNC_PREFS__:";

const STORAGE_PREFIX = "nowen-folder-sync-prefs:";
const MAX_PATTERNS = 10;
const MAX_PATTERN_LENGTH = 64;

export const DEFAULT_FOLDER_SYNC_PREFERENCES: FolderSyncPreferences = {
  conflictPolicy: "protect",
  deletionPolicy: "keep",
  extractAttachmentText: true,
  excludePatterns: [],
};

function isConflictPolicy(value: unknown): value is FolderSyncConflictPolicy {
  return value === "protect" || value === "copy" || value === "overwrite";
}

function isDeletionPolicy(value: unknown): value is FolderSyncDeletionPolicy {
  return value === "keep" || value === "trash" || value === "detach";
}

export function sanitizeFolderSyncExcludePatterns(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const pattern = raw.trim().replace(/\\/g, "/").slice(0, MAX_PATTERN_LENGTH);
    if (!pattern || pattern.startsWith("#") || seen.has(pattern)) continue;
    seen.add(pattern);
    result.push(pattern);
    if (result.length >= MAX_PATTERNS) break;
  }
  return result;
}

export function normalizeFolderSyncPreferences(input?: Partial<FolderSyncPreferences> | null): FolderSyncPreferences {
  return {
    conflictPolicy: isConflictPolicy(input?.conflictPolicy)
      ? input.conflictPolicy
      : DEFAULT_FOLDER_SYNC_PREFERENCES.conflictPolicy,
    deletionPolicy: isDeletionPolicy(input?.deletionPolicy)
      ? input.deletionPolicy
      : DEFAULT_FOLDER_SYNC_PREFERENCES.deletionPolicy,
    extractAttachmentText: typeof input?.extractAttachmentText === "boolean"
      ? input.extractAttachmentText
      : DEFAULT_FOLDER_SYNC_PREFERENCES.extractAttachmentText,
    excludePatterns: sanitizeFolderSyncExcludePatterns(input?.excludePatterns),
  };
}

function storageKey(folderId: string): string {
  return `${STORAGE_PREFIX}${folderId}`;
}

export function getFolderSyncPreferences(
  folderId: string,
  fallback?: Partial<FolderSyncPreferences> | null,
): FolderSyncPreferences {
  const normalizedFallback = normalizeFolderSyncPreferences(fallback);
  if (typeof window === "undefined") return normalizedFallback;
  try {
    const raw = localStorage.getItem(storageKey(folderId));
    if (!raw) return normalizedFallback;
    return normalizeFolderSyncPreferences({ ...normalizedFallback, ...JSON.parse(raw) });
  } catch {
    return normalizedFallback;
  }
}

export function saveFolderSyncPreferences(
  folderId: string,
  input: Partial<FolderSyncPreferences>,
): FolderSyncPreferences {
  const normalized = normalizeFolderSyncPreferences(input);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(storageKey(folderId), JSON.stringify(normalized));
    } catch {
      // Private browsing or storage quota failures must not block sync configuration.
    }
  }
  return normalized;
}

/**
 * The existing Electron IPC intentionally whitelists the original MVP fields.
 * To remain compatible with older preload/main bundles, advanced preferences are
 * sent through the already-sandboxed appendLog channel as a compact control
 * message. The main-process folder-sync module consumes it without writing it to
 * user-visible logs.
 */
export async function pushFolderSyncPreferences(
  api: FolderSyncAPI,
  folderId: string,
  input: Partial<FolderSyncPreferences>,
): Promise<FolderSyncPreferences> {
  const normalized = saveFolderSyncPreferences(folderId, input);
  const compact = JSON.stringify(normalized);
  await api.appendLog(folderId, "sync", `${FOLDER_SYNC_PREFS_MESSAGE_PREFIX}${compact}`);
  return normalized;
}
