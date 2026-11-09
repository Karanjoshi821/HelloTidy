import { describe, expect, it } from "vitest";
import { matchState, normalizeIndianMobile } from "@/lib/india";
import { checkoutSchema, contactSchema, trackSchema } from "@/lib/validation";

const validCheckout = {
  checkoutId: "3f2b8a52-6f1e-4c55-9a8e-2d6e2b0f9c11",
  lines: [{ packId: "pack-25", qty: 1 }],
  paymentMethod: "cod" as const,
  name: "Priya Sharma",
  phone: "+91 98765 43210",
  email: "",
  address1: "Flat 12, Shanti Apartments, MG Road",
  address2: "",
  landmark: "",
  city: "Pune",
  state: "Maharashtra" as const,
  pincode: "411001",
  company: "",
};

describe("normalizeIndianMobile", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["09876543210", "9876543210"],
    ["919876543210", "9876543210"],
    ["98765-43210", "9876543210"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each(["12345", "5876543210", "98765432101", "abcdefghij", ""])("rejects %s", (input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
  });
});

describe("matchState", () => {
  it("maps India Post names onto our list", () => {
    expect(matchState("NCT of Delhi")).toBe("Delhi");
    expect(matchState("maharashtra")).toBe("Maharashtra");
    expect(matchState("Orissa")).toBe("Odisha");
    expect(matchState("Atlantis")).toBeNull();
  });
});

describe("checkoutSchema", () => {
  it("accepts a valid checkout and normalises fields", () => {
    const parsed = checkoutSchema.parse(validCheckout);
    expect(parsed.phone).toBe("9876543210");
    expect(parsed.email).toBeUndefined();
    expect(parsed.address2).toBeUndefined();
  });

  it("rejects bad pincode, phone, state and names", () => {
    expect(checkoutSchema.safeParse({ ...validCheckout, pincode: "011001" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...validCheckout, phone: "12345" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...validCheckout, state: "Atlantis" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...validCheckout, name: "<script>" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...validCheckout, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects the honeypot when filled", () => {
    expect(checkoutSchema.safeParse({ ...validCheckout, company: "Spam Inc" }).success).toBe(false);
  });

  it("rejects absurd quantities", () => {
    expect(checkoutSchema.safeParse({ ...validCheckout, lines: [{ packId: "pack-25", qty: 99 }] }).success).toBe(false);
  });
});

describe("other forms", () => {
  it("validates tracking input", () => {
    expect(trackSchema.parse({ orderNumber: "ht-7k3p9q", phone: "9876543210" }).orderNumber).toBe("HT-7K3P9Q");
    // Orders placed before the rename keep their MT- numbers and can still be tracked.
    expect(trackSchema.parse({ orderNumber: "mt-7k3p9q", phone: "9876543210" }).orderNumber).toBe("MT-7K3P9Q");
    expect(trackSchema.safeParse({ orderNumber: "12345", phone: "9876543210" }).success).toBe(false);
  });

  it("validates contact messages", () => {
    const ok = contactSchema.safeParse({
      name: "Ravi",
      phone: "9876543210",
      topic: "bulk",
      message: "Need 500 sponges for our hotel.",
    });
    expect(ok.success).toBe(true);
    expect(contactSchema.safeParse({ name: "Ravi", phone: "9876543210", topic: "bulk", message: "hi" }).success).toBe(
      false,
    );
  });
});
