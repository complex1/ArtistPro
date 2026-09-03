/** Fixed thumbnail size stored for every uploaded image (kept tiny as base64). */
export const IMAGE_SIZE = 50;

/**
 * Resize an uploaded image to a fixed IMAGE_SIZE×IMAGE_SIZE PNG data URL.
 * The image is scaled to cover the square and center-cropped so it isn't
 * distorted, then encoded as base64 for storage alongside the config.
 */
export async function fileToIconDataUrl(
  file: File,
  size = IMAGE_SIZE
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  // Cover: scale so the shorter side fills the square, then center-crop.
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  const dx = (size - dw) / 2;
  const dy = (size - dh) / 2;
  ctx.drawImage(bitmap, dx, dy, dw, dh);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

/** Profile cover images use the same fixed 50×50 thumbnail. */
export async function fileToProfileImage(file: File): Promise<string> {
  return fileToIconDataUrl(file, IMAGE_SIZE);
}

type Cell = { x: number; y: number };
type Sized = { layout: { x: number; y: number; w: number; h: number } };

function coveredCells(widget: Sized): Cell[] {
  const cells: Cell[] = [];
  for (let dy = 0; dy < Math.max(1, widget.layout.h); dy++) {
    for (let dx = 0; dx < Math.max(1, widget.layout.w); dx++) {
      cells.push({ x: widget.layout.x + dx, y: widget.layout.y + dy });
    }
  }
  return cells;
}

export function occupiedSet(widgets: Sized[]): Set<string> {
  const set = new Set<string>();
  for (const w of widgets) {
    for (const c of coveredCells(w)) set.add(`${c.x},${c.y}`);
  }
  return set;
}

function areaFree(
  occupied: Set<string>,
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  rows: number
): boolean {
  if (x + w > cols || y + h > rows) return false;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (occupied.has(`${x + dx},${y + dy}`)) return false;
    }
  }
  return true;
}

/** Find the first free top-left cell that fits a w×h widget. */
export function firstFreeArea(
  widgets: Sized[],
  cols: number,
  rows: number,
  w = 1,
  h = 1
): Cell | null {
  const occupied = occupiedSet(widgets);
  for (let y = 0; y <= rows - h; y++) {
    for (let x = 0; x <= cols - w; x++) {
      if (areaFree(occupied, x, y, w, h, cols, rows)) return { x, y };
    }
  }
  return null;
}

/** Clamp all widgets so they fit within a resized grid without overlapping. */
export function clampWidgetsToGrid<T extends Sized>(
  widgets: T[],
  cols: number,
  rows: number
): T[] {
  const placed: T[] = [];
  for (const widget of widgets) {
    const w = Math.min(Math.max(1, widget.layout.w), cols);
    const h = Math.min(Math.max(1, widget.layout.h), rows);
    let x = Math.min(Math.max(0, widget.layout.x), cols - w);
    let y = Math.min(Math.max(0, widget.layout.y), rows - h);

    const occupied = occupiedSet(placed);
    if (!areaFree(occupied, x, y, w, h, cols, rows)) {
      const spot = firstFreeArea(placed, cols, rows, w, h);
      if (!spot) continue; // no room; drop widget
      x = spot.x;
      y = spot.y;
    }
    placed.push({ ...widget, layout: { x, y, w, h } });
  }
  return placed;
}
