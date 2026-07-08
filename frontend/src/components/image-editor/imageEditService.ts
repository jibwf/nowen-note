export function isSvgImageSource(src: string, mimeType?: string | null): boolean {
  const normalized = src.trim().toLowerCase();
  return (
    normalized.startsWith("data:image/svg+xml") ||
    normalized.split(/[?#]/, 1)[0].endsWith(".svg") ||
    (mimeType?.toLowerCase().includes("svg") ?? false)
  );
}

export function editedImageBlobToFile(blob: Blob, filename?: string): File {
  const base = (filename || `edited-image-${Date.now()}`).trim() || `edited-image-${Date.now()}`;
  const safeName = /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.png`;
  return new File([blob], safeName, { type: blob.type || "image/png" });
}
