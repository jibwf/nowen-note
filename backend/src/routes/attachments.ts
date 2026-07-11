import type { Context } from "hono";
import attachmentsRouter, {
  handleDownloadAttachment as handleFullAttachmentDownload,
} from "./attachments-core";
import { handleAttachmentMediaRange } from "./attachment-media-range";

export * from "./attachments-core";
export default attachmentsRouter;

/**
 * Preserve the canonical attachment handler while allowing seekable media to answer byte-range
 * requests first. Keeping this wrapper at the original module path means index.ts, tests and every
 * existing importer automatically receive Range support without duplicating route registration.
 */
export async function handleDownloadAttachment(c: Context): Promise<Response> {
  let delegated = false;
  const rangeResponse = await handleAttachmentMediaRange(c, async () => {
    delegated = true;
  });
  if (!delegated && rangeResponse instanceof Response) return rangeResponse;
  return handleFullAttachmentDownload(c);
}
