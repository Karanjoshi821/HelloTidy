"use server";

import { refreshAdminView as refresh } from "@/lib/admin-refresh";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { failure } from "@/lib/admin-actions";
import { requireAdmin, requireOwner } from "@/lib/auth/dal";
import { adjustStock, createPack, deletePack, STOCK_REASONS, updatePack, type StockReason } from "@/lib/catalog/admin";
import { expireStorefront } from "@/lib/catalog/invalidate";
import { checkboxField, firstIssue, formObject, intField, optionalTextField, rupeesField, textField } from "@/lib/form";

const packSchema = z
  .object({
    name: textField("Name", 2, 40),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, "SKU: 2–40 letters, numbers and dashes"),
    count: intField("Pieces per pack", 1, 10_000),
    price: rupeesField("Price", { min: 1, max: 1_00_000 }),
    mrp: rupeesField("MRP", { min: 1, max: 1_00_000 }),
    badge: optionalTextField("Badge", 24),
    blurb: z.string().trim().max(80, "Short description: max 80 characters"),
    weightGrams: intField("Shipping weight", 1, 50_000),
    position: intField("Position", 0, 999),
    status: z.enum(["active", "hidden"]),
    trackInventory: checkboxField,
    lowStockThreshold: intField("Low-stock alert", 0, 100_000),
  })
  .refine((p) => p.price <= p.mrp, {
    message: "The price can't be higher than the MRP (Legal Metrology rules).",
    path: ["price"],
  });

function readPack(formData: FormData) {
  return packSchema.safeParse({ ...formObject(formData), trackInventory: formData.get("trackInventory") });
}

export async function createPackAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = readPack(formData);
  const stock = intField("Opening stock", 0, 1_000_000).safeParse(String(formData.get("stock") ?? "0") || "0");
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!stock.success) return { ok: false, message: firstIssue(stock.error) };
  let id: string;
  try {
    id = await createPack({ ...parsed.data, stock: stock.data }, user.email);
  } catch (error) {
    return failure(error, "Couldn't add the pack.");
  }
  expireStorefront();
  redirect(`/admin/products/${encodeURIComponent(id)}?created=1`);
}

export async function updatePackAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const id = z.string().min(1).max(60).safeParse(formData.get("id"));
  const parsed = readPack(formData);
  if (!id.success) return { ok: false, message: "Invalid request." };
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  let stock: { expected: number; value: number } | undefined;
  if (formData.has("stock")) {
    const value = intField("Available stock", -1_000_000, 1_000_000).safeParse(String(formData.get("stock")));
    const expected = intField("Stock", -1_000_000, 1_000_000).safeParse(String(formData.get("stockExpected")));
    if (!value.success) return { ok: false, message: firstIssue(value.error) };
    if (!expected.success) return { ok: false, message: "Invalid request." };
    stock = { expected: expected.data, value: value.data };
  }
  try {
    await updatePack(id.data, { ...parsed.data, stock }, user.email);
  } catch (error) {
    return failure(error, "Couldn't save the pack.");
  }
  expireStorefront();
  refresh();
  return { ok: true, message: "Saved. The store shows the change right away." };
}

export async function adjustStockAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = z
    .object({
      id: z.string().min(1).max(60),
      direction: z.enum(["add", "remove"]),
      quantity: intField("Quantity", 1, 1_000_000),
      reason: z.enum(Object.keys(STOCK_REASONS) as [StockReason, ...StockReason[]]),
      note: optionalTextField("Note", 200),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { id, direction, quantity, reason, note } = parsed.data;
  try {
    const { stock } = await adjustStock(
      id,
      { delta: direction === "add" ? quantity : -quantity, reason, note },
      user.email,
    );
    expireStorefront();
    refresh();
    return { ok: true, message: `Stock is now ${stock}.` };
  } catch (error) {
    return failure(error, "Couldn't adjust the stock.");
  }
}

export async function deletePackAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const id = z.string().min(1).max(60).safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Invalid request." };
  try {
    await deletePack(id.data, user.email);
  } catch (error) {
    return failure(error, "Couldn't delete the pack.");
  }
  expireStorefront();
  redirect("/admin/products?deleted=1");
}
