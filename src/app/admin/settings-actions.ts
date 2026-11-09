"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { failure } from "@/lib/admin-actions";
import { requireAdmin, requireOwner } from "@/lib/auth/dal";
import { createStaff, resetStaffPassword, updateStaff } from "@/lib/auth/staff";
import { expireStorefront } from "@/lib/catalog/invalidate";
import { updateCustomer } from "@/lib/customers/admin";
import {
  checkboxField,
  firstIssue,
  formObject,
  optionalEmailField,
  optionalTextField,
  rupeesField,
  tagsField,
  textField,
  uuidField,
} from "@/lib/form";
import { updateCheckoutSettings } from "@/lib/settings";
import { emailSchema } from "@/lib/validation";

export async function updateCheckoutSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = z
    .object({
      codFee: rupeesField("COD charge", { min: 0, max: 500 }),
      codMaxOrderValue: rupeesField("COD limit", { min: 100, max: 1_00_000 }),
    })
    .safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    const { changed } = await updateCheckoutSettings(parsed.data, user.email);
    if (!changed) return { ok: true, message: "Nothing changed." };
  } catch (error) {
    return failure(error, "Couldn't save the settings.");
  }
  // Product page, checkout, FAQ and policies all quote these numbers.
  expireStorefront();
  refresh();
  return { ok: true, message: "Saved. Checkout, the product page and the policies now use the new values." };
}

const staffSchema = z.object({
  name: textField("Name", 2, 60),
  email: emailSchema,
  role: z.enum(["owner", "staff"]),
});

export async function createStaffAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = staffSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  try {
    const { tempPassword } = await createStaff(parsed.data, user);
    refresh();
    return {
      ok: true,
      message: `Added ${parsed.data.name}. Share this one-time password with them privately; it won't be shown again. They'll choose their own password when they first sign in.`,
      secret: tempPassword,
    };
  } catch (error) {
    return failure(error, "Couldn't add the staff member.");
  }
}

export async function updateStaffAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = z
    .object({ id: uuidField, name: textField("Name", 2, 60), role: z.enum(["owner", "staff"]), active: checkboxField })
    .safeParse({ ...formObject(formData), active: formData.get("active") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { id, ...input } = parsed.data;
  try {
    await updateStaff(id, input, user);
  } catch (error) {
    return failure(error, "Couldn't save.");
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function resetStaffPasswordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const id = uuidField.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Invalid request." };
  try {
    const { tempPassword } = await resetStaffPassword(id.data, user);
    refresh();
    return {
      ok: true,
      message:
        "Password reset and signed out everywhere. Share this one-time password privately; it won't be shown again.",
      secret: tempPassword,
    };
  } catch (error) {
    return failure(error, "Couldn't reset the password.");
  }
}

export async function updateCustomerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = z
    .object({
      id: uuidField,
      name: textField("Name", 2, 80),
      email: optionalEmailField,
      notes: optionalTextField("Notes", 2000),
      tags: tagsField,
      codBlocked: checkboxField,
    })
    .safeParse({ ...formObject(formData), codBlocked: formData.get("codBlocked") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const { id, ...input } = parsed.data;
  try {
    await updateCustomer(id, input, user.email);
  } catch (error) {
    return failure(error, "Couldn't save the customer.");
  }
  refresh();
  return { ok: true, message: "Saved." };
}
