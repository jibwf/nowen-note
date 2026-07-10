export interface MobileImageSheetControls {
  root: HTMLElement;
  closeButton: HTMLButtonElement;
  actionButtons: HTMLButtonElement[];
  sizeButtons: HTMLButtonElement[];
}

export interface SharedLightboxContext {
  overlay: HTMLElement;
  image: HTMLImageElement;
  sourceImages: HTMLImageElement[];
  currentIndex: number;
}

export interface GesturePoint {
  x: number;
  y: number;
}

function directButtons(element: Element | null | undefined): HTMLButtonElement[] {
  if (!element) return [];
  return Array.from(element.children).filter(
    (child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
  );
}

/** Locate the existing Tiptap mobile image sheet without relying on translated text. */
export function findMobileImageSheet(doc: Document = document): MobileImageSheetControls | null {
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>("div.fixed.bottom-0.left-0.right-0.z-50"),
  );

  for (const root of candidates) {
    const grids = Array.from(root.querySelectorAll<HTMLElement>("div.grid"));
    const actionGrid = grids.find((grid) => grid.classList.contains("grid-cols-4"));
    const sizeGrid = grids.find((grid) => grid.classList.contains("grid-cols-5"));
    const actionButtons = directButtons(actionGrid);
    const sizeButtons = directButtons(sizeGrid);
    const closeButton = root.querySelector<HTMLButtonElement>("button[aria-label]");

    if (closeButton && actionButtons.length >= 6 && sizeButtons.length >= 5) {
      return {
        root,
        closeButton,
        actionButtons: actionButtons.slice(0, 6),
        sizeButtons: sizeButtons.slice(0, 5),
      };
    }
  }

  return null;
}

function imageSource(image: HTMLImageElement): string {
  return image.currentSrc || image.src || image.getAttribute("src") || "";
}

/** Locate the share-page lightbox and the ordered source images behind it. */
export function findSharedLightbox(doc: Document = document): SharedLightboxContext | null {
  if (!doc.querySelector(".shared-note-content")) return null;

  const overlays = Array.from(doc.querySelectorAll<HTMLElement>("div.fixed.inset-0"));
  for (const overlay of overlays) {
    const image = overlay.querySelector<HTMLImageElement>('img[draggable="false"]');
    if (!image || image.closest(".shared-note-content")) continue;

    const sourceImages = Array.from(
      doc.querySelectorAll<HTMLImageElement>(".shared-note-content img"),
    ).filter((item) => !overlay.contains(item) && !!imageSource(item));
    if (!sourceImages.length) continue;

    const currentSource = imageSource(image);
    const currentIndex = Math.max(
      0,
      sourceImages.findIndex((item) => imageSource(item) === currentSource),
    );

    return { overlay, image, sourceImages, currentIndex };
  }

  return null;
}

export function normalizeQuarterTurn(degrees: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  return normalized as 0 | 90 | 180 | 270;
}

export function stepGalleryIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  return Math.max(0, Math.min(length - 1, current + delta));
}

/** Returns -1 for previous, 1 for next, or 0 when the gesture is not horizontal. */
export function getHorizontalSwipeDirection(
  start: GesturePoint,
  end: GesturePoint,
  threshold = 48,
): -1 | 0 | 1 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.15) return 0;
  return dx < 0 ? 1 : -1;
}

export function getRotatedContainLimits(rotation: number): {
  maxWidth: string;
  maxHeight: string;
} {
  const sideways = normalizeQuarterTurn(rotation) % 180 !== 0;
  return sideways
    ? { maxWidth: "88vh", maxHeight: "92vw" }
    : { maxWidth: "92vw", maxHeight: "88vh" };
}

export function getImageElementSource(image: HTMLImageElement): string {
  return imageSource(image);
}
