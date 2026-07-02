export const CONTENT_FORMAT_VALUES = ["markdown", "tiptap-json", "html"] as const;

export type NoteContentFormat = typeof CONTENT_FORMAT_VALUES[number];

export interface NoteLike {
  id?: string;
  title?: string;
  notebookId?: string;
  content?: string | null;
  contentText?: string | null;
  contentFormat?: string | null;
  isPinned?: number;
  isFavorite?: number;
  isLocked?: number;
  version?: number;
  tags?: Array<{ id: string; name: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export function normalizeContentFormat(contentFormat?: string | null): NoteContentFormat {
  if (contentFormat === "tiptap-json" || contentFormat === "html") {
    return contentFormat;
  }
  return "markdown";
}

export function buildCreateNotePayload(params: {
  notebookId: string;
  title?: string;
  content?: string;
  contentFormat?: string | null;
}) {
  const body: {
    notebookId: string;
    title?: string;
    content?: string;
    contentText?: string;
    contentFormat: NoteContentFormat;
  } = {
    notebookId: params.notebookId,
    contentFormat: normalizeContentFormat(params.contentFormat),
  };

  if (params.title !== undefined) {
    body.title = params.title;
  }
  if (params.content !== undefined) {
    body.content = params.content;
    body.contentText = params.content;
  }

  return body;
}

export function buildUpdateNotePayload(params: {
  currentNote: Pick<NoteLike, "version">;
  title?: string;
  content?: string;
  contentFormat?: string | null;
}) {
  const body: {
    title?: string;
    content?: string;
    contentText?: string;
    contentFormat?: NoteContentFormat;
    version: number;
  } = {
    version: params.currentNote.version || 1,
  };

  if (params.title !== undefined) {
    body.title = params.title;
  }
  if (params.content !== undefined) {
    body.content = params.content;
    body.contentText = params.content;
    body.contentFormat = normalizeContentFormat(params.contentFormat);
  }

  return body;
}

export async function buildUpdateNotePayloadWithCurrentVersion(
  api: { getNote: (noteId: string) => Promise<NoteLike> },
  params: {
    noteId: string;
    title?: string;
    content?: string;
    contentFormat?: string | null;
  },
) {
  const currentNote = await api.getNote(params.noteId);
  return buildUpdateNotePayload({
    currentNote,
    title: params.title,
    content: params.content,
    contentFormat: params.contentFormat,
  });
}

export function buildReadNoteResult(note: NoteLike) {
  return {
    id: note.id,
    title: note.title,
    notebookId: note.notebookId,
    contentText: note.contentText,
    contentFormat: note.contentFormat || "unknown",
    isPinned: note.isPinned,
    isFavorite: note.isFavorite,
    isLocked: note.isLocked,
    version: note.version,
    tags: note.tags?.map((t) => ({ id: t.id, name: t.name })),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}
