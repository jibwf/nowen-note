import { getDb } from "../db/schema.js";
import { syncReferences } from "../lib/attachmentRefs.js";

/**
 * Keep the note-transfer service decoupled from the repository-backed reference
 * index while still participating in the caller's current SQLite transaction.
 */
export function syncAttachmentReferencesForNote(
  noteId: string,
  content: string | null | undefined,
): { added: number; removed: number } {
  return syncReferences(getDb(), noteId, content);
}
