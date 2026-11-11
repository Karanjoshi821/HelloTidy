import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "onDark" | "whatsapp";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark shadow-lift",
  secondary: "bg-ink text-white hover:bg-ink-soft",
  outline: "border border-line bg-white text-ink hover:border-ink/30 hover:bg-surface",
  ghost: "text-ink hover:bg-surface",
  // On a dark green band (forest-band.tsx), where the ink button would disappear.
  onDark: "bg-mint text-ink hover:bg-white",
  // Darker than WhatsApp's own green so white text passes WCAG AA (5.1:1).
  whatsapp: "bg-[#0d7f47] text-white hover:bg-[#0a6b3c]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-7 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
