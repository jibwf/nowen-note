export type EditorSavePayload = {
  title?: string;
  content?: string;
  contentText?: string;
};

export function shouldSkipUnchangedTitleOnlyUpdate(
  currentTitle: string,
  data: EditorSavePayload,
): boolean {
  const hasContentPatch =
    data.content !== undefined || data.contentText !== undefined;
  if (hasContentPatch) return false;
  return data.title !== undefined && data.title === currentTitle;
}

export function isRemoteVersionNewer(
  current: { id: string; version: number } | null | undefined,
  remote: { noteId?: string; id?: string; version?: number } | null | undefined,
): boolean {
  if (!current || !remote || typeof remote.version !== "number") return false;
  const remoteId = remote.noteId ?? remote.id;
  return remoteId === current.id && remote.version > current.version;
}
