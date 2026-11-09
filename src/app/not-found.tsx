import type { Metadata } from "next";
import Link from "next/link";
import { product } from "@/config/products";
import { SiteShell } from "@/components/site/shell";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <SiteShell>
      <div className="flex items-center justify-center px-4 py-24 text-center">
        <div>
          <p className="text-sm font-bold tracking-wide text-brand uppercase">404</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">We couldn&apos;t find that page</h1>
          <p className="mt-3 text-muted">It may have moved, or the link may be wrong.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={`/products/${product.slug}`} className={buttonClasses("primary", "lg")}>
              Shop sponges
            </Link>
            <Link href="/" className={buttonClasses("outline", "lg")}>
              Go home
            </Link>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
