import Link from "next/link";
import type { ReactNode } from "react";
import { cacheLife } from "next/cache";
import { CookieSettingsButton } from "@/components/consent/cookie-settings-button";
import { product } from "@/config/products";
import { isPlaceholder, siteConfig } from "@/config/site";
import { Logo } from "./header";

const shopLinks = [
  { href: `/products/${product.slug}`, label: "Shop all packs" },
  { href: "/guides", label: "Cleaning guides" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About us" },
];

const helpLinks = [
  { href: "/track", label: "Track your order" },
  { href: "/contact", label: "Contact us" },
  { href: "/policies/shipping", label: "Shipping policy" },
  { href: "/policies/refund", label: "Cancellation & refunds" },
];

const legalLinks = [
  { href: "/policies/terms", label: "Terms & conditions" },
  { href: "/policies/privacy", label: "Privacy policy" },
];

/** Cached so the static shell can include it (Cache Components forbids raw Date in prerender). */
async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

const linkClass = "text-sm text-white/75 transition-colors hover:text-white";

function LinkColumn({
  title,
  links,
  extra,
}: {
  title: string;
  links: { href: string; label: string }[];
  extra?: ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={linkClass}>
              {link.label}
            </Link>
          </li>
        ))}
        {extra && <li>{extra}</li>}
      </ul>
    </div>
  );
}

export function Footer() {
  const { contact } = siteConfig;
  return (
    <footer className="bg-ink pb-24 text-white md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo onDark />
          <p className="mt-3 font-bold text-white">{siteConfig.tagline}</p>
          <p className="mt-1 max-w-xs text-sm text-white/75">{siteConfig.shortDescription}</p>
          <ul className="mt-4 space-y-1 text-sm text-white/75">
            {!isPlaceholder(contact.email) && (
              <li>
                <a href={`mailto:${contact.email}`} className="hover:text-white">
                  {contact.email}
                </a>
              </li>
            )}
            {!isPlaceholder(contact.phone) && (
              <li>
                <a href={`tel:+${contact.phone}`} className="hover:text-white">
                  {contact.phoneDisplay}
                </a>
              </li>
            )}
            <li>{contact.hours}</li>
          </ul>
        </div>
        <LinkColumn title="Shop" links={shopLinks} />
        <LinkColumn title="Help" links={helpLinks} />
        <LinkColumn title="Legal" links={legalLinks} extra={<CookieSettingsButton className={linkClass} />} />
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-white/75 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>
            © <CurrentYear /> {isPlaceholder(siteConfig.legalName) ? siteConfig.name : siteConfig.legalName}. All rights
            reserved.
            {siteConfig.gstin && <span className="ml-2">GSTIN: {siteConfig.gstin}</span>}
          </p>
          {/* Only a GST-registered seller may say prices include GST. */}
          <p>{siteConfig.gstin ? "Prices include GST." : "All prices are final."} Free delivery across India.</p>
        </div>
      </div>
    </footer>
  );
}
