import type { ImportFileInfo } from "./importService";
import { readMarkdownFromZipWithMeta } from "./importService";

export interface SiyuanZipInspection {
  entries: string[];
  hasMarkdownFiles: boolean;
  hasSyFiles: boolean;
  isSiyuanMarkdownZip: boolean;
}

export interface SiyuanImportResult {
  files: ImportFileInfo[];
  report: SiyuanImportReport;
  warnings: string[];
}

export interface SiyuanImportReport {
  totalMarkdownFiles: number;
  totalSyFiles: number;
  cleanedBlockAttrs: number;
  convertedWikiLinks: number;
  convertedBlockRefs: number;
  detectedTags: string[];
  unresolvedAssets: string[];
  unsupportedFiles: string[];
  warnings: string[];
}

export interface SiyuanMarkdownCleanResult {
  markdown: string;
  cleanedBlockAttrs: number;
  convertedWikiLinks: number;
  convertedBlockRefs: number;
  detectedTags: string[];
}

const MARKDOWN_EXT_RE = /\.(md|markdown)$/i;
const SIYUAN_SY_EXT_RE = /\.sy$/i;
const ASSETS_SEGMENT_RE = /(^|\/)assets\//i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i;
const SIYUAN_MARKER_RE =
  /(^|\n)\s*\{:\s+[^}]*\}\s*(?=\n|$)|\(\([^)]+?\)\)|\[\[[^\]]+?\]\]|!\[[^\]]*]\((?:\.{0,2}\/)?assets\//i;

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isHiddenZipEntry(path: string): boolean {
  const normalized = normalizeZipPath(path);
  return normalized.includes("__MACOSX/") || normalized.split("/").some((part) => part.startsWith("."));
}

function isMarkdownEntry(path: string): boolean {
  return MARKDOWN_EXT_RE.test(path);
}

function isSyEntry(path: string): boolean {
  return SIYUAN_SY_EXT_RE.test(path);
}

function hasAssetsDir(entries: string[]): boolean {
  return entries.some((entry) => ASSETS_SEGMENT_RE.test(normalizeZipPath(entry)));
}

export function isSiyuanMarkdownZip(entries: string[]): boolean {
  const visibleEntries = entries.map(normalizeZipPath).filter((entry) => !isHiddenZipEntry(entry));
  const hasMarkdown = visibleEntries.some(isMarkdownEntry);
  if (!hasMarkdown) return false;

  // Common Siyuan Markdown exports keep note-local resources under assets/.
  // Content-based detection is handled by inspectSiyuanZip/readSiyuanMarkdownZip.
  return hasAssetsDir(visibleEntries);
}

export function isSiyuanSyZip(entries: string[]): boolean {
  const visibleEntries = entries.map(normalizeZipPath).filter((entry) => !isHiddenZipEntry(entry));
  return visibleEntries.some(isSyEntry);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function stripQueryHash(ref: string): string {
  return ref.split(/[?#]/)[0];
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    try {
      return decodeURI(value);
    } catch {
      return value;
    }
  }
}

function trimAssetRef(raw: string): string {
  return raw
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\/g, "/");
}

export function normalizeAssetRef(ref: string): string[] {
  const raw = trimAssetRef(ref);
  if (!raw || /^(https?:|data:|\/\/)/i.test(raw)) return [];

  const candidates = new Set<string>();
  const add = (value: string) => {
    let normalized = stripQueryHash(trimAssetRef(value))
      .replace(/^\.\//, "")
      .replace(/^\/+/, "");
    while (normalized.startsWith("../")) normalized = normalized.slice(3);
    if (!normalized) return;
    candidates.add(normalized);
    const decoded = safeDecodeUri(normalized);
    candidates.add(decoded);
    const fileName = decoded.split("/").pop();
    if (fileName) candidates.add(fileName);
    const assetsIndex = decoded.toLowerCase().lastIndexOf("/assets/");
    const assetsTail = assetsIndex >= 0
      ? decoded.slice(assetsIndex + 1)
      : decoded.toLowerCase().startsWith("assets/")
      ? decoded
      : "";
    if (assetsTail) {
      candidates.add(assetsTail);
      candidates.add(`./${assetsTail}`);
      candidates.add(`../${assetsTail}`);
    }
  };

  add(raw);
  add(safeDecodeUri(raw));

  return uniqueSorted(candidates);
}

export async function inspectSiyuanZip(file: File): Promise<SiyuanZipInspection> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.keys(zip.files).map(normalizeZipPath);
  const visibleFiles = entries.filter((entry) => !zip.files[entry]?.dir && !isHiddenZipEntry(entry));
  const hasMarkdownFiles = visibleFiles.some(isMarkdownEntry);
  const hasSyFiles = visibleFiles.some(isSyEntry);

  let isSiyuan = isSiyuanMarkdownZip(entries);
  if (!isSiyuan && hasMarkdownFiles) {
    const markdownEntries = visibleFiles.filter(isMarkdownEntry).slice(0, 12);
    for (const entry of markdownEntries) {
      const zipEntry = zip.file(entry);
      if (!zipEntry) continue;
      try {
        const text = await zipEntry.async("text");
        if (SIYUAN_MARKER_RE.test(text)) {
          isSiyuan = true;
          break;
        }
      } catch {
        // Ignore unreadable individual files; the generic importer will surface real failures.
      }
    }
  }

  return {
    entries,
    hasMarkdownFiles,
    hasSyFiles,
    isSiyuanMarkdownZip: isSiyuan && hasMarkdownFiles,
  };
}

export function cleanSiyuanMarkdownWithReport(markdown: string): SiyuanMarkdownCleanResult {
  let cleanedBlockAttrs = 0;
  let convertedWikiLinks = 0;
  let convertedBlockRefs = 0;
  const detectedTags = new Set<string>();

  const tagRe = /(^|[^\p{L}\p{N}_/#])#([\p{L}\p{N}_\-\u4e00-\u9fff][^#\r\n]{0,48}?)#/gu;
  for (const match of markdown.matchAll(tagRe)) {
    const tag = (match[2] || "").trim();
    if (tag && !/\s{2,}/.test(tag)) detectedTags.add(tag);
  }

  const cleaned = markdown
    .replace(/^[ \t]*\{:\s+[^}\r\n]*\}[ \t]*(?:\r?\n|$)/gm, () => {
      cleanedBlockAttrs++;
      return "";
    })
    .replace(/[ \t]+\{:\s+[^}\r\n]*\}(?=\r?\n|$)/g, () => {
      cleanedBlockAttrs++;
      return "";
    })
    .replace(/\(\(([^)\s]+)(?:\s+"([^"]*)")?\)\)/g, (_match, id: string, label?: string) => {
      convertedBlockRefs++;
      return label?.trim() ? label.trim() : `[块引用:${id}]`;
    })
    .replace(/\[\[([^\]\r\n]+)\]\]/g, (_match, target: string) => {
      convertedWikiLinks++;
      const label = target.trim();
      return label ? `[${label}](${encodeURI(label)})` : "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    markdown: cleaned,
    cleanedBlockAttrs,
    convertedWikiLinks,
    convertedBlockRefs,
    detectedTags: uniqueSorted(detectedTags),
  };
}

export function cleanSiyuanMarkdown(markdown: string): string {
  return cleanSiyuanMarkdownWithReport(markdown).markdown;
}

export function enhanceSiyuanImageMap(
  imageMap: Record<string, string> | undefined,
  notePath: string,
): Record<string, string> | undefined {
  if (!imageMap) return imageMap;

  const enhanced: Record<string, string> = { ...imageMap };
  const normalizedNotePath = normalizeZipPath(notePath);
  const noteDir = normalizedNotePath.split("/").slice(0, -1).join("/");

  const addAlias = (alias: string, dataUri: string) => {
    for (const normalized of normalizeAssetRef(alias)) {
      if (!enhanced[normalized]) enhanced[normalized] = dataUri;
    }
  };

  for (const [rawPath, dataUri] of Object.entries(imageMap)) {
    const path = normalizeZipPath(rawPath);
    const fileName = path.split("/").pop();
    if (!fileName) continue;

    addAlias(fileName, dataUri);
    addAlias(path, dataUri);
    const assetsIndex = path.toLowerCase().lastIndexOf("/assets/");
    const assetsTail = assetsIndex >= 0
      ? path.slice(assetsIndex + 1)
      : path.toLowerCase().startsWith("assets/")
      ? path
      : "";
    if (assetsTail) {
      addAlias(assetsTail, dataUri);
      addAlias(`./${assetsTail}`, dataUri);
      addAlias(`../${assetsTail}`, dataUri);
    }

    if (noteDir && path.startsWith(`${noteDir}/`)) {
      const relativeToNote = path.slice(noteDir.length + 1);
      addAlias(relativeToNote, dataUri);
      addAlias(`./${relativeToNote}`, dataUri);
    }
  }

  return enhanced;
}

export function collectMarkdownAssetRefs(markdown: string): string[] {
  const refs = new Set<string>();
  const addIfAsset = (raw: string | undefined) => {
    if (!raw) return;
    const normalizedRefs = normalizeAssetRef(raw);
    if (normalizedRefs.some((ref) => /(^|\/)assets\//i.test(ref))) {
      refs.add(stripQueryHash(trimAssetRef(raw)));
    }
  };

  const mdLinkRe = /!?\[[^\]]*]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(mdLinkRe)) {
    const raw = (match[1] || "").replace(/\s+["'][^"']*["']\s*$/, "");
    addIfAsset(raw);
  }

  const htmlAttrRe = /<(?:img|a)\b[^>]*\s(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of markdown.matchAll(htmlAttrRe)) {
    addIfAsset(match[1]);
  }

  return uniqueSorted(refs);
}

function imageMapHasAsset(imageMap: Record<string, string> | undefined, ref: string): boolean {
  if (!imageMap) return false;
  return normalizeAssetRef(ref).some((candidate) => Boolean(imageMap[candidate]));
}

function isImageAssetRef(ref: string): boolean {
  const clean = stripQueryHash(trimAssetRef(ref));
  return IMAGE_EXT_RE.test(clean);
}

export async function readSiyuanMarkdownZip(file: File): Promise<SiyuanImportResult> {
  const inspection = await inspectSiyuanZip(file);
  const warnings: string[] = [];
  if (inspection.hasSyFiles) {
    warnings.push("siyuanSyNotSupported");
  }

  const { files } = await readMarkdownFromZipWithMeta(file);
  const markdownFiles = files.filter((info) => info.source === "md" || info.name.match(MARKDOWN_EXT_RE));
  const detectedTags = new Set<string>();
  const unresolvedAssets = new Set<string>();
  const unsupportedFiles = new Set<string>();
  let cleanedBlockAttrs = 0;
  let convertedWikiLinks = 0;
  let convertedBlockRefs = 0;

  const cleanedFiles = markdownFiles.map((info) => {
    const clean = cleanSiyuanMarkdownWithReport(info.content);
    cleanedBlockAttrs += clean.cleanedBlockAttrs;
    convertedWikiLinks += clean.convertedWikiLinks;
    convertedBlockRefs += clean.convertedBlockRefs;
    clean.detectedTags.forEach((tag) => detectedTags.add(tag));

    const imageMap = enhanceSiyuanImageMap(info.imageMap, info.name);
    for (const ref of collectMarkdownAssetRefs(clean.markdown)) {
      if (!isImageAssetRef(ref)) {
        unsupportedFiles.add(ref);
        continue;
      }
      if (!imageMapHasAsset(imageMap, ref)) {
        unresolvedAssets.add(ref);
      }
    }

    return {
      ...info,
      source: "siyuan",
      content: clean.markdown,
      imageMap,
    };
  });

  const report: SiyuanImportReport = {
    totalMarkdownFiles: markdownFiles.length,
    totalSyFiles: inspection.entries.filter((entry) => isSyEntry(entry) && !isHiddenZipEntry(entry)).length,
    cleanedBlockAttrs,
    convertedWikiLinks,
    convertedBlockRefs,
    detectedTags: uniqueSorted(detectedTags),
    unresolvedAssets: uniqueSorted(unresolvedAssets),
    unsupportedFiles: uniqueSorted(unsupportedFiles),
    warnings,
  };

  return { files: cleanedFiles, report, warnings };
}
