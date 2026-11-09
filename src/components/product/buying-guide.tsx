import Link from "next/link";
import { product } from "@/config/products";
import { siteConfig, whatsappLink } from "@/config/site";

export function BuyingGuide() {
  const whatsapp = whatsappLink("Hi, I have a question about the magic cleaning sponge.");
  return (
    <aside className="mt-5 rounded-2xl border border-line p-4 text-sm" aria-label="Before you order">
      <h2 className="font-bold">Is it right for your home?</h2>
      <ul className="mt-2 space-y-2 text-ink-soft">
        <li>
          <strong>For:</strong> scuffs, crayon and grime on suitable hard surfaces.
        </li>
        <li>
          <strong>How:</strong> wet, squeeze and rub gently. Test a hidden spot first.
        </li>
        <li>
          <strong>Not for:</strong> skin, screens, non-stick cookware or glossy finishes.
        </li>
        <li>
          <strong>What to expect:</strong> the foam wears down as it cleans; it isn’t a permanent sponge.
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted">
        Material: melamine foam · {product.specs.find((spec) => spec.label === "Size (each)")?.value} each
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-semibold text-brand">
        <Link href="/contact" className="underline underline-offset-4">
          Ask before buying
        </Link>
        {whatsapp && (
          <a href={whatsapp} className="underline underline-offset-4">
            WhatsApp us
          </a>
        )}
        <a href="#product-faq" className="underline underline-offset-4">
          Product questions
        </a>
      </div>
    </aside>
  );
}

export function OrderSteps() {
  const steps = [
    { title: "Choose your pack", text: "Compare the pack total and price per sponge. Pick the quantity you need." },
    { title: "Review & order", text: "Check your address, payment method and final total before placing your order." },
    {
      title: "Track your delivery",
      text: `Dispatch within ${siteConfig.shipping.dispatch}. Use your order number and phone to track progress.`,
    },
  ];
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.title} className="rounded-2xl border border-line bg-white p-5">
          <span className="text-sm font-bold text-brand">0{index + 1}</span>
          <h3 className="mt-2 font-bold">{step.title}</h3>
          <p className="mt-2 text-sm text-muted">{step.text}</p>
          {index === 2 && (
            <Link
              href="/track"
              className="mt-3 inline-block text-sm font-semibold text-brand underline underline-offset-4"
            >
              Track an order
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}
