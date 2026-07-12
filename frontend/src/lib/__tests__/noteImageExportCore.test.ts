// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { chooseRasterPlan, computePageSlices } from "@/lib/noteImageExportCore";

describe("note image export canvas planning", () => {
  it("keeps ordinary notes as a single high-resolution long image", () => {
    const plan = chooseRasterPlan({
      width: 794,
      height: 3200,
      requestedScale: 2,
      layout: "auto",
      blockBottoms: [],
    });

    expect(plan.mode).toBe("long");
    expect(plan.slices).toEqual([{ offset: 0, height: 3200 }]);
    expect(plan.scale).toBeGreaterThanOrEqual(1);
  });

  it("automatically paginates content that would exceed safe canvas limits", () => {
    const plan = chooseRasterPlan({
      width: 794,
      height: 24000,
      requestedScale: 2,
      layout: "auto",
      blockBottoms: [1200, 2700, 4100, 5600, 7100, 8600, 10100, 11600, 13100, 14600, 16100, 17600, 19100, 20600, 22100, 23800],
    });

    expect(plan.mode).toBe("pages");
    expect(plan.slices.length).toBeGreaterThan(10);
    expect(plan.warning).toContain("Canvas");
    expect(plan.slices.reduce((sum, slice) => sum + slice.height, 0)).toBe(24000);
  });

  it("uses nearby block bottoms instead of cutting every page at a fixed pixel", () => {
    const slices = computePageSlices(3600, 1400, [900, 1320, 2100, 2700, 3540]);

    expect(slices[0]).toEqual({ offset: 0, height: 1320 });
    expect(slices[1]).toEqual({ offset: 1320, height: 1380 });
    expect(slices.reduce((sum, slice) => sum + slice.height, 0)).toBe(3600);
  });

  it("honors explicit pagination even for short safe canvases", () => {
    const plan = chooseRasterPlan({
      width: 794,
      height: 2800,
      requestedScale: 2,
      layout: "pages",
      blockBottoms: [1200, 2500],
    });

    expect(plan.mode).toBe("pages");
    expect(plan.slices.length).toBeGreaterThan(1);
    expect(plan.warning).toBeUndefined();
  });
});
