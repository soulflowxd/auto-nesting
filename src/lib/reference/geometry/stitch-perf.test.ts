import { describe, expect, it } from "vitest";
import { analyzeDxf } from "./analyze-dxf";

/**
 * Guards the endpoint index in stitchPaths.
 *
 * The original stitch scanned every remaining path for each join, so a
 * drawing whose segments arrive in reverse order, which CAD exporters
 * routinely produce, cost O(n^2). Measured on the previous code: 40,000
 * segments took ~34s and 60,000 took ~81s, long enough for one anonymous
 * upload to occupy a serverless function until the platform killed it.
 *
 * These cases are deliberately adversarial rather than typical. If this
 * file starts timing out, the index has been lost and the denial-of-
 * service is back.
 */
function reversedPolygonDxf(segments: number) {
  // A closed regular polygon emitted last-segment-first, which forces the
  // old implementation into a full scan for every single join.
  const points = Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return { x: Math.cos(angle) * 50, y: Math.sin(angle) * 50 };
  });

  const lines: string[] = [];
  for (let i = segments - 1; i >= 0; i -= 1) {
    const a = points[i];
    const b = points[(i + 1) % segments];
    lines.push(
      `0\nLINE\n10\n${a.x}\n20\n${a.y}\n30\n0\n11\n${b.x}\n21\n${b.y}\n31\n0\n`,
    );
  }
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${lines.join("")}0\nENDSEC\n0\nEOF\n`;
}

describe("stitchPaths performance", () => {
  it("stitches 40,000 reverse-ordered segments in well under a second", () => {
    const dxf = reversedPolygonDxf(40_000);
    const started = performance.now();
    const result = analyzeDxf(dxf);
    const elapsedMs = performance.now() - started;

    expect(result.closedLoopCount).toBe(1);
    // The old implementation took ~34s here. Anything approaching a
    // second means the linear scan is back.
    expect(elapsedMs).toBeLessThan(2_000);
  });

  it("stays linear as the segment count grows", () => {
    const time = (segments: number) => {
      const dxf = reversedPolygonDxf(segments);
      const started = performance.now();
      analyzeDxf(dxf);
      return performance.now() - started;
    };

    time(5_000); // warm the JIT so the ratio measures the algorithm
    const small = time(10_000);
    const large = time(40_000);

    // Quadratic would be ~16x for 4x the input. Linear is ~4x; allow
    // generous headroom for GC and a cold-ish JIT on CI.
    expect(large / Math.max(small, 1)).toBeLessThan(9);
  });
});
