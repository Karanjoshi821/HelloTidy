"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { sendContactAction, type ContactState } from "@/app/(site)/contact/actions";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { buttonClasses } from "./ui/button";
import { Field, Honeypot, inputClasses, TextArea, TextInput } from "./ui/field";

export function ContactForm() {
  const { state, onSubmit, pending } = useFormAction<ContactState>(sendContactAction, { status: "idle" });
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (state.status === "sent") {
    return (
      <div className="rounded-3xl bg-success-soft p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto mb-3 size-10 text-success" />
        <h2 className="text-xl font-bold">Message received</h2>
        <p className="mt-1 text-ink-soft">Thank you! We&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative space-y-4" noValidate>
      <Honeypot />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="name" error={errors.name}>
          <TextInput name="name" autoComplete="name" error={errors.name} required />
        </Field>
        <Field label="Mobile number" name="phone" error={errors.phone}>
          <TextInput
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            error={errors.phone}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" optional error={errors.email}>
          <TextInput name="email" type="email" autoComplete="email" error={errors.email} />
        </Field>
        <Field label="Topic" name="topic" error={errors.topic}>
          <select id="topic" name="topic" defaultValue="order" className={cn(inputClasses, "appearance-none")}>
            <option value="order">Help with an order</option>
            <option value="product">Product question</option>
            <option value="bulk">Bulk / business order</option>
            <option value="other">Something else</option>
          </select>
        </Field>
      </div>
      <Field label="Order number" name="orderNumber" optional error={errors.orderNumber}>
        <TextInput name="orderNumber" placeholder="HT-XXXXXX" autoCapitalize="characters" error={errors.orderNumber} />
      </Field>
      <Field label="Message" name="message" error={errors.message}>
        <TextArea name="message" rows={5} maxLength={2000} error={errors.message} required />
      </Field>
      <button type="submit" disabled={pending} className={buttonClasses("primary", "lg", "w-full sm:w-auto")}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : "Send message"}
      </button>
      {state.status === "error" && (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
