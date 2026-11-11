/**
 * Local preview of placeholder content: sample reviews and placeholder video
 * reviews. Turn it on in .env.local with NEXT_PUBLIC_PREVIEW_SAMPLES=1 to see
 * how those sections look before real content arrives.
 *
 * It can never switch on for the live site: Vercel marks production builds
 * with VERCEL_ENV=production, and placeholders stay hidden there whatever the
 * flag says.
 */
export const showPlaceholders =
  process.env.NEXT_PUBLIC_PREVIEW_SAMPLES === "1" &&
  process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" &&
  process.env.VERCEL_ENV !== "production";
