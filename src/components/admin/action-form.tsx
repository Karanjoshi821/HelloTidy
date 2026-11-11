"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { toast, useResultToast } from "./toaster";

/** Form bound to an admin server action that returns { ok, message }. */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
  id,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  /** Asks for confirmation before submitting. */
  confirm?: string;
  /** Clears the fields after a successful submit (e.g. "add a comment"). */
  resetOnSuccess?: boolean;
  id?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, onSubmit, pending } = useFormAction<ActionResult>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result?.ok && resetOnSuccess) formRef.current?.reset();
    return result;
  }, null);
  useResultToast(state);
  return (
    <form
      ref={formRef}
      id={id}
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
    >
      {/* Layout classes go on the fieldset, so space-y / grid / flex apply to the fields themselves. */}
      <fieldset disabled={pending} className={cn("min-w-0", className)}>
        {children}
      </fieldset>
      {/* Errors also stay by the form, so it's clear what to fix; the toast announces them. */}
      {state && !state.ok && <p className="mt-2 text-sm whitespace-pre-line text-danger">{state.message}</p>}
      {state?.secret && <SecretBox value={state.secret} />}
    </form>
  );
}

/** A one-time value (e.g. a temporary password) with a copy button. */
export function SecretBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft p-3">
      <code className="flex-1 font-mono text-base font-bold break-all select-all">{value}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Copied to clipboard.");
          } catch {
            setCopied(false);
            toast.error("Couldn't copy. Select the text and copy it by hand.");
          }
        }}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold shadow-card"
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
