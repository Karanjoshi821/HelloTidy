import Link from "next/link";
import { Suspense } from "react";
import { Droplets, HandCoins, Menu, PackageCheck, RefreshCcw, ShieldCheck, Truck, type LucideIcon } from "lucide-react";
import { product } from "@/config/products";
import { siteConfig } from "@/config/site";
import { BrandLogo } from "../art";
import { CartButton } from "../cart/cart-button";
import { MobileMenu } from "./mobile-menu";

export const navLinks = [
  { href: `/products/${product.slug}`, label: "Shop" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/guides", label: "Cleaning guides" },
  { href: "/track", label: "Track order" },
  { href: "/contact", label: "Contact" },
];

export function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${siteConfig.name} home`}>
      <BrandLogo onDark={onDark} />
    </Link>
  );
}

function highlightsFor(onlinePayments: boolean): { icon: LucideIcon; text: string }[] {
  return [
    { icon: Truck, text: "Free delivery across India" },
    { icon: HandCoins, text: "Cash on Delivery available" },
    { icon: PackageCheck, text: `Dispatched within ${siteConfig.shipping.dispatch}` },
    { icon: RefreshCcw, text: `${siteConfig.shipping.claimWindowDays}-day replacement on damaged items` },
    ...(onlinePayments ? [{ icon: ShieldCheck, text: "Secure UPI, card & netbanking payments" }] : []),
    { icon: Droplets, text: "Works with just water, no chemicals" },
  ];
}

/**
 * Scrolling announcement bar. The moving track holds the list four times
 * (two identical halves) so it loops seamlessly on screens up to ~2,700px wide.
 * Pauses on hover; stands still for visitors who prefer reduced motion.
 */
export function AnnouncementBar({ onlinePayments }: { onlinePayments: boolean }) {
  const highlights = highlightsFor(onlinePayments);
  const half = [...highlights, ...highlights];
  return (
    <div className="marquee-bar relative overflow-hidden bg-ink text-[13px] font-medium text-white">
      <ul className="sr-only">
        {highlights.map((h) => (
          <li key={h.text}>{h.text}</li>
        ))}
      </ul>
      <div className="animate-marquee flex w-max" aria-hidden="true">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0 items-center">
            {half.map(({ icon: Icon, text }, i) => (
              <li key={`${copy}-${i}`} className="flex items-center gap-2 px-5 py-2 whitespace-nowrap">
                <Icon className="size-4 shrink-0 text-mint" strokeWidth={2.25} />
                {text}
                <span className="ml-5 size-1 rounded-full bg-white/40" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-1">
          <Suspense
            fallback={
              <span className="-ml-2 grid size-10 place-items-center md:hidden" aria-hidden="true">
                <Menu className="size-5" />
              </span>
            }
          >
            <MobileMenu links={navLinks} shopHref={`/products/${product.slug}`} />
          </Suspense>
          <Logo />
        </div>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-[15px] font-medium text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={`/products/${product.slug}`}
            className="hidden h-10 items-center rounded-full bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark sm:inline-flex"
          >
            Buy now
          </Link>
          <CartButton />
        </div>
      </div>
    </header>
  );
}
