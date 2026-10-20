/**
 * Smart gallery layout for the live meeting video grid.
 *
 * Pure functions only — no DOM, no React — so the layout math can be unit
 * tested and the meeting room can recompute on resize / participant changes
 * without touching media tracks or signaling.
 */

export interface GalleryLayoutOptions {
  /** Available stage width in px (container minus chrome). */
  width: number;
  /** Available stage height in px. */
  height: number;
  /** Total number of participant tiles to place. */
  count: number;
  /** Gap between tiles in px. Default 8 (tight, Zoom-like seams). */
  gap?: number;
  /** Tile width/height ratio. Default 16/9. */
  aspect?: number;
  /** Max tiles shown per page before pagination kicks in. Default 25. */
  maxPerPage?: number;
}

export interface GalleryLayout {
  cols: number;
  rows: number;
  /** Optimal tile width in px (fits both container constraints). */
  tileWidth: number;
  /** Optimal tile height in px. */
  tileHeight: number;
  /** Number of pages given maxPerPage (1 when everything fits). */
  pages: number;
  /** Tiles per page (min(count, maxPerPage)). */
  perPage: number;
  /** Tiles in the final row — used to center an incomplete last row. */
  lastRowCount: number;
}

const EPS = 1e-6;

export function computeGalleryLayout(options: GalleryLayoutOptions): GalleryLayout {
  const gap = Math.max(0, options.gap ?? 8);
  const aspect = options.aspect && options.aspect > 0 ? options.aspect : 16 / 9;
  const maxPerPage = Math.max(1, Math.floor(options.maxPerPage ?? 25));
  const count = Math.max(0, Math.floor(options.count));
  const width = Math.max(0, options.width);
  const height = Math.max(0, options.height);

  if (count === 0 || width <= 0 || height <= 0) {
    return { cols: 1, rows: 0, tileWidth: 0, tileHeight: 0, pages: 0, perPage: maxPerPage, lastRowCount: 0 };
  }

  const perPage = Math.min(count, maxPerPage);
  const pages = Math.ceil(count / perPage);

  // Enumerate every column count and keep the arrangement that maximizes
  // tile area — this is what produces Zoom-like results (1×1, 2×1, 2×2,
  // 3×3, 4×4, 5×5…) while adapting to wide or tall containers.
  let best = { cols: 1, rows: perPage, tileWidth: 0, tileHeight: 0, area: -1 };
  for (let cols = 1; cols <= perPage; cols++) {
    const rows = Math.ceil(perPage / cols);

    let tileW = (width - gap * (cols - 1)) / cols;
    if (tileW <= 0) continue;
    let tileH = tileW / aspect;

    const totalH = rows * tileH + gap * (rows - 1);
    if (totalH > height) {
      tileH = (height - gap * (rows - 1)) / rows;
      if (tileH <= 0) continue;
      tileW = tileH * aspect;
    }

    const area = tileW * tileH;
    if (area > best.area + EPS) {
      best = { cols, rows, tileWidth: tileW, tileHeight: tileH, area };
    }
  }

  const remainder = perPage % best.cols;
  const lastRowCount = remainder === 0 ? best.cols : remainder;

  return {
    cols: best.cols,
    rows: best.rows,
    tileWidth: best.tileWidth,
    tileHeight: best.tileHeight,
    pages,
    perPage,
    lastRowCount,
  };
}

/**
 * Slice a participant id list into stable pages. Tile identity stays tied to
 * the participant id, so paging never remounts a tile that is still visible.
 */
export function paginateIds<T>(ids: T[], perPage: number, page: number): T[] {
  const safePerPage = Math.max(1, perPage);
  const maxPage = Math.max(0, Math.ceil(ids.length / safePerPage) - 1);
  const safePage = Math.min(Math.max(0, page), maxPage);
  return ids.slice(safePage * safePerPage, safePage * safePerPage + safePerPage);
}
