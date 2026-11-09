import "server-only";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { contactMessages } from "../db/schema";
import type { ContactData } from "../validation";

export const TOPIC_LABELS: Record<ContactData["topic"], string> = {
  order: "Order help",
  bulk: "Bulk / business order",
  product: "Product question",
  other: "Other",
};

export async function createContactMessage(data: ContactData): Promise<void> {
  const db = await getDb();
  await db.insert(contactMessages).values({
    name: data.name,
    phone: data.phone,
    email: data.email ?? null,
    topic: data.topic,
    orderNumber: data.orderNumber ?? null,
    message: data.message,
  });
}

export async function listContactMessages(status: "new" | "handled" | "all" = "new") {
  const db = await getDb();
  return db
    .select()
    .from(contactMessages)
    .where(status === "all" ? undefined : eq(contactMessages.status, status))
    .orderBy(desc(contactMessages.createdAt))
    .limit(200);
}

export async function setContactMessageStatus(id: string, status: "new" | "handled"): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const db = await getDb();
  await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id));
}

export async function countNewMessages(): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, "new"));
  return Number(n);
}
