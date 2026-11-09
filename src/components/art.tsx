import Image from "next/image";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Small brand mark for tight spaces (admin, icons): a house-shaped speech
 * bubble with a sparkle. The same drawing is in public/brand/hello-tidy-mark.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} aria-hidden="true">
      <path
        d="M32 9.5 55 29v21H27l-11 9v-9H9V29z"
        fill="#0f7a3c"
        stroke="#0f7a3c"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path d="M32 18c1.4 9 5 12.6 14 14-9 1.4-12.6 5-14 14-1.4-9-5-12.6-14-14 9-1.4 12.6-5 14-14z" fill="#fff" />
    </svg>
  );
}

/** The main logo: one-line wordmark with a sparkle for the dot of the i. */
export function BrandLogo({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <Image
      src={onDark ? "/brand/hello-tidy-logo-on-dark.svg" : "/brand/hello-tidy-logo.svg"}
      alt={siteConfig.name}
      width={259}
      height={65}
      unoptimized
      className={cn("h-8 w-auto", className)}
    />
  );
}
