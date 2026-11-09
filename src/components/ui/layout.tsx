import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("py-14 sm:py-20", className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("mb-10 max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className="mb-2 text-sm font-semibold tracking-wide text-brand uppercase">{eyebrow}</p>}
      <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 text-lg text-pretty text-muted">{description}</p>}
    </div>
  );
}

export function Badge({
  tone = "brand",
  className,
  children,
}: {
  tone?: "brand" | "mint" | "sun" | "success" | "neutral" | "danger" | "warn";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    brand: "bg-brand-soft text-brand-dark",
    mint: "bg-mint text-ink",
    sun: "bg-sun text-ink",
    success: "bg-success-soft text-success",
    neutral: "bg-surface text-ink-soft",
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
