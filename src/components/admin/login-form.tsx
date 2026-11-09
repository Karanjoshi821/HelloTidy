"use client";

import { Loader2 } from "lucide-react";
import { loginAction, type ActionResult } from "@/app/admin/actions";
import { useFormAction } from "@/lib/use-form-action";
import { buttonClasses } from "../ui/button";
import { Field, TextInput } from "../ui/field";

export function LoginForm({ next }: { next?: string }) {
  const { state, onSubmit, pending } = useFormAction<ActionResult>(loginAction, null);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" name="email">
        <TextInput name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" name="password">
        <TextInput name="password" type="password" autoComplete="current-password" required />
      </Field>
      <button type="submit" disabled={pending} className={buttonClasses("primary", "lg", "w-full")}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : "Sign in"}
      </button>
      {state && !state.ok && (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
