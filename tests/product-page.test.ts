import { describe, expect, it } from "vitest";
import { orderFaqs } from "@/config/faq";
import { siteConfig } from "@/config/site";
import { deliveryWindow, formatDeliveryDate, indiaDateKey } from "@/lib/delivery";

describe("delivery estimate", () => {
  it("uses India's date, not the visitor's", () => {
    // 20:00 UTC on Friday is already Saturday 01:30 in India.
    expect(indiaDateKey(new Date("2026-10-30T20:00:00Z"))).toBe("2026-10-31");
    expect(indiaDateKey(new Date("2026-10-30T10:00:00Z"))).toBe("2026-10-30");
  });

  it("counts working days and skips Sundays", () => {
    // Ordered Saturday 31 Oct: Sunday 1 Nov is skipped, so 3 working days is Wed 4 Nov and 7 is Mon 9 Nov.
    const { from, to } = deliveryWindow("2026-10-31", { min: 3, max: 7 });
    expect(formatDeliveryDate(from)).toBe("Wed, 4 Nov");
    expect(formatDeliveryDate(to)).toBe("Mon, 9 Nov");
  });

  it("never lands on a Sunday", () => {
    for (let day = 1; day <= 28; day++) {
      const key = `2026-02-${String(day).padStart(2, "0")}`;
      const { from, to } = deliveryWindow(key, siteConfig.shipping.deliveryDays);
      expect(from.getUTCDay()).not.toBe(0);
      expect(to.getUTCDay()).not.toBe(0);
    }
  });

  it("matches the delivery promise written elsewhere on the site", () => {
    const { min, max } = siteConfig.shipping.deliveryDays;
    expect(siteConfig.shipping.delivery).toBe(`${min}–${max} working days`);
  });
});

describe("payment wording", () => {
  const cod = { codFee: 4900, codMaxOrderValue: 300000 };

  it("doesn't offer online payment before Razorpay is set up", () => {
    const answer = orderFaqs({ ...cod, onlinePayments: false })[0].a;
    expect(answer).toContain("₹49 COD charge");
    expect(answer).not.toMatch(/UPI|online/);
  });

  it("offers online payment once it is", () => {
    expect(orderFaqs({ ...cod, onlinePayments: true })[0].a).toContain("Pay online with UPI");
    expect(orderFaqs({ ...cod, codFee: 0, onlinePayments: true })[0].a).toContain("no extra charge");
  });
});
