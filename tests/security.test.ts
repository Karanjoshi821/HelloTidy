import { afterEach, describe, expect, it, vi } from "vitest";
import { generateOrderNumber, hmacSha256Hex, safeEqual } from "@/lib/security/crypto";
import { hashPassword, verifyPassword } from "@/lib/security/password";

describe("passwords", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("uses a unique salt per hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "plaintext")).toBe(false);
    expect(await verifyPassword("x", "scrypt$a$b$c$d$e")).toBe(false);
  });
});

describe("crypto helpers", () => {
  it("generates readable order numbers", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOrderNumber()).toMatch(/^HT-[2-9A-HJ-NP-Z]{6}$/);
    }
  });

  it("compares in constant time and handles length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("razorpay signatures", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("verifies checkout and webhook signatures", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_abc");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec_xyz");
    const { verifyCheckoutSignature, verifyWebhookSignature } = await import("@/lib/payments/razorpay");

    const signature = hmacSha256Hex("secret_abc", "order_1|pay_1");
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature })).toBe(true);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_2", signature })).toBe(false);

    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, hmacSha256Hex("whsec_xyz", body))).toBe(true);
    expect(verifyWebhookSignature(`${body} `, hmacSha256Hex("whsec_xyz", body))).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
  });
});
