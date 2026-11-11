import { cn } from "@/lib/utils";

/**
 * Deep green band: forest green with a soft glow from the top (the
 * `forest-glow` utility in globals.css). Every dark green area of the
 * storefront uses it, so they all match the video reviews section.
 *
 * Put <ForestDecor /> first inside it and give the content `relative` so it
 * paints above the shapes. No `isolate` here on purpose: a stacking context
 * would trap fixed children (like the sticky buy bar) under later sections.
 */
export const forestBand = "relative overflow-hidden forest-glow text-white";

/** Two faint shapes in the top-right and bottom-left corners of a forestBand. */
export function ForestDecor({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden="true">
      <svg className="absolute -top-6 right-0 w-[48%] max-w-[700px] text-white/[0.045]" viewBox="0 0 600 300">
        <path d="M600 0H170c70 40 110 150 270 175 70 11 120 55 160 125V0Z" fill="currentColor" />
      </svg>
      <svg className="absolute bottom-0 left-0 w-[42%] max-w-[620px] text-white/[0.05]" viewBox="0 0 600 260">
        <path d="M0 260V70c90-55 200-45 265 25 60 65 150 115 250 165H0Z" fill="currentColor" />
      </svg>
    </div>
  );
}
