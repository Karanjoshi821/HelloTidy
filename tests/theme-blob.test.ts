import { describe, expect, it } from "vitest";
import { createBlob, growth } from "@/lib/theme-blob";

/** The blob sampled at 60 evenly spaced moments, like 60 screen refreshes over the animation. */
function buildBlobKeyframes(x: number, y: number, w: number, h: number, random: () => number): string[] {
  const blob = createBlob(x, y, w, h, random);
  return Array.from({ length: 60 }, (_, i) => blob(i / 59));
}

/** Small seeded generator, so a failing shape can be reproduced. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const numbers = (frame: string) => [...frame.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const commands = (frame: string) => frame.replace(/[^MCZ]/g, "");

/** Points along every Bézier segment of a path frame. */
function sample(frame: string, steps = 24): { x: number; y: number }[] {
  const n = numbers(frame);
  let p = { x: n[0], y: n[1] };
  const out = [p];
  for (let i = 2; i + 5 < n.length; i += 6) {
    const [c1x, c1y, c2x, c2y, x, y] = n.slice(i, i + 6);
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({
        x: u ** 3 * p.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t ** 3 * x,
        y: u ** 3 * p.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * y,
      });
    }
    p = { x, y };
  }
  return out;
}

const VIEWPORTS = [
  [390, 844],
  [1440, 900],
  [2560, 1440],
] as const;

/** Share of the viewport inside a path frame, on a grid of `step` px (1 = fully covered). */
function coverage(frame: string, w: number, h: number, step = 20): number {
  const pts = sample(frame, 8);
  let hit = 0;
  let all = 0;
  for (let y = 0; y <= h; y += step) {
    for (let x = 0; x <= w; x += step) {
      all++;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) hit++;
    }
  }
  return hit / all;
}

describe("theme switch blob", () => {
  it("draws every moment with the identical M, C × N, Z structure", () => {
    const frames = buildBlobKeyframes(40, 700, 390, 844, seeded(1));
    expect(frames).toHaveLength(60);
    const shape = commands(frames[0]);
    expect(shape).toMatch(/^MC{10,12}Z$/);
    for (const f of frames) {
      expect(f.startsWith('path("') && f.endsWith('")')).toBe(true);
      expect(commands(f)).toBe(shape);
      expect(numbers(f)).toHaveLength(numbers(frames[0]).length);
    }
  });

  it("starts tiny around the clicked icon", () => {
    const pts = sample(buildBlobKeyframes(120, 820, 1440, 900, seeded(2))[0]);
    for (const p of pts) expect(Math.hypot(p.x - 120, p.y - 820)).toBeLessThan(6);
  });

  it("ends covering the whole viewport, corners and edges included, wherever the click is", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const [x, y] of [
        [16, h - 60],
        [w / 2, h / 2],
        [w - 10, 10],
        [0, 0],
        [w, h],
      ]) {
        for (let seed = 1; seed <= 25; seed++) {
          const frames = buildBlobKeyframes(x, y, w, h, seeded(seed));
          expect(coverage(frames[frames.length - 1], w, h, 40)).toBe(1);
        }
      }
    }
  });

  it("is wobbly, not a smooth oval being scaled", () => {
    const frames = buildBlobKeyframes(720, 450, 1440, 900, seeded(3));
    // Distance of each on-curve point from the origin, divided by the plain oval's at that angle.
    const lumps = (f: string) => {
      const n = numbers(f);
      const k: number[] = [];
      for (let i = 6; i < n.length; i += 6) {
        const dx = (n[i] - 720) / 720;
        const dy = (n[i + 1] - 450) / 450;
        k.push(Math.hypot(dx, dy));
      }
      const mean = k.reduce((a, b) => a + b) / k.length;
      return k.map((v) => v / mean);
    };
    const mid = lumps(frames[20]);
    expect(Math.max(...mid) - Math.min(...mid)).toBeGreaterThan(0.15);
    // The lumps travel: the pattern at frame 20 isn't the pattern at frame 40.
    const late = lumps(frames[40]);
    expect(Math.max(...late.map((v, i) => Math.abs(v - mid[i])))).toBeGreaterThan(0.03);
  });

  it("moves smoothly: the edge never pulls back or changes speed sharply", () => {
    const [w, h, x, y] = [1920, 1000, 33, 926];
    for (let seed = 1; seed <= 20; seed++) {
      const frames = buildBlobKeyframes(x, y, w, h, seeded(seed));
      const dt = 650 / (frames.length - 1);
      const dist = frames.map((f) => {
        const n = numbers(f);
        const d: number[] = [];
        for (let i = 6; i < n.length; i += 6) d.push(Math.hypot(n[i] - x, n[i + 1] - y));
        return d;
      });
      for (let p = 0; p < dist[0].length; p++) {
        for (let f = 2; f < dist.length; f++) {
          const v1 = (dist[f - 1][p] - dist[f - 2][p]) / dt;
          const v2 = (dist[f][p] - dist[f - 1][p]) / dt;
          expect(v2).toBeGreaterThan(-0.05); // px/ms: no pulling back
          expect(Math.abs(v2 - v1)).toBeLessThan(0.8); // px/ms between samples ~11 ms apart
        }
      }
    }
  });

  it("grows steadily from 0 to 1", () => {
    expect(growth(0)).toBe(0);
    expect(growth(1)).toBe(1);
    for (let t = 0.05; t <= 1; t += 0.05) expect(growth(t)).toBeGreaterThan(growth(t - 0.05));
  });

  it("covers the screen on the brief's timing, landing softly, from the sidebar switch", () => {
    // The switch sits bottom-left: the sidebar footer on desktop, the menu drawer on a phone.
    for (const [w, h, x, y] of [
      [1920, 1000, 33, 926],
      [1440, 900, 33, 826],
      [390, 844, 33, 770],
    ]) {
      const frames = buildBlobKeyframes(x, y, w, h, seeded(7));
      const at = (ms: number) => coverage(frames[Math.round((ms / 650) * (frames.length - 1))], w, h);
      expect(at(100)).toBeLessThan(0.12); // tiny
      expect(at(200)).toBeGreaterThan(0.15); // about a fifth to a quarter
      expect(at(200)).toBeLessThan(0.35);
      expect(at(350)).toBeGreaterThan(0.5); // about 60%
      expect(at(350)).toBeLessThan(0.72);
      expect(at(450)).toBeLessThan(0.95); // still finishing: the last corner fills in gently…
      expect(at(550)).toBeGreaterThan(0.95);
      expect(at(620)).toBe(1); // …and it's covered before the end
    }
  });
});
