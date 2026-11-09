import { formatPaise } from "@/lib/money";
import { siteConfig } from "./site";

export type Faq = { q: string; a: string };

export const productFaqs: Faq[] = [
  {
    q: "How does a magic cleaning sponge work?",
    a: "It is made of melamine foam, which has a micro-fine, hard structure. When wet, it acts like a very soft eraser and lifts stains off the surface by gentle abrasion. That is why it works with just water.",
  },
  {
    q: "Do I need soap or any cleaning liquid?",
    a: "No. Clean water is enough for most stains. For very oily grime you can add a drop of dish soap, but it is usually not needed.",
  },
  {
    q: "Will it remove paint from my walls?",
    a: "It is safe on most washable, matte wall paints, but any abrasive can dull or lift soft or glossy paint. Always rub a small hidden spot first and use light pressure.",
  },
  {
    q: "How long does one sponge last?",
    a: "It wears down as it cleans, just like a pencil eraser. A sponge typically handles several cleaning sessions on small stains, and can be cut into smaller pieces so nothing goes to waste.",
  },
  {
    q: "Where should I not use it?",
    a: "Never on skin. Avoid car paint, glossy or polished finishes, non-stick pans, screens, spectacles, polished wood and high-gloss steel.",
  },
  {
    q: "Is it safe around children?",
    a: "Use it for cleaning only and store it out of reach of children and pets. It is not a toy and must not be chewed or swallowed.",
  },
];

/** Live settings the order FAQs quote: COD fee and limit (paise) from the database, and whether online payment is on. */
export type OrderFaqSettings = { codFee: number; codMaxOrderValue: number; onlinePayments: boolean };

/** Order FAQs quote the live COD settings, and only offer online payment when Razorpay is set up. */
export const orderFaqs = (cod: OrderFaqSettings): Faq[] => [
  {
    q: "Is Cash on Delivery available?",
    a: `Yes. COD is available across India on orders up to ${formatPaise(cod.codMaxOrderValue)}, ${
      cod.codFee > 0 ? `with a ${formatPaise(cod.codFee)} COD charge.` : "with no extra charge."
    }${
      !cod.onlinePayments
        ? ""
        : cod.codFee > 0
          ? " Pay online with UPI, card or netbanking and skip the charge."
          : " You can also pay online with UPI, card or netbanking."
    }`,
  },
  {
    q: "How much is delivery?",
    a: "Delivery is free on every order. No minimum order value.",
  },
  {
    q: "When will my order arrive?",
    a: `We dispatch within ${siteConfig.shipping.dispatch}. Delivery usually takes ${siteConfig.shipping.delivery}, depending on your pincode.`,
  },
  {
    q: "What if my order arrives damaged?",
    a: `Tell us within ${siteConfig.shipping.claimWindowDays} days of delivery with a photo and we will send a free replacement or a full refund, your choice.`,
  },
  {
    q: "Can I cancel my order?",
    a: "Yes, any time before it is dispatched. Message us on WhatsApp or use the contact page with your order number.",
  },
  {
    q: "How do I track my order?",
    a: "Use the Track Order page with your order number and phone number. Once dispatched, you will also see the courier tracking link there.",
  },
];

export const allFaqs = (cod: OrderFaqSettings): Faq[] => [...productFaqs, ...orderFaqs(cod)];
