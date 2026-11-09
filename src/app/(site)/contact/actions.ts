"use server";

import { after } from "next/server";
import { createContactMessage, TOPIC_LABELS } from "@/lib/contact/service";
import { notifyNewMessage } from "@/lib/notify";
import { rateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";
import { contactSchema, fieldErrors } from "@/lib/validation";

export type ContactState =
  { status: "idle" } | { status: "error"; message: string; fieldErrors?: Record<string, string> } | { status: "sent" };

export async function sendContactAction(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email") ?? undefined,
    topic: formData.get("topic"),
    orderNumber: formData.get("orderNumber") ?? undefined,
    message: formData.get("message"),
    company: formData.get("company") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }

  const ctx = await getRequestContext();
  const limit = await rateLimit(`contact:${ctx.ipHash}`, 5, 600);
  if (!limit.ok) return { status: "error", message: "You've sent several messages already. Please try again later." };

  try {
    await createContactMessage(parsed.data);
    after(() =>
      notifyNewMessage({
        name: parsed.data.name,
        topic: TOPIC_LABELS[parsed.data.topic],
        message: parsed.data.message,
      }),
    );
    return { status: "sent" };
  } catch (error) {
    console.error("[contact] failed:", error);
    return { status: "error", message: "Something went wrong. Please try again, or message us on WhatsApp." };
  }
}
