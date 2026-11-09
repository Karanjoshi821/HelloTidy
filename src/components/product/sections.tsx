import Image from "next/image";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  HandCoins,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { product } from "@/config/products";
import { siteConfig } from "@/config/site";
import type { Faq } from "@/config/faq";
import { getStorefront } from "@/lib/catalog/storefront";
import { lowestPerPiece } from "@/lib/catalog/types";
import { formatPaise } from "@/lib/money";
import { isRazorpayEnabled } from "@/lib/payments/razorpay";
import { cn } from "@/lib/utils";

export async function TrustStrip({ className }: { className?: string }) {
  const { codFee } = await getStorefront();
  // Only promise online payment once Razorpay is set up; until then COD is the only way to pay.
  const online = isRazorpayEnabled();
  const items: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: Truck, title: "Free delivery", text: "Across India, no minimum" },
    {
      icon: HandCoins,
      title: "Cash on Delivery",
      text: !online
        ? "Pay when it arrives"
        : codFee > 0
          ? `Or pay online & save ${formatPaise(codFee)}`
          : "Or pay online with UPI",
    },
    {
      icon: RefreshCcw,
      title: `${siteConfig.shipping.claimWindowDays}-day replacement`,
      text: "If damaged or defective",
    },
    online
      ? { icon: ShieldCheck, title: "Secure checkout", text: "UPI, cards, netbanking" }
      : { icon: PackageCheck, title: "Dispatched fast", text: `Within ${siteConfig.shipping.dispatch}` },
  ];
  return (
    <ul className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex items-start gap-3 rounded-2xl bg-surface p-4">
          <Icon className="mt-0.5 size-5 shrink-0 text-brand" />
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className="text-xs text-muted">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function UseCases() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {product.useCases.map((useCase) => (
        <li key={useCase.title} className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
          <Image
            src={useCase.image}
            alt={`Cleaning ${useCase.title.toLowerCase()} with a magic sponge`}
            width={1024}
            height={768}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 50vw"
            className="aspect-[4/3] w-full object-cover"
          />
          <div className="p-4 sm:p-5">
            <h3 className="font-bold sm:text-lg">{useCase.title}</h3>
            <p className="mt-1 text-sm text-muted sm:text-base">{useCase.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function HowItWorks() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {product.howToUse.map((step, i) => (
        <li key={step.title} className="flex overflow-hidden rounded-3xl bg-surface md:block">
          <div className="relative w-28 shrink-0 md:w-auto">
            <Image
              src={step.image}
              alt={step.title}
              width={1024}
              height={768}
              sizes="(min-width: 768px) 360px, 112px"
              className="h-full w-full object-cover md:aspect-[16/10] md:h-auto"
            />
            <span className="absolute top-2 left-2 grid size-7 place-items-center rounded-full bg-brand text-sm font-extrabold text-white shadow-lg md:top-3 md:left-3 md:size-9 md:text-base">
              {i + 1}
            </span>
          </div>
          <div className="p-4 sm:p-5 md:p-6">
            <h3 className="text-lg font-bold">{step.title}</h3>
            <p className="mt-1 text-muted">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AvoidList() {
  return (
    <div className="rounded-3xl border border-warn/25 bg-warn-soft p-6 sm:p-8">
      <div className="mb-4 flex items-center gap-3">
        <TriangleAlert className="size-6 text-warn" />
        <h3 className="text-lg font-bold">Where not to use it</h3>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {product.avoid.map((item) => (
          <li key={item} className="flex items-start gap-2 text-ink-soft">
            <X className="mt-1 size-4 shrink-0 text-warn" />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-soft">{product.avoidNote}</p>
      <Link
        href="/guides/how-to-use-magic-eraser-sponge"
        className="mt-3 inline-block text-sm font-bold text-brand hover:underline"
      >
        Read the full how-to guide →
      </Link>
    </div>
  );
}

export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="divide-y divide-line rounded-3xl border border-line bg-white">
      {faqs.map((faq) => (
        <details key={faq.q} className="group px-5 sm:px-6">
          <summary className="flex items-center justify-between gap-4 py-5 font-semibold">
            {faq.q}
            <ChevronDown className="chevron size-5 shrink-0 text-muted transition-transform" />
          </summary>
          <p className="-mt-1 pb-5 text-muted">{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

export function SpecsTable() {
  const d = product.declarations;
  const rows: { label: string; value: string }[] = [
    ...product.specs,
    { label: "Generic name", value: d.genericName },
    { label: "Net quantity", value: d.netQuantityNote },
    { label: "Manufacturer / importer", value: d.manufacturerOrImporter },
    { label: "Country of origin", value: d.countryOfOrigin },
    { label: "MRP", value: "As shown for each pack (inclusive of all taxes)" },
    {
      label: "Consumer care",
      value: `${siteConfig.contact.email} · ${siteConfig.contact.phoneDisplay}`,
    },
  ];
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-3xl border border-line">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 bg-white px-5 py-3 text-sm">
          <dt className="font-semibold">{row.label}</dt>
          <dd className="text-muted">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Hello Tidy against the usual cloth-and-cleaner routine. The last row is where
 * Hello Tidy loses on purpose: saying where it doesn't work is what makes the rest
 * believable, and it heads off returns.
 */
export async function CompareTable() {
  const each = lowestPerPiece(await getStorefront());
  const rows: { label: string; ours: string; usual: string; oursWins: boolean }[] = [
    {
      label: "Crayon, pen and scuff marks",
      ours: "Lift off with water",
      usual: "Smear, or need hard scrubbing",
      oursWins: true,
    },
    { label: "Chemicals", ours: "None, just water", usual: "Detergent or a strong cleaner", oursWins: true },
    { label: "Effort", ours: "A light rub, a few minutes", usual: "Scrubbing, often twice", oursWins: true },
    { label: "Corners and grooves", ours: "Cut it to any size", usual: "Hard to reach", oursWins: true },
    {
      label: "Cost",
      ours: each !== null ? `From ${formatPaise(each)} a sponge` : "A few rupees a clean",
      usual: "Cleaner bottles add up",
      oursWins: true,
    },
    {
      label: "Glossy finishes, non-stick, skin",
      ours: "Not suitable, see below",
      usual: "Usually fine",
      oursWins: false,
    },
  ];
  const mark = (good: boolean) => (
    <>
      {good ? (
        <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} aria-hidden="true" />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={3} aria-hidden="true" />
      )}
      <span className="sr-only">{good ? "Better: " : "Worse: "}</span>
    </>
  );
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
      <table className="w-full text-left text-sm sm:text-base">
        <caption className="sr-only">Hello Tidy sponge compared with a cloth and cleaner</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="w-[30%] p-3 sm:p-5">
              <span className="sr-only">Compared on</span>
            </th>
            <th scope="col" className="bg-brand-soft/60 p-3 font-extrabold text-brand-dark sm:p-5">
              Hello Tidy sponge
            </th>
            <th scope="col" className="p-3 font-bold text-muted sm:p-5">
              Cloth + cleaner
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="p-3 align-top font-semibold sm:p-5">
                {r.label}
              </th>
              <td className="bg-brand-soft/60 p-3 align-top sm:p-5">
                <span className="flex items-start gap-1.5 font-semibold">
                  {mark(r.oursWins)}
                  {r.ours}
                </span>
              </td>
              <td className="p-3 align-top text-muted sm:p-5">
                <span className="flex items-start gap-1.5">
                  {mark(!r.oursWins)}
                  {r.usual}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Last nudge at the bottom of the product page, back up to the pack picker. */
export async function FinalCta() {
  const storefront = await getStorefront();
  const available = storefront.packs.filter((p) => p.available);
  if (!available.length) return null;
  const from = Math.min(...available.map((p) => p.price));
  return (
    <div className="rounded-[2rem] bg-ink px-6 py-10 text-center text-white sm:px-12 sm:py-14">
      <p className="text-sm font-semibold tracking-wide text-mint uppercase">{product.tagline}</p>
      <h2 className="mt-2 text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">
        Those marks have had their day.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-white/75">
        Packs from {formatPaise(from)} with free delivery and Cash on Delivery. Free replacement if anything arrives
        damaged.
      </p>
      <a
        href="#choose-pack"
        className="mt-6 inline-flex h-13 items-center justify-center rounded-full bg-mint px-8 text-base font-extrabold text-ink transition-transform hover:scale-[1.02]"
      >
        Choose your pack
      </a>
    </div>
  );
}
