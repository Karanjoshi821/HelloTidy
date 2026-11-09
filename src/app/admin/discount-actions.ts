"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { failure } from "@/lib/admin-actions";
import { requireOwner } from "@/lib/auth/dal";
import {
  createDiscount,
  deleteDiscount,
  setDiscountActive,
  updateDiscount,
  type DiscountInput,
} from "@/lib/discounts/admin";
import {
  checkboxField,
  firstIssue,
  formObject,
  istDateTimeField,
  optionalIntField,
  optionalRupeesField,
  rupeesField,
  textField,
  uuidField,
} from "@/lib/form";

const discountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,30}$/, "Code: 3–30 letters, numbers or dashes, no spaces"),
    description: textField("Description shown to customers", 3, 120),
    type: z.enum(["percent", "flat"]),
    percent: z.string().trim(),
    amount: z.string().trim(),
    minOrder: z.union([z.literal("").transform(() => 0), rupeesField("Minimum order", { max: 1_00_000 })]),
    maxDiscount: optionalRupeesField("Maximum discount", { min: 1, max: 1_00_000 }),
    startsAt: istDateTimeField,
    endsAt: istDateTimeField,
    usageLimit: optionalIntField("Total uses", 1, 1_000_000),
    oncePerCustomer: checkboxField,
    active: checkboxField,
  })
  .transform((v, ctx): DiscountInput => {
    let value: number;
    if (v.type === "percent") {
      const pct = Number(v.percent);
      if (!/^\d{1,2}$/.test(v.percent) || pct < 1 || pct > 90) {
        ctx.addIssue({ code: "custom", message: "Percentage must be a whole number from 1 to 90", path: ["percent"] });
        return z.NEVER;
      }
      value = pct;
    } else {
      const amount = rupeesField("Amount off", { min: 1, max: 1_00_000 }).safeParse(v.amount);
      if (!amount.success) {
        ctx.addIssue({ code: "custom", message: firstIssue(amount.error), path: ["amount"] });
        return z.NEVER;
      }
      value = amount.data;
    }
    return {
      code: v.code,
      description: v.description,
      type: v.type,
      value,
      minOrder: v.minOrder,
      maxDiscount: v.type === "percent" ? v.maxDiscount : null,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      usageLimit: v.usageLimit,
      oncePerCustomer: v.oncePerCustomer,
      active: v.active,
    };
  });

function readDiscount(formData: FormData) {
  return discountSchema.safeParse({
    ...formObject(formData),
    oncePerCustomer: formData.get("oncePerCustomer"),
    active: formData.get("active"),
  });
}

export async function createDiscountAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = readDiscount(formData);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  let id: string;
  try {
    id = await createDiscount(parsed.data, user.email);
  } catch (error) {
    return failure(error, "Couldn't create the discount.");
  }
  redirect(`/admin/discounts/${id}?created=1`);
}

export async function updateDiscountAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const id = uuidField.safeParse(formData.get("id"));
  const parsed = readDiscount(formData);
  if (!id.success) return { ok: false, message: "Invalid request." };
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    await updateDiscount(id.data, parsed.data, user.email);
  } catch (error) {
    return failure(error, "Couldn't save the discount.");
  }
  refresh();
  return { ok: true, message: "Discount saved." };
}

export async function toggleDiscountAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const id = uuidField.safeParse(formData.get("id"));
  const active = z.enum(["true", "false"]).safeParse(formData.get("active"));
  if (!id.success || !active.success) return { ok: false, message: "Invalid request." };
  try {
    await setDiscountActive(id.data, active.data === "true", user.email);
  } catch (error) {
    return failure(error, "Couldn't update the discount.");
  }
  refresh();
  return { ok: true, message: active.data === "true" ? "Enabled." : "Disabled." };
}

export async function deleteDiscountAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const id = uuidField.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Invalid request." };
  try {
    await deleteDiscount(id.data, user.email);
  } catch (error) {
    return failure(error, "Couldn't delete the discount.");
  }
  redirect("/admin/discounts?deleted=1");
}
