import { api } from "@/lib/api";
import { emitMediaUploadLifecycle } from "@/lib/mediaUploadLifecycle";

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

export function isVideoFile(file: Pick<File, "name" | "type">): boolean {
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
  emitMediaUploadLifecycle({
    phase: "start",
    file,
    filename: file.name,
    mediaType: "video",
  });

  try {
    const uploaded = await api.attachments.upload(noteId, file);
    const result: MediaUploadResult = {
      attachmentId: uploaded.id,
      url: uploaded.url,
      previewUrl: toInlineAttachmentUrl(uploaded.url),
      filename: uploaded.filename || file.name,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      source,
    };
    emitMediaUploadLifecycle({
      phase: "success",
      file,
      filename: file.name,
      mediaType: "video",
      result,
    });
    return result;
  } catch (error: any) {
    emitMediaUploadLifecycle({
      phase: "error",
      file,
      filename: file.name,
      mediaType: "video",
      error: error?.message || "视频上传失败",
    });
    throw error;
  }
}
