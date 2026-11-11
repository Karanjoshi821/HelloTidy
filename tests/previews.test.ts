import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Placeholder content (sample reviews, placeholder video reviews) may show in
 * a local preview, and must never show in a Vercel production build.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_SAMPLES", env.NEXT_PUBLIC_PREVIEW_SAMPLES ?? "");
  vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV ?? "");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", env.NEXT_PUBLIC_VERCEL_ENV ?? "");
  const previews = await import("../src/config/previews");
  const videos = await import("../src/config/video-reviews");
  const reviews = await import("../src/config/reviews");
  return { ...previews, ...videos, ...reviews };
}

afterEach(() => vi.unstubAllEnvs());

describe("placeholder previews", () => {
  it("are off by default", async () => {
    const m = await load({});
    expect(m.showPlaceholders).toBe(false);
    expect(m.displayedReviews.some((r) => r.sample)).toBe(false);
    expect(m.displayedVideoReviews.some((v) => v.placeholder || !v.consent)).toBe(false);
  });

  it("show locally when NEXT_PUBLIC_PREVIEW_SAMPLES=1", async () => {
    const m = await load({ NEXT_PUBLIC_PREVIEW_SAMPLES: "1" });
    expect(m.showPlaceholders).toBe(true);
    expect(m.displayedVideoReviews).toEqual(m.videoReviews);
    expect(m.displayedReviews).toEqual(m.reviews);
  });

  it.each([{ VERCEL_ENV: "production" }, { NEXT_PUBLIC_VERCEL_ENV: "production" }])(
    "never show on Vercel production (%o), even with the flag on",
    async (env) => {
      const m = await load({ NEXT_PUBLIC_PREVIEW_SAMPLES: "1", ...env });
      expect(m.showPlaceholders).toBe(false);
      expect(m.displayedReviews.some((r) => r.sample)).toBe(false);
      expect(m.displayedVideoReviews.some((v) => v.placeholder || !v.consent)).toBe(false);
    },
  );

  it("publish only consented, non-placeholder clips", async () => {
    const m = await load({});
    for (const v of m.publishedVideoReviews) {
      expect(v.consent).toBe(true);
      expect(v.placeholder).toBeFalsy();
    }
  });
});
