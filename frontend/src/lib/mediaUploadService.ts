import { api } from "@/lib/api";

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "ogv", "m4v", "mov"]);

export interface MediaUploadOptions {
  noteId: string;
  file: File;
  source?: "editor" | "markdown" | "paste" | "drag-drop";
}

export interface MediaUploadResult {
  attachmentId: string;
  url: string;
  previewUrl: string;
  filename: string;
  mimeType: string;
  size: number;
  source: "editor" | "markdown" | "paste" | "drag-drop";
}

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return "";
  return filename.slice(idx + 1).toLowerCase();
}

export function isVideoFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.has(getFileExtension(file.name || ""));
}

export function toInlineAttachmentUrl(url: string): string {
  if (!url.startsWith("/api/attachments/")) return url;
  if (/[?&]inline=1\b/.test(url)) return url;

  const hashIndex = url.indexOf("#");
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}inline=1${hash}`;
}

export async function uploadMediaAttachment({
  noteId,
  file,
  source = "editor",
}: MediaUploadOptions): Promise<MediaUploadResult> {
  const result = await api.attachments.upload(noteId, file);
  return {
    attachmentId: result.id,
    url: result.url,
    previewUrl: toInlineAttachmentUrl(result.url),
    filename: result.filename || file.name,
    mimeType: result.mimeType,
    size: result.size,
    source,
  };
}
