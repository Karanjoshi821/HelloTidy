import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClasses =
  "block h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink placeholder:text-muted/70 transition-colors outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10 disabled:bg-surface";

export function Field({
  label,
  name,
  error,
  hint,
  optional,
  className,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-muted">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  name,
  error,
  className,
  ...props
}: ComponentProps<"input"> & { name: string; error?: string }) {
  return (
    <input
      id={name}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cn(inputClasses, className)}
      {...props}
    />
  );
}

export function TextArea({
  name,
  error,
  className,
  ...props
}: ComponentProps<"textarea"> & { name: string; error?: string }) {
  return (
    <textarea
      id={name}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${name}-error` : undefined}
      className={cn(inputClasses, "h-auto min-h-32 py-3", className)}
      {...props}
    />
  );
}

/** Off-screen field that only bots fill in. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Company
        <input type="text" name="company" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
