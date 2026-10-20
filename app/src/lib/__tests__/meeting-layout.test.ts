import { describe, expect, it } from "vitest";
import { computeGalleryLayout, paginateIds } from "../meeting-layout";

const W = 1920;
const H = 1080;

describe("computeGalleryLayout", () => {
  it("lays out a single participant as one large tile", () => {
    const layout = computeGalleryLayout({ width: 1280, height: 720, count: 1 });
    expect(layout.cols).toBe(1);
    expect(layout.rows).toBe(1);
    expect(layout.pages).toBe(1);
    // fills the stage at 16:9
    expect(layout.tileHeight).toBeCloseTo(720, 0);
    expect(layout.tileWidth).toBeCloseTo(1280, 0);
  });

  it("places two participants side by side on a wide stage", () => {
    const layout = computeGalleryLayout({ width: 1280, height: 720, count: 2 });
    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(1);
    expect(layout.lastRowCount).toBe(2);
  });

  it("uses a 2x2 grid for four participants", () => {
    const layout = computeGalleryLayout({ width: W, height: H, count: 4 });
    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(2);
  });

  it("uses a 3x3 grid for nine participants", () => {
    const layout = computeGalleryLayout({ width: W, height: H, count: 9 });
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(3);
  });

  it("reports an incomplete last row so the UI can center it", () => {
    const layout = computeGalleryLayout({ width: W, height: H, count: 5 });
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(2);
    expect(layout.lastRowCount).toBe(2);
  });

  it("fits 25 participants on one page without overflow", () => {
    const layout = computeGalleryLayout({ width: W, height: H, count: 25 });
    expect(layout.pages).toBe(1);
    expect(layout.cols).toBe(5);
    expect(layout.rows).toBe(5);
    const totalH = layout.rows * layout.tileHeight + 8 * (layout.rows - 1);
    expect(totalH).toBeLessThanOrEqual(H + 0.5);
  });

  it("paginates beyond 25 participants", () => {
    const layout = computeGalleryLayout({ width: W, height: H, count: 26 });
    expect(layout.pages).toBe(2);
    expect(layout.perPage).toBe(25);
    expect(layout.cols).toBe(5);
  });

  it("stacks tiles vertically on a narrow portrait stage", () => {
    const layout = computeGalleryLayout({ width: 375, height: 500, count: 4 });
    expect(layout.cols).toBe(1);
    expect(layout.rows).toBe(4);
    const totalH = layout.rows * layout.tileHeight + 8 * (layout.rows - 1);
    expect(totalH).toBeLessThanOrEqual(500 + 0.5);
  });

  it("never lets tiles overflow the stage height", () => {
    for (const count of [1, 2, 3, 7, 12, 25]) {
      const layout = computeGalleryLayout({ width: W, height: H, count });
      const totalH = layout.rows * layout.tileHeight + 8 * (layout.rows - 1);
      expect(totalH).toBeLessThanOrEqual(H + 0.5);
      const totalW = layout.cols * layout.tileWidth + 8 * (layout.cols - 1);
      expect(totalW).toBeLessThanOrEqual(W + 0.5);
    }
  });

  it("handles degenerate inputs gracefully", () => {
    expect(computeGalleryLayout({ width: 0, height: H, count: 4 }).rows).toBe(0);
    expect(computeGalleryLayout({ width: W, height: H, count: 0 }).rows).toBe(0);
    const tiny = computeGalleryLayout({ width: 10, height: 10, count: 3 });
    expect(tiny.cols).toBeGreaterThanOrEqual(1);
  });

  it("honours a custom aspect ratio", () => {
    const square = computeGalleryLayout({ width: W, height: H, count: 1, aspect: 1 });
    expect(square.tileWidth).toBeCloseTo(square.tileHeight, 5);
  });
});

describe("paginateIds", () => {
  const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);

  it("slices stable pages", () => {
    expect(paginateIds(ids, 25, 0)).toHaveLength(25);
    expect(paginateIds(ids, 25, 1)).toEqual(["p25", "p26", "p27", "p28", "p29"]);
  });

  it("clamps out-of-range pages", () => {
    expect(paginateIds(ids, 25, 99)).toHaveLength(5);
    expect(paginateIds(ids, 25, -3)).toHaveLength(25);
  });
});
