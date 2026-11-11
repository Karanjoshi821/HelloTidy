import Image from "next/image";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Small brand mark for tight spaces (admin, print): the logo's lime sparkle
 * over its wipe, on a dark green rounded square. Decorative, so no alt text.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/hello-tidy-mark.svg"
      alt=""
      width={64}
      height={64}
      unoptimized
      className={cn("shrink-0", className)}
    />
  );
}

/**
 * The main logo: "hello tidy" with a sparkle for the dot of the i and a wipe
 * underneath. public/brand/ also has one-colour versions (-mono, -white) for
 * print and stamps, the mark, and PNGs for uploads (logo, mark, avatar).
 */
export function BrandLogo({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <Image
      src={onDark ? "/brand/hello-tidy-logo-on-dark.svg" : "/brand/hello-tidy-logo.svg"}
      alt={siteConfig.name}
      width={283}
      height={100}
      unoptimized
      className={cn("h-11 w-auto", className)}
    />
  );
}
