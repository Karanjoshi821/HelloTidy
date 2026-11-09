/**
 * Shape of the admin theme switch: an ink-drop blob that grows from the
 * clicked icon until it covers the viewport. `createBlob()` gives the exact
 * CSS `path("…")` for `clip-path` at any moment, and the switch redraws it on
 * every screen refresh (see components/admin/theme-toggle.tsx).
 *
 * Pure and deterministic for a given `random`, so it can be unit-tested.
 */

const POINTS = 11;
/** Wobble as a share of the radius: lumpy while small, calmer once large. */
const WOBBLE_START = 0.18;
const WOBBLE_END = 0.1;
/** Whole blob turns this far (radians) over the animation. */
const ROTATION = (6 * Math.PI) / 180;
/** Turns of drift for each wobble term over the whole animation: slow, so the lumps glide rather than shimmer. */
const DRIFT = [0.35, 0.45, 0.3];
/**
 * A smooth curve through the points dips inside them between points. Size the
 * last frame so even its deepest dent, between points, clears the viewport.
 */
const CURVE_DIP = 0.94;
const COVER_MARGIN = 1.02;

type Point = { x: number; y: number };

/** cubic-bezier control points (x1, y1, x2, y2) for the radius growth; see growth(). */
const GROWTH = [0.5, 0.45, 0.85, 0.9];

/**
 * Growth of the blob over the animation, as a cubic-bezier (GROWTH). Tuned by
 * measuring screen coverage against the brief at phone and desktop sizes; see
 * the timing test in tests/theme-blob.test.ts.
 */
export function growth(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  // Bisection on x(s) = t; x is monotonic for these control points.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(GROWTH[0], GROWTH[2], mid) < t) lo = mid;
    else hi = mid;
  }
  return bez(GROWTH[1], GROWTH[3], (lo + hi) / 2);
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/** Closed Catmull-Rom spline through `pts`, as cubic Béziers: "M x y C … Z". */
function closedPath(pts: Point[]): string {
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n];
  let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return `${d} Z`;
}

/**
 * A blob centred on (originX, originY) that ends covering a viewportW ×
 * viewportH viewport. Returns its `path("…")` at progress t (0 → 1); the
 * growth curve is built in. Every path has the same commands (M, N × C, Z).
 *
 * The blob grows as a wobbly oval shaped to the viewport rather than a circle:
 * an ellipse with semi-axes √2 × (distance to the farther side, horizontally and
 * vertically) passes exactly through the farthest corner, so that corner is the
 * last spot covered, as the growth slows down. A circle reached it far too
 * early, so the edge left the screen at full speed.
 */
export function createBlob(
  originX: number,
  originY: number,
  viewportW: number,
  viewportH: number,
  random: () => number = Math.random,
): (t: number) => string {
  const reachX = Math.max(originX, viewportW - originX, 1);
  const reachY = Math.max(originY, viewportH - originY, 1);
  // Smallest wobble factor on the last frame is (1 - WOBBLE_END); dents between points dip by CURVE_DIP.
  const scale = (Math.SQRT2 * COVER_MARGIN) / ((1 - WOBBLE_END) * CURVE_DIP);
  const axisX = reachX * scale;
  const axisY = reachY * scale;

  // Per-point phases, so each lump has its own character; plus a random start angle for the lobe pattern.
  const phases = Array.from({ length: POINTS }, () => [random(), random(), random()].map((r) => r * Math.PI * 2));
  const lobeOffset = random() * Math.PI * 2;
  const spin = random() < 0.5 ? -1 : 1;

  return (progress: number) => {
    const t = Math.min(1, Math.max(0, progress));
    const eased = growth(t);
    const amplitude = WOBBLE_START + (WOBBLE_END - WOBBLE_START) * eased;
    const rotation = spin * ROTATION * t;

    const pts: Point[] = [];
    for (let i = 0; i < POINTS; i++) {
      const angle = (i / POINTS) * Math.PI * 2 + rotation;
      const [a, b, c] = phases[i];
      // Weights sum to 1, so |wobble| ≤ amplitude. The lobe terms (3 and 2 per turn) drift
      // slowly with t, so the dents and swells travel round the edge as it grows.
      const wobble =
        0.5 * Math.sin(3 * angle + lobeOffset + a * 0.35 + 2 * Math.PI * DRIFT[0] * t) +
        0.3 * Math.sin(2 * angle - lobeOffset + b * 0.35 - 2 * Math.PI * DRIFT[1] * t) +
        0.2 * Math.sin(c + 2 * Math.PI * DRIFT[2] * t);
      // At least 2 px across, so the first frame is a dot rather than a degenerate path.
      const k = Math.max(2 / Math.min(axisX, axisY), eased) * (1 + amplitude * wobble);
      pts.push({ x: originX + axisX * k * Math.cos(angle), y: originY + axisY * k * Math.sin(angle) });
    }
    return `path("${closedPath(pts)}")`;
  };
}
